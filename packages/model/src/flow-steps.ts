// The run's flow: Think → You → a column per sprint → Check → Ship. Every step but the sprint
// waves is one entry in FLOW_STEPS: its id, column, label, and a reader that takes its state and
// detail from the repo model (and the pipeline already built from it). To add a step, add one entry
// and its reader's test; to remove one, delete its entry. A reader that returns nothing leaves its
// step out (Replied go on an autopilot run, Staging → main with no staging branch); a column with no
// steps is left out. The waves come from the sprint docs, as `buildPipeline` reads them.
// Rule: a step is `done` only on data that proves it; with nothing to read it is `unknown` ("not recorded").
// Pure. The rules and why are in pod-docs/feature-details/runs-and-pipeline.md.

import type { AgentRun, BoardRepo, PrStatus } from './board.ts'
import { buildPipeline, handBackPr, isRunning, prByBranch, spend, type Pipeline, type Stage, type Step, type StepState } from './pipeline.ts'
import type { PlanModel } from './run-model.ts'

export type FlowColumnKey = 'think' | 'you' | 'check' | 'ship'
/** What a reader finds. `merge` is never set here: the Next step card owns Merge. */
export type FlowReading = { state: StepState; detail: string }
export type FlowCtx = { repo: BoardRepo; plan: PlanModel; now: number; pipeline: Pipeline }
export type FlowStepDef = { id: string; column: FlowColumnKey; label: string; read: (ctx: FlowCtx) => FlowReading | undefined }

/** The columns in order; `sprints` stands for one column per sprint. */
const COLUMNS: ({ key: FlowColumnKey; caption: string } | 'sprints')[] = [
  { key: 'think', caption: 'Think' },
  { key: 'you', caption: 'You' },
  'sprints',
  { key: 'check', caption: 'Check' },
  { key: 'ship', caption: 'Ship' },
]

const NOT_RECORDED: FlowReading = { state: 'unknown', detail: 'not recorded' }
const STAGING = /staging/i

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

/** A step `buildPipeline` already reads, by its key, as a reading; undefined when the pipeline has none. */
const fromPipeline =
  (key: string) =>
  ({ pipeline }: FlowCtx): FlowReading | undefined => {
    const step = pipeline.stages.flatMap((s) => s.steps).find((s) => s.key === key)
    return step && { state: step.state, detail: step.detail }
  }

/** The plan's researchers: `pod:researcher` agents dispatched with this plan. */
const researchersOf = (ctx: FlowCtx): AgentRun[] => ctx.repo.agents.filter((a) => a.type === 'pod:researcher' && a.plan === ctx.plan.slug)

/**
 * Done with a report: `pod-docs/research/<plan>.md`, or one the plan doc links that exists. Detail: the
 * plan's researchers and their active minutes, else "report". No report: running while a researcher
 * runs, `not recorded` for a link to a missing report, else skipped.
 */
function readResearch(ctx: FlowCtx): FlowReading {
  const reports = new Set(ctx.repo.model.research ?? [])
  const links = ctx.plan.researchLinks ?? []
  const agents = researchersOf(ctx).map((a) => ({ a, live: isRunning(a, ctx.now) }))
  const { minutes } = spend(agents, ctx.now)
  const who = (soFar: boolean) => `${plural(agents.length, 'researcher')}${minutes === undefined ? '' : ` · ${minutes} min${soFar ? ' so far' : ''}`}`
  if (reports.has(ctx.plan.slug) || links.some((l) => reports.has(l))) return { state: 'done', detail: agents.length > 0 ? who(false) : 'report' }
  if (agents.some((x) => x.live)) return { state: 'live', detail: who(true) }
  if (links.length > 0) return NOT_RECORDED
  return { state: 'skipped', detail: 'no research' }
}

/** Done when the plan doc records `Grilled-with:`. pod records no question count, so the detail is the tool. */
function readInterview({ plan }: FlowCtx): FlowReading {
  return plan.grilledWith === undefined ? NOT_RECORDED : { state: 'done', detail: `grilled with ${plan.grilledWith}` }
}

/** Done with a `## Look` that says something; skipped with no Look or one that says no UI; an empty Look proves nothing. */
function readLook({ plan }: FlowCtx): FlowReading {
  const look = plan.look
  if (!look || look.kind === 'none') return { state: 'skipped', detail: 'no UI' }
  if (look.kind === 'empty') return NOT_RECORDED
  return { state: 'done', detail: look.direction ?? 'look set' }
}

/** The plan's final PR: the hand-back's PR when gh knows it, else the PR gh found on the plan's branch. */
function finalPr(repo: Pick<BoardRepo, 'prs'>, plan: PlanModel): PrStatus | undefined {
  const n = handBackPr(plan)
  return (n === undefined ? undefined : repo.prs.find((p) => p.number === n)) ?? prByBranch(repo, plan.slug)
}

/** The plan's staging branch: its final PR's base when that is a staging branch, else the repo's decision. */
function stagingOf(repo: Pick<BoardRepo, 'model' | 'prs'>, plan: PlanModel): string | undefined {
  const base = finalPr(repo, plan)?.base
  if (base !== undefined && STAGING.test(base)) return base
  return repo.model.staging
}

/**
 * Left out with no staging branch. Waits until the final PR merges; then the staging branch's PR to
 * main (found by its head). An open one always counts and needs you: pod's gate 7 opens it, or reuses
 * one an earlier plan left open (so its number can be below the final PR's). pod-staging is reused by
 * every plan, so a merged one counts as done only when gh's merge times show it merged after the final
 * PR; a merged PR with no times, or a closed one, can't be shown to be this plan's and reads `not open yet`.
 */
function readStaging(ctx: FlowCtx): FlowReading | undefined {
  const branch = stagingOf(ctx.repo, ctx.plan)
  if (branch === undefined) return undefined
  const final = finalPr(ctx.repo, ctx.plan)
  const shipped = fromPipeline('final-pr')(ctx)?.state === 'done'
  if (!shipped) return { state: 'wait', detail: 'after the final PR' }
  const pr = prByBranch(ctx.repo, branch)
  if (pr?.state === 'open') return { state: 'you', detail: `PR #${pr.number} · you merge` }
  const after = pr?.state === 'merged' && pr.mergedAt !== undefined && final?.mergedAt !== undefined && pr.mergedAt > final.mergedAt
  if (pr && after) return { state: 'done', detail: `merged PR #${pr.number}` }
  return { state: 'wait', detail: 'not open yet' }
}

/** The flow's steps, in order within each column. */
export const FLOW_STEPS: FlowStepDef[] = [
  { id: 'research', column: 'think', label: 'Research', read: readResearch },
  { id: 'interview', column: 'think', label: 'Plan interview', read: readInterview },
  { id: 'look', column: 'you', label: 'Look picked', read: readLook },
  // Autopilot records no Go: the pipeline has no Go step, so this reads nothing and drops out.
  { id: 'go', column: 'you', label: 'Replied go', read: fromPipeline('go') },
  { id: 'review', column: 'check', label: 'Final review', read: fromPipeline('review') },
  { id: 'fix', column: 'check', label: 'Fix pass', read: fromPipeline('fix') },
  { id: 'final-pr', column: 'ship', label: 'Final PR', read: fromPipeline('final-pr') },
  { id: 'staging', column: 'ship', label: 'Staging → main', read: readStaging },
]

/** The plan's flow as stages; undefined for a plan the repo doesn't have. `steps` is the registry (tests pass their own). */
export function buildFlow(repo: BoardRepo, planSlug: string, now: number, steps: FlowStepDef[] = FLOW_STEPS): Stage[] | undefined {
  const plan = repo.model.plans.find((p) => p.slug === planSlug)
  const pipeline = plan && buildPipeline(repo, planSlug, now)
  if (!plan || !pipeline) return undefined
  const ctx: FlowCtx = { repo, plan, now, pipeline }
  return COLUMNS.flatMap((col): Stage[] => {
    if (col === 'sprints') return pipeline.stages.filter((s) => s.key.startsWith('sprint:'))
    const found = steps
      .filter((d) => d.column === col.key)
      .flatMap((d): Step[] => {
        const r = d.read(ctx)
        return r ? [{ key: d.id, label: d.label, state: r.state, detail: r.detail }] : []
      })
    return found.length > 0 ? [{ key: col.key, caption: col.caption, steps: found }] : []
  })
}

/**
 * The staging branches gh is asked about, by head: per plan that has reached its final PR (a hand-back,
 * every sprint done, or a final PR found), its staging branch. Each once.
 */
export function stagingBranches(repo: Pick<BoardRepo, 'model' | 'prs' | 'claims'>): string[] {
  const out = new Set<string>()
  for (const plan of repo.model.plans) {
    const atFinal =
      handBackPr(plan) !== undefined ||
      finalPr(repo, plan) !== undefined ||
      (plan.status !== 'archived' && plan.status !== 'done' && plan.sprints.length > 0 && plan.sprints.every((s) => s.status === 'done'))
    const branch = atFinal ? stagingOf(repo, plan) : undefined
    if (branch !== undefined) out.add(branch)
  }
  return [...out]
}

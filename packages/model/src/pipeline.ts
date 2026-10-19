// The pipeline view of one plan: where it is, step by step (Plan → each sprint's
// waves → Check → Ship), and the slice log with each slice's time and tokens.
// Also the join rules the runs list shares: which agents belong to a plan, to
// which slice, wave fix, review round, or fix pass, and the plan's hand-back
// and halt. Pure. The rules and why are in pod-docs/feature-details/runs-and-pipeline.md.

import type { AgentRun, BoardRepo } from './board.ts'
import { formatTokens, isDone } from './pod-flow/model.ts'
import type { PlanModel, SliceModel, SprintModel, WaveModel } from './run-model.ts'
import { agentState } from './transcript.ts'

export type StepState = 'done' | 'live' | 'wait' | 'you' | 'blocked' | 'unknown'
export type Step = { key: string; label: string; state: StepState; detail: string }
export type Stage = { key: string; caption: string; steps: Step[] }
export type LogRow = { code: string; title: string; model?: string; confidence?: string; minutes?: number; tokens?: number; live: boolean }
export type LogGroup = { sprint: string; wave: number; label: string; status: string; rows: LogRow[] }
export type Pipeline = { stages: Stage[]; log: LogGroup[] }

// ---- Shared join rules (the sprint's shared contract) ----

const HAND_BACK = /complete|final PR|hand-?back|awaiting/i
const FROM_ORCHESTRATOR = /^orchestrator\b/i
const WAVE_FIX = /^(.+)-w(\d+)-fix$/

/** The plan's hand-back PR: from the last pending orchestrator entry that hands back and links `/pull/<N>`. */
export function handBackPr(plan: Pick<PlanModel, 'queue'>): number | undefined {
  const entry = plan.queue
    .filter((e) => e.isPending && FROM_ORCHESTRATOR.test(e.route.trim()) && HAND_BACK.test(e.body) && /\/pull\/\d+/.test(e.body))
    .at(-1)
  const n = entry && /\/pull\/(\d+)/.exec(entry.body)?.[1]
  return n === undefined ? undefined : Number(n)
}

/** A hand-back still waiting on you: there is one, and `prs` doesn't say its PR merged. */
export function pendingHandBack(repo: Pick<BoardRepo, 'prs'>, plan: Pick<PlanModel, 'queue'>): number | undefined {
  const n = handBackPr(plan)
  return n !== undefined && repo.prs.find((p) => p.number === n)?.state !== 'merged' ? n : undefined
}

/** A pending BLOCKED entry from the orchestrator halts the plan. */
export const isHalted = (plan: Pick<PlanModel, 'queue'>) =>
  plan.queue.some((e) => e.isPending && e.type === 'BLOCKED' && FROM_ORCHESTRATOR.test(e.route.trim()))

/** A blocked or skipped slice, by its status or its PR cell. */
export const isBlockedSlice = (s: SliceModel) =>
  s.status === 'blocked' || s.status === 'skipped' || s.pr.state === 'blocked' || s.pr.state === 'skipped'

/** The ported `isDone`, on a slice of the run model: a blocked or skipped status wins over a merged PR. */
export const isSliceDone = (s: SliceModel) =>
  isDone({ wave: 0, slice: s.code, title: s.title, branch: s.branch, status: s.status, confidence: s.confidence, pr: s.pr.state === 'merged' ? 'merged' : '—' })

const isType = (a: AgentRun, role: string) => new RegExp(`(^|:)${role}$`).test(a.type)

export type AgentRole =
  | { kind: 'review' }
  | { kind: 'fix-pass' }
  | { kind: 'wave-fix'; sprint: string; wave: number }
  | { kind: 'slice'; sprint: string; code: string }
  | { kind: 'other' }

const hasCode = (s: SprintModel, code: string) => s.waves.some((w) => w.slices.some((x) => x.code === code))

/** What an agent does for a plan: a review round, the fix pass, a wave's fix, a slice, or nothing of it. */
export function roleOf(a: AgentRun, plan: PlanModel): AgentRole {
  if (isType(a, 'reviewer')) return a.plan === plan.slug ? { kind: 'review' } : { kind: 'other' }
  const branch = a.branch ?? ''
  if (isType(a, 'engineer')) {
    if (branch === `${plan.slug}-fix`) return { kind: 'fix-pass' }
    const fix = WAVE_FIX.exec(branch)
    if (fix?.[1] && plan.sprints.some((s) => s.slug === fix[1])) return { kind: 'wave-fix', sprint: fix[1], wave: Number(fix[2]) }
  }
  if (a.slice) {
    const code = a.slice
    const sprint = a.sprint ? plan.sprints.find((s) => s.slug === a.sprint && hasCode(s, code)) : plan.sprints.find((s) => hasCode(s, code))
    if (sprint) return { kind: 'slice', sprint: sprint.slug, code }
  }
  return { kind: 'other' }
}

/** An agent belongs to a plan by its plan slug, one of its sprints, or a role in it. */
export const isPlanAgent = (a: AgentRun, plan: PlanModel) =>
  a.plan === plan.slug || plan.sprints.some((s) => s.slug === a.sprint) || roleOf(a, plan).kind !== 'other'

export const isRunning = (a: AgentRun, now: number) => agentState(a, now) === 'running'

/** A running sprint planner that names the plan. */
export const isDrafting = (agents: AgentRun[], plan: PlanModel, now: number) =>
  agents.some((a) => isType(a, 'sprint-planner') && a.plan === plan.slug && isRunning(a, now))

// ---- The pipeline ----

type Ctx = { repo: BoardRepo; plan: PlanModel; now: number; agents: { a: AgentRun; role: AgentRole; live: boolean }[] }

/** The plan's pipeline stages and slice log; undefined for a plan the repo doesn't have. Never throws. */
export function buildPipeline(repo: BoardRepo, planSlug: string, now: number): Pipeline | undefined {
  const plan = repo.model.plans.find((p) => p.slug === planSlug)
  if (!plan) return undefined
  const ctx: Ctx = { repo, plan, now, agents: repo.agents.map((a) => ({ a, role: roleOf(a, plan), live: isRunning(a, now) })) }
  const n = plan.sprints.length
  const stages: Stage[] = [
    {
      key: 'plan',
      caption: 'Plan',
      steps: [
        { key: 'plan', label: 'Plan', state: 'done', detail: count(n, 'sprint') },
        { key: 'go', label: 'Go', state: 'unknown', detail: 'not recorded yet' },
      ],
    },
    ...plan.sprints.map((s, i) => ({ key: `sprint:${s.slug}`, caption: `Sprint ${i + 1} of ${n}`, steps: sprintSteps(ctx, s) })),
    { key: 'check', caption: 'Check', steps: checkSteps(ctx) },
    { key: 'ship', caption: 'Ship', steps: [shipStep(ctx)] },
  ]
  const log = plan.sprints.flatMap((s, i) => (s.hasDoc ? s.waves.map((w) => logGroup(ctx, s, i, w)) : []))
  return { stages, log }
}

const plural = (n: number, word: string) => (n === 1 ? word : word.endsWith('s') ? `${word}es` : `${word}s`)
const count = (n: number, word: string) => `${n} ${plural(n, word)}`

function sprintSteps(ctx: Ctx, s: SprintModel): Step[] {
  const one = (state: StepState, detail: string): Step[] => [{ key: s.slug, label: s.slug, state, detail }]
  if (s.status === 'done') return one('done', s.hasDoc ? count(s.waves.length, 'wave') : 'done')
  if (s.slug === ctx.plan.currentSprint && s.waves.length > 0) {
    return s.waves.map((w) => {
      const state = waveState(ctx, s, w)
      return { key: `${s.slug}/wave-${w.wave}`, label: `Wave ${w.wave}`, state, detail: waveDetail(ctx, s, w, state) }
    })
  }
  if (s.slug === ctx.plan.currentSprint && isDrafting(ctx.repo.agents, ctx.plan, ctx.now)) return one('live', 'drafting')
  const slices = s.waves.reduce((k, w) => k + w.slices.length, 0)
  return one('wait', slices > 0 ? `${count(slices, 'slice')} planned` : 'not drafted')
}

function waveAgents(ctx: Ctx, s: SprintModel, w: WaveModel) {
  const codes = new Set(w.slices.map((x) => x.code))
  return ctx.agents.filter(
    ({ role }) =>
      (role.kind === 'slice' && role.sprint === s.slug && codes.has(role.code)) ||
      (role.kind === 'wave-fix' && role.sprint === s.slug && role.wave === w.wave),
  )
}

function sliceAgents(ctx: Ctx, s: SprintModel, code: string) {
  return ctx.agents.filter(({ role }) => role.kind === 'slice' && role.sprint === s.slug && role.code === code)
}

/**
 * Wave step state, first match wins: blocked → done → you → live → wait.
 * A done wave reads done even with a pending ask for the human, and only an ask
 * naming one of its unfinished slices makes a wave `you`, so it agrees with its cards.
 */
function waveState(ctx: Ctx, s: SprintModel, w: WaveModel): StepState {
  if (w.slices.some(isBlockedSlice)) return 'blocked'
  if (w.slices.every(isSliceDone)) return 'done'
  const open = new Set(w.slices.filter((x) => !isSliceDone(x)).map((x) => x.code))
  const asks = ctx.plan.queue.some((e) => e.needsYou && e.slice !== undefined && open.has(e.slice) && (e.sprint === undefined || e.sprint === s.slug))
  if (asks) return 'you'
  return isWaveLive(ctx, s, w) ? 'live' : 'wait'
}

/** The current wave of the current sprint, a pushed slice, or one of the wave's engineers running. */
function isWaveLive(ctx: Ctx, s: SprintModel, w: WaveModel): boolean {
  const current = s.slug === ctx.plan.currentSprint && s.currentWave === w.wave
  return current || w.slices.some((x) => x.status === 'pushed') || waveAgents(ctx, s, w).some((x) => x.live)
}

/** Minutes from the earliest start to the latest record (or now while live), and tokens. Nothing with no agents. */
function spend(agents: { a: AgentRun }[], live: boolean, now: number): { minutes?: number; tokens?: number } {
  if (agents.length === 0) return {}
  const out: { minutes?: number; tokens?: number } = {}
  const finite = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v)
  const starts = agents.map(({ a }) => a.startedAt).filter(finite)
  const ends = agents.map(({ a }) => a.lastAt).filter(finite)
  const end = live ? now : ends.length > 0 ? Math.max(...ends) : undefined
  if (starts.length > 0 && end !== undefined) out.minutes = Math.max(0, Math.round((end - Math.min(...starts)) / 60_000))
  const tokens = agents.reduce((sum, { a }) => sum + (Number.isFinite(a.tokens) ? a.tokens : 0), 0)
  if (tokens > 0) out.tokens = tokens
  return out
}

function waveDetail(ctx: Ctx, s: SprintModel, w: WaveModel, state: StepState): string {
  if (state === 'wait') return `${count(w.slices.length, 'slice')} planned`
  const agents = waveAgents(ctx, s, w)
  if (agents.length === 0) return count(w.slices.length, 'slice')
  const live = state === 'live'
  const { minutes, tokens } = spend(agents, live, ctx.now)
  const parts = [count(agents.length, 'engineer')]
  if (minutes !== undefined) parts.push(live ? `${minutes} min so far` : `${minutes} min`)
  if (!live && tokens !== undefined) parts.push(`${formatTokens(tokens)} tok`)
  return parts.join(' · ')
}

function checkSteps(ctx: Ctx): Step[] {
  const of = (kind: AgentRole['kind']) =>
    ctx.agents.filter((x) => x.role.kind === kind).sort((x, y) => (x.a.startedAt ?? 0) - (y.a.startedAt ?? 0))
  const reviews = of('review')
  const passes = of('fix-pass')
  const liveReview = reviews.findLast((x) => x.live)
  const livePass = passes.findIndex((x) => x.live)

  const review: Step = liveReview
    ? { key: 'review', label: 'Final review', state: 'live', detail: `round ${liveReview.a.round ?? reviews.indexOf(liveReview) + 1}` }
    : reviews.length > 0
      ? { key: 'review', label: 'Final review', state: 'done', detail: count(reviews.length, 'round') }
      : { key: 'review', label: 'Final review', state: 'wait', detail: 'not started' }
  const fix: Step =
    livePass >= 0
      ? { key: 'fix', label: 'Fix pass', state: 'live', detail: `pass ${livePass + 1}` }
      : passes.length > 0
        ? { key: 'fix', label: 'Fix pass', state: 'done', detail: count(passes.length, 'pass') }
        : { key: 'fix', label: 'Fix pass', state: 'wait', detail: 'only if review fails' }
  return [review, fix]
}

function shipStep(ctx: Ctx): Step {
  const n = handBackPr(ctx.plan)
  if (n === undefined) return { key: 'final-pr', label: 'Final PR', state: 'wait', detail: 'not open yet' }
  return pendingHandBack(ctx.repo, ctx.plan) === undefined
    ? { key: 'final-pr', label: 'Final PR', state: 'done', detail: `merged PR #${n}` }
    : { key: 'final-pr', label: 'Final PR', state: 'you', detail: `PR #${n} · you merge` }
}

/** Status, first match wins: blocked → merged (PR #N) → PR #N open → running → planned. */
function logStatus(ctx: Ctx, s: SprintModel, w: WaveModel): string {
  if (w.slices.some(isBlockedSlice)) return 'blocked'
  const numbered = w.slices.find((x) => x.pr.number !== undefined)?.pr.number
  if (w.slices.every(isSliceDone)) return numbered === undefined ? 'merged' : `merged PR #${numbered}`
  const open = w.slices.find((x) => x.pr.state === 'open' && x.pr.number !== undefined)?.pr.number
  if (open !== undefined) return `PR #${open} open`
  return isWaveLive(ctx, s, w) ? 'running' : 'planned'
}

const NO_CONFIDENCE = new Set(['', '—', '-'])

function logGroup(ctx: Ctx, s: SprintModel, i: number, w: WaveModel): LogGroup {
  const rows = w.slices.map((x): LogRow => {
    const agents = sliceAgents(ctx, s, x.code)
    const live = agents.some((y) => y.live)
    const row: LogRow = { code: x.code, title: x.title, live }
    if (x.model) row.model = x.model
    if (!NO_CONFIDENCE.has(x.confidence.trim())) row.confidence = x.confidence.trim()
    Object.assign(row, spend(agents, live, ctx.now))
    return row
  })
  return { sprint: s.slug, wave: w.wave, label: `Sprint ${i + 1} · wave ${w.wave}`, status: logStatus(ctx, s, w), rows }
}

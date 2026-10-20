// The runs list: one row per live plan across every repo on the board, with
// where it is and what state it's in, ordered so what needs you comes first.
// Pure. The rules and why are in pod-docs/feature-details/runs-and-pipeline.md.

import type { Board, BoardRepo } from './board.ts'
import { fixRuns } from './fix-runs.ts'
import { isBlockedSlice, isDrafting, isHalted, isPlanAgent, isRunning, pendingHandBack, roleOf } from './pipeline.ts'
import type { PlanModel } from './run-model.ts'
import { STALE_MS } from './transcript.ts'

export type RunState = 'blocked' | 'needs-you' | 'running' | 'idle' | 'unsupported' | 'error'

export type RunSummary = {
  repoId: string
  repo: string
  /** The plan slug; for a fix run, its claim name `fix-<slug>`, which names no plan. */
  plan?: string
  /** Set on a /pod:fix run: its slug. */
  fix?: string
  title?: string
  where: string
  state: RunState
  portBase?: number
}

const ORDER: RunState[] = ['blocked', 'needs-you', 'running', 'idle', 'unsupported', 'error']
const ACTIVE = new Set<RunState>(['blocked', 'needs-you', 'running'])

/** Every run on the board, sorted by state, then repo name, then plan slug. */
export function listRuns(board: Board, now: number): RunSummary[] {
  return board.repos.flatMap((repo) => repoRuns(repo, now)).sort(byOrder)
}

/** How many runs are blocked, need you, or are running. */
export const activeRuns = (runs: RunSummary[]) => runs.filter((r) => ACTIVE.has(r.state)).length

function repoRuns(repo: BoardRepo, now: number): RunSummary[] {
  const base = { repoId: repo.id, repo: repo.name }
  if (repo.error !== undefined) return [{ ...base, where: repo.error || 'cannot read repo', state: 'error' }]
  if (!repo.model.docs.supported) return [{ ...base, where: 'update pod', state: 'unsupported' }]
  const runs = repo.model.plans.filter((p) => isRun(repo, p, now)).map((p) => planRun(repo, p, now))
  runs.push(...fixRuns(repo, now).map((f) => ({ ...base, ...f })))
  return runs.length > 0 ? runs : [{ ...base, where: 'no active plan', state: 'idle' }]
}

const planAgentRunning = (repo: BoardRepo, plan: PlanModel, now: number) =>
  repo.agents.some((a) => isPlanAgent(a, plan) && isRunning(a, now))

/** A port claim names the plan. pod deletes it only on resume after the merge, so it can outlive the run. */
const isClaimed = (repo: BoardRepo, plan: PlanModel) => repo.claims.some((c) => c.plan === plan.slug)

/**
 * One of the plan's agents wrote within the last STALE_MS, ended or not. It bridges the gaps between
 * close-out steps (the final review ended, the reporter not started; the reporter ended, the hand-back not written).
 */
const planAgentRecent = (repo: BoardRepo, plan: PlanModel, now: number) =>
  repo.agents.some((a) => isPlanAgent(a, plan) && a.lastAt !== undefined && now - a.lastAt < STALE_MS)

/**
 * A plan is a run while a claim names it and it isn't archived. A claimed archived plan is closing out
 * (pod archives the plan before the final merge) while its hand-back waits, it's halted, or one of its
 * agents wrote recently; else the claim is a leftover and the plan is finished. Unclaimed, a plan is a run
 * unless it's archived or finished. Finished: every sprint done, no hand-back waiting, no halt, and none of
 * its agents running (a final review runs after the last sprint is done).
 */
function isRun(repo: BoardRepo, plan: PlanModel, now: number): boolean {
  const claimed = isClaimed(repo, plan)
  if (claimed && plan.status !== 'archived') return true
  if (plan.status === 'archived') {
    return claimed && (pendingHandBack(repo, plan) !== undefined || isHalted(plan) || planAgentRecent(repo, plan, now))
  }
  return (
    plan.sprints.some((s) => s.status !== 'done') ||
    pendingHandBack(repo, plan) !== undefined ||
    isHalted(plan) ||
    planAgentRunning(repo, plan, now)
  )
}

function planRun(repo: BoardRepo, plan: PlanModel, now: number): RunSummary {
  const run: RunSummary = { repoId: repo.id, repo: repo.name, plan: plan.slug, title: plan.title, where: where(repo, plan, now), state: state(repo, plan, now) }
  const portBase = repo.claims.find((c) => c.plan === plan.slug)?.portBase ?? plan.portBase
  if (portBase !== undefined) run.portBase = portBase
  return run
}

/** First match wins: blocked → needs-you → running → idle. */
function state(repo: BoardRepo, plan: PlanModel, now: number): RunState {
  const current = plan.sprints.find((s) => s.slug === plan.currentSprint)
  const slices = current?.waves.flatMap((w) => w.slices) ?? []
  if (isHalted(plan) || slices.some(isBlockedSlice)) return 'blocked'
  if (plan.queue.some((e) => e.needsYou)) return 'needs-you'
  const wave = current?.waves.find((w) => w.wave === current.currentWave)
  if (planAgentRunning(repo, plan, now) || wave?.slices.some((s) => s.status === 'pushed')) return 'running'
  return 'idle'
}

function where(repo: BoardRepo, plan: PlanModel, now: number): string {
  const current = plan.sprints.find((s) => s.slug === plan.currentSprint)
  if (current) {
    const last = current.waves.at(-1)
    if (current.hasDoc && last) return `${current.slug} · wave ${current.currentWave ?? last.wave}/${last.wave}`
    return `${current.slug} · ${isDrafting(repo.agents, plan, now) ? 'drafting' : 'not drafted'}`
  }
  if (repo.agents.some((a) => roleOf(a, plan).kind === 'review' && isRunning(a, now))) return 'final review'
  if (pendingHandBack(repo, plan) !== undefined) return 'final PR'
  // A listed archived plan is closing out: only a claim lists one, and the report comes before the final merge.
  if (plan.status === 'archived') return 'closing out'
  return 'all sprints done'
}

const text = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0)

function byOrder(a: RunSummary, b: RunSummary): number {
  return ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || text(a.repo, b.repo) || text(a.plan ?? '', b.plan ?? '')
}

// The run's flow (columns of step cards), its fold line for phones, and the run header (crumb, name,
// progress strip, `Wave N of M`), from the model's flow. Pure; the Flow and the header only render these.

import { buildFlow, type BoardRepo, type RunSummary, type Stage, type Step, type StepState } from '@pod-board/model'

export type Segment = 'done' | 'current' | 'rest'
export type RunHeader = { crumb: string; name: string; segments: Segment[]; wave?: string }

/** The SVG mark of each state (names in theme/icons.tsx). */
export type FlowMark = 'check' | 'dot' | 'alert' | 'blocked' | 'circle'
export type FlowStep = { key: string; label: string; detail: string; state: StepState; word: string; mark: FlowMark; highlight: boolean; dim: boolean }
export type FlowColumn = { key: string; caption: string; steps: FlowStep[] }
export type FoldLine = { label: string; detail: string; mark: FlowMark; word: string; state: StepState }

const WORDS: Record<StepState, string> = {
  done: 'done',
  live: 'running',
  wait: 'waiting',
  you: 'needs you',
  blocked: 'blocked',
  unknown: 'unknown',
  skipped: 'skipped',
}

const MARKS: Record<StepState, FlowMark> = { done: 'check', live: 'dot', you: 'alert', blocked: 'blocked', wait: 'circle', unknown: 'circle', skipped: 'circle' }

/** Steps that ask for an eye: the highlighted border. */
const HIGHLIGHT = new Set<StepState>(['live', 'you', 'blocked'])
/** Steps not reached yet, not recorded, or not taken: dim. */
const DIM = new Set<StepState>(['wait', 'unknown', 'skipped'])
/** Steps the strip counts as done once a later step started: the board can't see them happen. */
const UNSEEN = new Set<StepState>(['unknown', 'skipped'])

/** One column per stage that has steps, in flow order; each step with its mark, word, and look. */
export function flowColumns(stages: Stage[]): FlowColumn[] {
  return stages
    .filter((stage) => stage.steps.length > 0)
    .map((stage) => ({
      key: stage.key,
      caption: stage.caption,
      steps: stage.steps.map((step) => ({
        key: `${stage.key}:${step.key}`,
        label: step.label,
        detail: step.detail,
        state: step.state,
        word: WORDS[step.state],
        mark: MARKS[step.state],
        highlight: HIGHLIGHT.has(step.state),
        dim: DIM.has(step.state),
      })),
    }))
}

/** The current step's index: the first blocked, you or live step; else the first wait; else none (-1). */
function currentIndex(states: StepState[]): number {
  const active = states.findIndex((s) => HIGHLIGHT.has(s))
  return active >= 0 ? active : states.indexOf('wait')
}

/** The phone's one-line flow: the current step, else the last step (everything done). */
export function foldLine(columns: FlowColumn[]): FoldLine | undefined {
  const steps = columns.flatMap((c) => c.steps)
  const step = steps[currentIndex(steps.map((s) => s.state))] ?? steps.at(-1)
  return step && { label: step.label, detail: step.detail, mark: step.mark, word: step.word, state: step.state }
}

/**
 * The progress strip: done, current, or rest per flow step. An `unknown` or `skipped` step counts as
 * done once any later step is neither waiting nor itself unseen.
 */
function segments(steps: Step[]): Segment[] {
  const states = steps.map((s) => s.state)
  const current = currentIndex(states)
  return steps.map((s, i): Segment => {
    if (i === current) return 'current'
    if (s.state === 'done') return 'done'
    if (UNSEEN.has(s.state) && states.slice(i + 1).some((x) => x !== 'wait' && !UNSEEN.has(x))) return 'done'
    return 'rest'
  })
}

/** `Wave N of M`, by runs.ts's rule (N is the current wave, else the last), for a current sprint with a doc and waves. */
function waveText(run: RunSummary, repo: BoardRepo): string | undefined {
  const plan = repo.model.plans.find((p) => p.slug === run.plan)
  const sprint = plan?.sprints.find((s) => s.slug === plan.currentSprint)
  const last = sprint?.waves.at(-1)
  if (!sprint?.hasDoc || !last) return undefined
  return `Wave ${sprint.currentWave ?? last.wave} of ${last.wave}`
}

/** The header above the flow; undefined with no run or repo, or a run of another repo. */
export function runHeader(run: RunSummary | undefined, repo: BoardRepo | undefined, now: number): RunHeader | undefined {
  if (!run || !repo || run.repoId !== repo.id) return undefined
  const name = run.fix !== undefined ? `fix · ${run.fix}` : (run.plan ?? run.repo)
  // A fix run's claim name and a repo row name no plan, so they have no flow and no strip.
  const flow = run.fix === undefined && run.plan !== undefined ? buildFlow(repo, run.plan, now) : undefined
  const header: RunHeader = { crumb: run.repo, name, segments: flow ? segments(flow.flatMap((s) => s.steps)) : [] }
  const wave = run.fix === undefined && run.plan !== undefined ? waveText(run, repo) : undefined
  if (wave !== undefined) header.wave = wave
  return header
}

// The Plan tab's lines and the run header (name, progress strip, `Wave N of M`), from the model's pipeline.
// Pure; the Plan tab and the header only render these.

import { buildPipeline, type BoardRepo, type RunSummary, type Stage, type Step, type StepState } from '@pod-board/model'

export type PlanLine = { key: string; label: string; state: StepState; word: string; detail?: string; current: boolean }
export type Segment = 'done' | 'current' | 'rest'
export type RunHeader = { crumb: string; name: string; segments: Segment[]; wave?: string }

const WORDS: Record<StepState, string> = {
  done: 'done',
  live: 'running',
  wait: 'waiting',
  you: 'needs you',
  blocked: 'blocked',
  unknown: 'unknown',
}

const ACTIVE = new Set<StepState>(['blocked', 'you', 'live'])

type Flat = { stage: Stage; step: Step }

const flatten = (stages: Stage[]): Flat[] => stages.flatMap((stage) => stage.steps.map((step) => ({ stage, step })))

/** The current step's index: the first blocked, you or live step; else the first wait; else none (-1). */
function currentIndex(steps: Step[]): number {
  const active = steps.findIndex((s) => ACTIVE.has(s.state))
  return active >= 0 ? active : steps.findIndex((s) => s.state === 'wait')
}

/** One line per step, in pipeline order. Only the current line carries the step's detail. */
export function planLines(stages: Stage[]): PlanLine[] {
  const flat = flatten(stages)
  const current = currentIndex(flat.map((f) => f.step))
  return flat.map(({ stage, step }, i) => {
    const label = stage.caption === step.label ? step.label : `${stage.caption} · ${step.label}`
    const line: PlanLine = { key: `${stage.key}:${step.key}`, label, state: step.state, word: WORDS[step.state], current: i === current }
    if (i === current) line.detail = step.detail
    return line
  })
}

/**
 * The progress strip: done, current, or rest per step. An `unknown` step (Go, not recorded yet)
 * counts as done once any later step is neither `wait` nor `unknown`.
 */
function segments(steps: Step[]): Segment[] {
  const current = currentIndex(steps)
  return steps.map((s, i): Segment => {
    if (i === current) return 'current'
    if (s.state === 'done') return 'done'
    if (s.state === 'unknown' && steps.slice(i + 1).some((x) => x.state !== 'wait' && x.state !== 'unknown')) return 'done'
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

/** The header above the Next step card; undefined with no run or repo, or a run of another repo. */
export function runHeader(run: RunSummary | undefined, repo: BoardRepo | undefined, now: number): RunHeader | undefined {
  if (!run || !repo || run.repoId !== repo.id) return undefined
  const name = run.fix !== undefined ? `fix · ${run.fix}` : (run.plan ?? run.repo)
  // A fix run's claim name and a repo row name no plan, so they have no pipeline and no strip.
  const pipeline = run.fix === undefined && run.plan !== undefined ? buildPipeline(repo, run.plan, now) : undefined
  const header: RunHeader = { crumb: run.repo, name, segments: pipeline ? segments(flatten(pipeline.stages).map((f) => f.step)) : [] }
  const wave = run.fix === undefined && run.plan !== undefined ? waveText(run, repo) : undefined
  if (wave !== undefined) header.wave = wave
  return header
}

export type FlowMark = 'check' | 'dot' | 'alert' | 'blocked' | 'circle'
export type FlowStep = { key: string; label: string; detail: string; state: StepState; word: string; mark: FlowMark; highlight: boolean; dim: boolean }
export type FlowColumn = { key: string; caption: string; steps: FlowStep[] }

/** The flow's columns. Not built yet. */
export function flowColumns(_stages: Stage[]): FlowColumn[] {
  return []
}

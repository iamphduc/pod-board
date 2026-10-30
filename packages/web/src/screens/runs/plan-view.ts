// The run's flow (columns of step cards) and the run header (crumb and name), from the model's pipeline.
// Pure; the Flow and the header only render these.

import type { RunSummary, Stage, StepState } from '@pod-board/model'

export type RunHeader = { crumb: string; name: string }

/** The SVG mark of each state (names in theme/icons.tsx). */
export type FlowMark = 'check' | 'dot' | 'alert' | 'blocked' | 'circle'
export type FlowStep = { key: string; label: string; detail: string; state: StepState; word: string; mark: FlowMark; highlight: boolean; dim: boolean }
export type FlowColumn = { key: string; caption: string; steps: FlowStep[] }

const WORDS: Record<StepState, string> = {
  done: 'done',
  live: 'running',
  wait: 'waiting',
  you: 'needs you',
  blocked: 'blocked',
  unknown: 'unknown',
}

const MARKS: Record<StepState, FlowMark> = { done: 'check', live: 'dot', you: 'alert', blocked: 'blocked', wait: 'circle', unknown: 'circle' }

/** Steps that ask for an eye: the highlighted border. */
const HIGHLIGHT = new Set<StepState>(['live', 'you', 'blocked'])
/** Steps not reached yet: dim. */
const DIM = new Set<StepState>(['wait', 'unknown'])

/** One column per stage that has steps, in pipeline order; each step with its mark, word, and look. */
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

/** The header above the flow; undefined with no run or repo, or a run of another repo. */
export function runHeader(run: RunSummary | undefined, repo: { id: string } | undefined): RunHeader | undefined {
  if (!run || !repo || run.repoId !== repo.id) return undefined
  const name = run.fix !== undefined ? `fix · ${run.fix}` : (run.plan ?? run.repo)
  return { crumb: run.repo, name }
}

export type FoldLine = { label: string; detail: string; mark: FlowMark; word: string; state: FlowStep['state'] }

/** Not built yet. */
export function foldLine(_columns: FlowColumn[]): FoldLine | undefined {
  return undefined
}

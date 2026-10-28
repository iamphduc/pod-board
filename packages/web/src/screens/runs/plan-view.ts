// The Plan tab's lines and the run header (name, progress strip, `Wave N of M`), from the model's pipeline.
// Pure; the Plan tab and the header only render these.

import type { BoardRepo, RunSummary, Stage, StepState } from '@pod-board/model'

export type PlanLine = { key: string; label: string; state: StepState; word: string; detail?: string; current: boolean }
export type Segment = 'done' | 'current' | 'rest'
export type RunHeader = { crumb: string; name: string; segments: Segment[]; wave?: string }

export function planLines(_stages: Stage[]): PlanLine[] {
  return []
}

export function runHeader(_run: RunSummary | undefined, _repo: BoardRepo | undefined, _now: number): RunHeader | undefined {
  return undefined
}

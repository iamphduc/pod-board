// PRs waiting on you: the one rule for which PRs the human merges from the board.
// Pure. The rules and why are in pod-docs/feature-details/runs-and-pipeline.md.

import type { BoardRepo } from './board.ts'

export type WaitingPr = { kind: 'wave' | 'fix' | 'final'; number: number; url?: string; run: string; sprint?: string; wave?: number }

export function waitingPrs(_repo: BoardRepo, _now: number): WaitingPr[] {
  return []
}

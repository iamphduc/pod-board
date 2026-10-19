import type { Board } from './board.ts'

export type RunState = 'blocked' | 'needs-you' | 'running' | 'idle' | 'unsupported' | 'error'
export type RunSummary = { repoId: string; repo: string; plan?: string; title?: string; where: string; state: RunState; portBase?: number }

export function listRuns(_board: Board, _now: number): RunSummary[] {
  return []
}

export function activeRuns(_runs: RunSummary[]): number {
  return -1
}

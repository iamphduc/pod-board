import type { RunSummary } from '@pod-board/model'
export const LIVE_TICK_MS = 0
export const parseHash = (_h: string): { repoId: string; plan?: string } | undefined => undefined
export const hashFor = (_r: RunSummary) => ''
export const resolveSelection = (_runs: RunSummary[], _hash: string): { run?: RunSummary; hash?: string } => ({})
export const startClock = (_fn: (now: number) => void) => () => {}

// Fix runs: a /pod:fix run, read from its port claim and its agents. Stub.
import type { AgentRun, AgentState, BoardRepo } from './board.ts'
import type { Stage } from './pipeline.ts'

export const OTHER_WINDOW_MS = 2 * 60 * 60 * 1000
export const OTHER_CAP = 8

export type FixLogRow = { agentId: string; role: 'engineer' | 'fix pass' | 'reviewer'; round?: number; startedAt?: number; endedAt?: number; state: AgentState; engineer: boolean }
export type FixPipeline = { slug: string; stages: Stage[]; log: FixLogRow[] }
export type OtherAgent = { id: string; role: string; detail?: string; startedAt?: number; lastAt?: number; state: AgentState }

export const fixRunNames = (_repo: BoardRepo): string[] => []
export const buildFixPipeline = (_repo: BoardRepo, _name: string, _now: number): FixPipeline | undefined => undefined
export const otherActivity = (_repo: BoardRepo, _now: number): OtherAgent[] => []
export type { AgentRun }

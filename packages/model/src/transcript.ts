import type { AgentRun, AgentState } from './board.ts'

export const STALE_MS = 0

export type AgentFile = { id: string; session: string; meta: string; jsonl: string }

export function parseAgentTranscript(_file: AgentFile): AgentRun | undefined {
  return undefined
}

export function agentState(_a: AgentRun, _now: number): AgentState {
  return 'stale'
}

// Stub: the contract's shapes only. The parser lands in the next commit.

export type ToolEvent = { at: number; tool: string; summary: string; result?: 'ok' | 'failed' }
export type TestProgress = { testFiles: number; runs: number; failedRuns: number; last?: 'pass' | 'fail'; testFirst?: boolean }
export type AgentTimeline = { agentId: string; events: ToolEvent[]; total: number; tests: TestProgress }

export function parseAgentTimeline(input: { agentId: string; jsonl: string; roots: string[] }): AgentTimeline {
  return { agentId: input.agentId, events: [], total: 0, tests: { testFiles: 0, runs: 0, failedRuns: 0 } }
}

// Stub: the contract's shape only. The source lands in the next commit.
import type { AgentTimeline, Board } from '@pod-board/model'

export type TimelineSourceDeps = { board: () => Board; claudeDir: string; transcriptDays: number; now: () => number }

export function createTimelineSource(_deps: TimelineSourceDeps): { timeline(repoId: string, agentId: string): Promise<AgentTimeline | undefined> } {
  return { timeline: async () => undefined }
}

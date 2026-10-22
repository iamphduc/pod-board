// Replies: which reply pod waits for on a run, and the chat to paste it in.
// Pure. The rules and why are in pod-docs/feature-details/queue-and-replies.md.

import type { BoardRepo } from './board.ts'

export type ReplyWord = 'continue' | 'go' | 'try'
export type ReplySignal = 'wave-waiting' | 'wave-merged' | 'sprint-done' | 'final-waiting' | 'final-merged' | 'fix-waiting' | 'fix-merged' | 'not-started'
export type RunReply = { reply: ReplyWord; signal: ReplySignal; why: string; pr?: number }
export type ReplySession = { id: string; startedAt?: number; repoPath: string; resume?: string }

export function runReplies(_repo: BoardRepo, _run: string, _now: number): RunReply[] {
  return []
}

export function replySession(_repo: BoardRepo, _run: string, _now: number): ReplySession | undefined {
  return undefined
}

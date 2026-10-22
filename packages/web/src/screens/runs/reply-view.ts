// The Reply panel's rows and words: which reply pod waits for, and the chat to paste it in.

import type { BoardRepo, ReplyWord, RunSummary } from '@pod-board/model'

export const NO_SESSION = 'No pod session found for this run. Paste it in the chat that runs it.'

export type ReplyRowView = { key: string; word: ReplyWord; why: string }
export type ReplySessionView = { line: string; time?: string; path: string; cd: string; resume?: string }
export type ReplyPanelView = { rows: ReplyRowView[]; session?: ReplySessionView; noSession?: string }

export function replyPanel(_run: RunSummary | undefined, _repo: BoardRepo | undefined, _now: number): ReplyPanelView | undefined {
  return undefined
}

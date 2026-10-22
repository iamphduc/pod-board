// Stub for the test-first commit; the real rules follow.
import type { BoardRepo, QueueItem, RunSummary } from '@pod-board/model'
import type { AnswerState } from './answer-flow.ts'
import type { Chip } from './view.ts'

export const ANSWER_NOTE = ''
export const ANSWER_WAITING = ''

export type WaitingRow = {
  key: string
  line: string
  chip: Chip
  date?: string
  route: string
  body: string
  answerable: boolean
  yourAnswer?: string
  waiting?: string
}

export function waitingEntries(_repo: BoardRepo | undefined, _selected: RunSummary | undefined): QueueItem[] {
  return []
}

export function waitingRows(_repo: BoardRepo | undefined, _selected: RunSummary | undefined): WaitingRow[] {
  return []
}

export function formAnchor(_s: AnswerState, _rows: WaitingRow[], _repoId: string): string | undefined {
  return undefined
}

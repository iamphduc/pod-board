import type { AnswerState } from './answer-flow.ts'
import type { MergeState } from './merge-flow.ts'
import type { NextItem } from './next-step.ts'

export const NOTHING_ELSE = 'Nothing else waits on you.'

export function toggleOpen(_open: ReadonlySet<string>, _key: string, _keys: readonly string[]): Set<string> {
  return new Set()
}
export function keepOpen(open: ReadonlySet<string>, _keys: readonly string[]): ReadonlySet<string> {
  return open
}
export function answerAnchor(_s: AnswerState, _items: NextItem[], _repoId: string): string | undefined {
  return undefined
}
export function mergeAnchor(_s: MergeState, _items: NextItem[], _repoId: string): string | undefined {
  return undefined
}
export function rowMeta(_row: import('./queue-view.ts').WaitingRow): string {
  return ''
}

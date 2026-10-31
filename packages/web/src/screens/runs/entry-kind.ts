// The kind word a queue entry body starts with (`now:`, `decision:`, `before hosting:`, `someday (pod side):`),
// which says when the entry matters. Pure; queue-view.ts reads it, next-step.ts sorts by it.

export type EntryKind = 'now' | 'decision' | 'before' | 'other' | 'someday'

/** Most urgent first: the pending tier of the Waiting tab sorts and groups in this order. */
export const KIND_ORDER: readonly EntryKind[] = ['now', 'decision', 'before', 'other', 'someday']

/** `label` is what the row shows (`before hosting`, `someday (pod side)`); `text` is the body without the prefix. */
export type EntryKindOf = { kind: EntryKind; label: string; text: string }

export function entryKind(body: string): EntryKindOf {
  return { kind: 'other', label: 'other', text: body }
}

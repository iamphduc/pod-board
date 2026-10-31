// The Waiting tab's logic: which rows are open, and where the open answer form and merge confirm sit.
// Rows are kept by NextItem.key (stable across Boards), never by position. Pure; WaitingTab.tsx is the glue.

import type { AnswerState } from './answer-flow.ts'
import type { MergeState } from './merge-flow.ts'
import type { NextItem } from './next-step.ts'
import type { RunTarget } from './resume-flow.ts'
import { formAnchor, type WaitingRow } from './queue-view.ts'
import type { Chip } from './view.ts'

export const NOTHING_ELSE = 'Nothing else waits on you.'

/** `key` opened or closed; keys whose item left the list are dropped, and a key not in it never opens. */
export function toggleOpen(open: ReadonlySet<string>, key: string, keys: readonly string[]): Set<string> {
  const next = new Set([...open].filter((k) => keys.includes(k)))
  if (next.has(key)) next.delete(key)
  else if (keys.includes(key)) next.add(key)
  return next
}

/** The open keys whose item is still listed; the same set when none left, so state doesn't change. */
export function keepOpen(open: ReadonlySet<string>, keys: readonly string[]): ReadonlySet<string> {
  const kept = [...open].filter((k) => keys.includes(k))
  return kept.length === open.size ? open : new Set(kept)
}

/** An entry's route and date, on one line. */
export const rowMeta = (row: WaitingRow): string => [row.route, row.date].filter((x) => !!x).join(' · ')

/**
 * The key of the item the open answer form sits under; `end` once its entry left the list (the form
 * then shows after it, so a result is never lost); undefined while closed or for another repo.
 */
export function answerAnchor(s: AnswerState, items: NextItem[], repoId: string): string | undefined {
  const withEntry = items.filter((i): i is NextItem & { entry: WaitingRow } => i.entry !== undefined)
  // formAnchor matches by line, also an answered line that starts with the form's; map its row back to the item.
  const rowKey = formAnchor(s, withEntry.map((i) => i.entry), repoId)
  if (rowKey === undefined || rowKey === 'end') return rowKey
  return withEntry.find((i) => i.entry.key === rowKey)?.key ?? 'end'
}

/** The key of the PR item the open merge confirm sits under; `end` once the PR left; undefined while closed or for another repo. */
export function mergeAnchor(s: MergeState, items: NextItem[], repoId: string): string | undefined {
  if (s.kind === 'idle' || s.target.repoId !== repoId) return undefined
  const n = s.target.number
  return items.find((i) => i.action.kind === 'merge' && i.action.number === n)?.key ?? 'end'
}

/** The reply row last seen: kept so a Continue or Go result stays after the Board drops the reply. */
export type ReplySeen = { key: string; target: RunTarget }

/** The reply item in the list, as ReplySeen; undefined when there is none. */
export function replySeen(items: NextItem[]): ReplySeen | undefined {
  const r = items.find((i) => i.action.kind === 'reply')
  return r && r.action.kind === 'reply' ? { key: r.key, target: r.action.panel.target } : undefined
}

/** The reply row to keep mounted after its item left (its panel then shows only the last result), else undefined. */
export const replyGhost = (items: NextItem[], last: ReplySeen | undefined): ReplySeen | undefined =>
  last && !items.some((i) => i.key === last.key) ? last : undefined

export type WaitGroup = { key: string; label?: string; items: NextItem[]; startsOpen: boolean }
export const kindChip = (_row: WaitingRow): Chip => ({ cls: 's-idle', label: '' })
export const waitGroups = (_items: NextItem[]): WaitGroup[] => []
export const groupOpen = (_g: WaitGroup, _flipped: ReadonlySet<string>, _anchors: readonly (string | undefined)[]): boolean => true

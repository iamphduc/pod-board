// What screen 1 shows for each state: chip classes and labels, the slice log's
// figures, and the message for a run with no pipeline. Components only render these.

import { formatTokens, type LogRow, type RunState, type RunSummary } from '@pod-board/model'
import type { StreamState } from '../../board-stream.ts'

export type ChipClass = 's-run' | 's-ok' | 's-you' | 's-bad' | 's-idle'
export type Chip = { cls: ChipClass; label: string }

const RUN_CHIPS: Record<RunState, Chip> = {
  blocked: { cls: 's-bad', label: 'blocked' },
  'needs-you': { cls: 's-you', label: 'needs you' },
  running: { cls: 's-run', label: 'running' },
  idle: { cls: 's-idle', label: 'idle' },
  unsupported: { cls: 's-you', label: 'update pod' },
  error: { cls: 's-bad', label: 'error' },
}

export const runChip = (s: RunState): Chip => RUN_CHIPS[s]

const STREAM_CHIPS: Record<StreamState, Chip> = {
  live: { cls: 's-ok', label: 'live' },
  connecting: { cls: 's-idle', label: 'connecting' },
  lost: { cls: 's-bad', label: 'lost · retrying' },
}

export const streamChip = (s: StreamState): Chip => STREAM_CHIPS[s]

/** A slice log group's status (`merged PR #N`, `PR #N open`, `running`, `blocked`, `planned`). */
export function groupChip(status: string): Chip {
  const cls: ChipClass = status.startsWith('merged')
    ? 's-ok'
    : status === 'blocked'
      ? 's-bad'
      : status.endsWith(' open')
        ? 's-you'
        : status === 'running'
          ? 's-run'
          : 's-idle'
  return { cls, label: status }
}

/** `high · 22 min · 248k tok`, leaving out what isn't known. Zero tokens never show. */
export function rowFigures(row: LogRow): string {
  const parts: string[] = []
  if (row.confidence) parts.push(row.confidence)
  if (row.minutes !== undefined) parts.push(`${row.minutes} min`)
  if (row.tokens) parts.push(`${formatTokens(row.tokens)} tok`)
  return parts.join(' · ')
}

export const barTitle = (r: RunSummary) => (r.plan === undefined ? r.repo : `${r.repo} · ${r.plan}`)

/** Why a run has no pipeline, and what to do about it. */
export function emptyMessage(r: RunSummary): string {
  if (r.state === 'error') return `Can't read this repo: ${r.where}. Check that the folder still exists.`
  if (r.state === 'unsupported') return "This repo's pod docs are from an older pod. Update pod in this repo to see its runs."
  if (r.plan === undefined) return 'No active plan in this repo. A plan shows here once pod starts one.'
  return `Can't find plan ${r.plan} in this repo's pod docs.`
}

export type TitlePart = { text: string; code: boolean }

/**
 * A doc title split into plain text and Markdown code spans, for rendering as
 * text and inline code. A backtick run closes only on a run of the same
 * length; one with no match stays as text.
 */
export function titleParts(text: string): TitlePart[] {
  const parts: TitlePart[] = []
  const push = (t: string, code: boolean) => {
    if (t === '') return
    const last = parts.at(-1)
    if (last && !last.code && !code) last.text += t
    else parts.push({ text: t, code })
  }
  const runs = /`+/g
  let at = 0
  let open: RegExpExecArray | null
  while ((open = runs.exec(text)) !== null) {
    const fence = open[0]
    let close: RegExpExecArray | null
    while ((close = runs.exec(text)) !== null && close[0].length !== fence.length);
    if (close === null) {
      // No closing run: this one is text; look for spans after it.
      runs.lastIndex = open.index + fence.length
      continue
    }
    push(text.slice(at, open.index), false)
    push(text.slice(open.index + fence.length, close.index), true)
    at = close.index + close[0].length
  }
  push(text.slice(at), false)
  return parts
}

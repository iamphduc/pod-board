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

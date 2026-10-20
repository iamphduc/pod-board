// What screen 1 shows for each state: chip classes and labels, the slice log's
// figures, a fix run's agent log, the Other activity strip, and the message for a
// run with no pipeline. Components only render these.

import {
  formatTokens,
  type AgentState,
  type Board,
  type BoardRepo,
  type FixLogRow,
  type LogRow,
  type OtherAgent,
  type RunState,
  type RunSummary,
} from '@pod-board/model'
import type { StreamState } from '../../board-stream.ts'
import { hashFor } from '../../selection.ts'

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

export const barTitle = (r: RunSummary) =>
  r.fix !== undefined ? `${r.repo} · fix · ${r.fix}` : r.plan === undefined ? r.repo : `${r.repo} · ${r.plan}`

/** Why a run has no pipeline, and what to do about it. `repo` gives an unsupported repo's docs version. */
export function emptyMessage(r: RunSummary, repo?: BoardRepo): string {
  if (r.state === 'error') return `Can't read this repo: ${r.where}. Check that the folder still exists.`
  if (r.state === 'unsupported') {
    if (!repo) return "This repo's pod docs are from an older pod. Update pod in this repo to see its runs."
    const { version } = repo.model.docs
    return version === undefined
      ? 'This repo has no pod docs version (an older pod). Update pod in this repo.'
      : `This repo's pod docs are version ${version}; Pod Board reads version 2. Update pod in this repo.`
  }
  if (r.plan === undefined) return 'No active plan in this repo. A plan shows here once pod starts one.'
  return `Can't find plan ${r.plan} in this repo's pod docs.`
}

export type Banner = { chip: Chip; text: string }

const GH_BANNERS: Partial<Record<Board['gh'], Banner>> = {
  missing: { chip: { cls: 's-you', label: 'gh missing' }, text: "gh isn't installed, so PR states aren't checked." },
  'logged-out': {
    chip: { cls: 's-you', label: 'gh logged out' },
    text: "gh isn't logged in, so PR states may be out of date. Run gh auth login.",
  },
}

/** Local `HH:MM`. */
const clock = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** What's wrong above the main view, in order: the lost stream, the config error, then gh. Each has a chip. */
export function banners(board: Board | undefined, stream: StreamState): Banner[] {
  const out: Banner[] = []
  if (stream === 'lost') out.push({ chip: streamChip('lost'), text: 'Lost the connection to the server. Showing the last board; retrying.' })
  if (!board) return out
  if (board.configError !== undefined) {
    out.push({
      chip: { cls: 's-bad', label: 'config unreadable' },
      text: "The board's config file can't be read, so the repo list may be out of date. The board never overwrites it.",
    })
  }
  const gh = GH_BANNERS[board.gh]
  if (gh) out.push(board.ghCheckedAt === undefined ? gh : { ...gh, text: `${gh.text} Last checked ${clock(board.ghCheckedAt)}.` })
  return out
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

// ---- Fix runs and other activity ----

/** The runs list's second line: `fix · <slug> · <where>`, `<plan> · <where>`, or the where alone. */
export function runLine(r: RunSummary): string {
  if (r.fix !== undefined) return `fix · ${r.fix} · ${r.where}`
  return r.plan === undefined ? r.where : `${r.plan} · ${r.where}`
}

const AGENT_CHIPS: Record<AgentState, Chip> = {
  running: { cls: 's-run', label: 'running' },
  ended: { cls: 's-ok', label: 'ended' },
  stale: { cls: 's-idle', label: 'stale' },
}

export const agentChip = (s: AgentState): Chip => AGENT_CHIPS[s]

/** One row per agent turn: `key` is unique (agent, then turn for a resumed agent); `agentId` the agent the row opens. */
export type AgentLogView = { key: string; agentId: string; label: string; time: string; chip: Chip; href?: string }

/** The fix run's agent log: role and round, `HH:MM → HH:MM` (or `→ now` while running), and a link to each engineer's view. */
export function agentLogRows(run: RunSummary, log: FixLogRow[]): AgentLogView[] {
  return log.map((x) => {
    const label = x.round === undefined ? x.role : `${x.role} · round ${x.round}`
    const end = x.endedAt !== undefined ? clock(x.endedAt) : x.state === 'running' ? 'now' : undefined
    const time = x.startedAt === undefined ? '—' : `${clock(x.startedAt)} → ${end ?? '—'}`
    const key = x.turn === undefined ? x.agentId : `${x.agentId}:${x.turn}`
    const row: AgentLogView = { key, agentId: x.agentId, label, time, chip: agentChip(x.state) }
    if (x.engineer) row.href = hashFor(run, 'agent', x.agentId)
    return row
  })
}

export type OtherView = { key: string; text: string; time: string; chip: Chip }

/** The Other activity strip: `<role> · <field>`, the last write as `HH:MM`, and a state chip. */
export function otherRows(list: OtherAgent[]): OtherView[] {
  return list.map((x) => ({
    key: x.id,
    text: x.detail === undefined ? x.role : `${x.role} · ${x.detail}`,
    time: x.lastAt === undefined ? '—' : clock(x.lastAt),
    chip: agentChip(x.state),
  }))
}

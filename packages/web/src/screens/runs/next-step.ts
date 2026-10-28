// The Next step card and the Waiting tab: the selected run's most urgent item and its one action,
// then everything else that waits on you. Picks from the model's rules only (the queue entries,
// waitingPrs, the reply panel), in the plan's order: blocked → merge → reply → pending → info.
// Pure; the card and the tab only render these.

import { isAnswerable, waitingPrs, type BoardRepo, type QueueItem, type RunSummary, type WaitingPr } from '@pod-board/model'
import { waitingEntries, waitingRows, type WaitingRow } from './queue-view.ts'
import { replyPanel, type ReplyPanelView } from './reply-view.ts'
import { emptyMessage } from './view.ts'

export type NextStatus = 'blocked' | 'needs-you' | 'ready' | 'running' | 'idle'
export type NextAction =
  | { kind: 'answer'; repoId: string; line: string }
  | { kind: 'merge'; repoId: string; number: number }
  | { kind: 'reply'; panel: ReplyPanelView }
  | { kind: 'none' }
export type NextItem = {
  /** Stable across Boards: `entry:<line>`, `pr:<number>`, `reply:<run>`; a repeated line gets `#2`, `#3`. */
  key: string
  tier: 'blocked' | 'merge' | 'reply' | 'pending' | 'info' | 'nothing'
  status: NextStatus
  /** One short line. */
  title: string
  /** One short line. */
  detail?: string
  /** Queue items: the Waiting on you row. */
  entry?: WaitingRow
  action: NextAction
}
/** `card` is the first action item; `rest` is every other item (the Waiting tab's count is its length). */
export type NextSteps = { card: NextItem; rest: NextItem[] }

export const NOTHING_TITLE = 'Nothing to do'
export const BLOCKED_DETAIL = 'The run is stopped until you answer.'
export const PENDING_DETAIL = 'pod goes on with the value in use until you answer.'

const TITLE_MAX = 80

/** The body as one short line: cut at a word under TITLE_MAX characters, with an ellipsis. */
function short(text: string): string {
  if ([...text].length <= TITLE_MAX) return text
  const cut = [...text].slice(0, TITLE_MAX - 1).join('')
  const space = cut.lastIndexOf(' ')
  return `${(space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

const ACTION_TIERS = new Set<NextItem['tier']>(['blocked', 'merge', 'reply', 'pending'])
const TIER_ORDER: NextItem['tier'][] = ['blocked', 'merge', 'reply', 'pending', 'info']

/** Keys by line, a repeat numbered in list order, so a row's key never depends on where it sits. */
function entryKeys(rows: WaitingRow[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const n = (seen.get(r.line) ?? 0) + 1
    seen.set(r.line, n)
    return n === 1 ? `entry:${r.line}` : `entry:${r.line}#${n}`
  })
}

function entryItem(e: QueueItem, row: WaitingRow, key: string, repoId: string): NextItem {
  const answer: NextAction = { kind: 'answer', repoId, line: row.line }
  const blocked = e.type === 'BLOCKED'
  if (isAnswerable(e)) {
    return blocked
      ? { key, tier: 'blocked', status: 'blocked', title: short(row.body), detail: BLOCKED_DETAIL, entry: row, action: answer }
      : { key, tier: 'pending', status: 'needs-you', title: short(row.body), detail: PENDING_DETAIL, entry: row, action: answer }
  }
  return { key, tier: 'info', status: blocked ? 'blocked' : 'idle', title: short(row.body), detail: row.yourAnswer ?? row.route, entry: row, action: { kind: 'none' } }
}

function prDetail(pr: WaitingPr): string {
  if (pr.kind === 'wave') return `Wave ${pr.wave} of ${pr.sprint} is handed back to you.`
  if (pr.kind === 'final') return "The plan's final PR is reviewed and waits for you."
  return 'The fix PR is reviewed and waits for you.'
}

const prItem = (pr: WaitingPr, repoId: string): NextItem => ({
  key: `pr:${pr.number}`,
  tier: 'merge',
  status: 'needs-you',
  title: `Merge PR #${pr.number}`,
  detail: prDetail(pr),
  action: { kind: 'merge', repoId, number: pr.number },
})

/** One item for the whole panel, worded by its first sendable row, else its first row. */
function replyItem(panel: ReplyPanelView): NextItem | undefined {
  const row = panel.rows.find((r) => r.send !== undefined) ?? panel.rows[0]
  if (!row) return undefined
  return {
    key: `reply:${panel.target.run}`,
    tier: 'reply',
    status: panel.rows.some((r) => r.send !== undefined) ? 'ready' : 'needs-you',
    title: `Send ${row.word}`,
    detail: row.why,
    action: { kind: 'reply', panel },
  }
}

function nothingCard(run: RunSummary, repo: BoardRepo): NextItem {
  const status: NextStatus = run.state === 'blocked' ? 'blocked' : run.state === 'running' ? 'running' : 'idle'
  const empty = run.state === 'error' || run.state === 'unsupported' || run.plan === undefined
  return { key: 'nothing', tier: 'nothing', status, title: NOTHING_TITLE, detail: empty ? emptyMessage(run, repo) : run.where, action: { kind: 'none' } }
}

/** The selected run's Next step and the rest; undefined with no run or repo, or a run of another repo. */
export function nextSteps(run: RunSummary | undefined, repo: BoardRepo | undefined, now: number): NextSteps | undefined {
  if (!run || !repo || run.repoId !== repo.id) return undefined
  // waitingRows maps waitingEntries one to one, so an entry and its row share an index.
  const entries = waitingEntries(repo, run)
  const rows = waitingRows(repo, run)
  const keys = entryKeys(rows)
  const items: NextItem[] = entries.map((e, i) => entryItem(e, rows[i]!, keys[i]!, repo.id))
  // A repo row names no plan, so it has no PRs; a fix run's PRs carry its claim name.
  if (run.plan !== undefined) items.push(...waitingPrs(repo, now).filter((pr) => pr.run === run.plan).map((pr) => prItem(pr, repo.id)))
  const panel = replyPanel(run, repo, now)
  const reply = panel && replyItem(panel)
  if (reply) items.push(reply)
  // A stable sort: list order holds within a tier.
  const sorted = items.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
  const first = sorted[0]
  if (first && ACTION_TIERS.has(first.tier)) return { card: first, rest: sorted.slice(1) }
  return { card: nothingCard(run, repo), rest: sorted }
}

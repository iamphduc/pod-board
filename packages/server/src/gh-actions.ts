// The merge action's gh calls: the fresh PR read (preview, and before and after a merge), the
// merge call itself, and how the re-read maps to an outcome. Never passes --admin, --auto,
// --squash, --rebase, or --delete-branch. The rules and why are in pod-docs/feature-details/actions.md.

import type { MergeOutcome, MergePreview, MergeResult } from '@pod-board/model'
import { rollupChecks, type ExecResult, type GhExec } from './gh.ts'

export const MERGE_TIMEOUT_MS = 60_000
/** gh has no merge-queue field (checked against gh 2.92 `pr view --json`), so none is read. */
export const VIEW_FIELDS = 'number,state,url,title,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,autoMergeRequest'
const MESSAGE_MAX = 500
const SHA = /^[0-9a-f]{40}$/
const STATES: Record<string, MergePreview['state']> = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' }
const MERGEABLE: Record<string, MergePreview['mergeable']> = { MERGEABLE: 'mergeable', CONFLICTING: 'conflicting' }
// Escape sequences: CSI (colors, cursor) and OSC (links, titles).
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b./g

export type ReadResult = { ok: true; preview: MergePreview; autoMerge: boolean } | { ok: false; message: string }
export type MergeRun = Omit<MergeResult, 'logged'> & {
  /** Whether the merge call ran (step 2), so the caller drops the PR from gh's cache. */
  ran: boolean
}

/** gh's text without escape codes, trimmed, at most 500 chars; `fallback` when nothing is left. */
export function ghText(stderr: string | undefined, fallback: string): string {
  const text = (stderr ?? '').replace(ANSI, '').trim().slice(0, MESSAGE_MAX).trim()
  return text || fallback
}

const safeExec = async (exec: GhExec, args: string[], cwd: string, timeoutMs?: number): Promise<ExecResult> => {
  try {
    return await (timeoutMs === undefined ? exec(args, cwd) : exec(args, cwd, { timeoutMs }))
  } catch {
    return { status: 'failed', stdout: '' }
  }
}

/** A fresh `gh pr view` of PR `n`. Not ok when gh fails, or its url isn't `https://github.com/<owner>/<name>/pull/<n>`. */
export async function readPr(exec: GhExec, repoPath: string, n: number): Promise<ReadResult> {
  const r = await safeExec(exec, ['pr', 'view', String(n), '--json', VIEW_FIELDS], repoPath)
  if (r.status !== 'ok') return { ok: false, message: ghText(r.stderr, 'gh failed') }
  return parseView(r.stdout, n) ?? { ok: false, message: 'gh failed' }
}

function parseView(stdout: string, n: number): ReadResult | undefined {
  let data: unknown
  try {
    data = JSON.parse(stdout)
  } catch {
    return undefined
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
  const d = data as Record<string, unknown>
  const state = typeof d.state === 'string' ? STATES[d.state] : undefined
  const url = typeof d.url === 'string' ? d.url : ''
  const head = typeof d.headRefOid === 'string' ? d.headRefOid : ''
  if (!state || !isPullUrl(url, n) || !SHA.test(head)) return undefined
  return {
    ok: true,
    preview: {
      number: n,
      url,
      title: typeof d.title === 'string' ? d.title : '',
      headSha: head,
      state,
      checks: rollupChecks(d.statusCheckRollup),
      mergeable: (typeof d.mergeable === 'string' && MERGEABLE[d.mergeable]) || 'unknown',
      mergeState: typeof d.mergeStateStatus === 'string' ? d.mergeStateStatus : '',
    },
    autoMerge: d.autoMergeRequest !== null && typeof d.autoMergeRequest === 'object',
  }
}

const isPullUrl = (url: string, n: number) => {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)\/pull\/([1-9]\d*)$/.exec(url)
  return m !== null && Number(m[3]) === n
}

/**
 * Merges PR `n` if its head is still `headSha`: a fresh read, then exactly
 * `gh pr merge <url> --merge --match-head-commit <sha>` (60 s), then always a re-read.
 * `merged` only ever comes from the re-read.
 */
export async function mergePr(exec: GhExec, repoPath: string, n: number, headSha: string): Promise<MergeRun> {
  const before = await readPr(exec, repoPath, n)
  if (!before.ok) return { outcome: 'failed', number: n, message: before.message, ran: false }
  if (before.preview.headSha !== headSha) return { outcome: 'stale', number: n, headSha: before.preview.headSha, ran: false }

  const call = await safeExec(exec, ['pr', 'merge', before.preview.url, '--merge', '--match-head-commit', headSha], repoPath, MERGE_TIMEOUT_MS)
  const after = await readPr(exec, repoPath, n)
  const { outcome, message } = mergeOutcome(call, after)
  return { outcome, number: n, ...(message !== undefined ? { message } : {}), ran: true }
}

/** The contract's step 3, in order. */
function mergeOutcome(call: ExecResult, after: ReadResult): { outcome: MergeOutcome; message?: string } {
  if (after.ok && after.preview.state === 'merged') return { outcome: 'merged' }
  if (after.ok && after.preview.state === 'open' && after.autoMerge) return { outcome: 'auto-merge' }
  // No merge-queue field: an open PR with no auto-merge after a successful call is taken as queued.
  if (after.ok && after.preview.state === 'open' && call.status === 'ok') return { outcome: 'queued' }
  if (call.status !== 'ok') return { outcome: 'failed', message: ghText(call.stderr, 'gh pr merge failed') }
  if (after.ok) return { outcome: 'failed', message: 'PR is closed' }
  return { outcome: 'unconfirmed', message: "gh ran the merge, but couldn't read the PR again to confirm it. Check it on GitHub." }
}

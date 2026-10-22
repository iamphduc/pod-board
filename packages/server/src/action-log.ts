// The action log: one JSON line per merge request in `<config dir>/actions.jsonl`, and the newest
// 50 in memory for the Board. Read once at start; bad lines are skipped. The rules and why are in
// pod-docs/feature-details/actions.md.

import { readFileSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import type { ActionEntry, MergeOutcome } from '@pod-board/model'

export const ACTION_LOG_MAX = 50
const RESULTS = new Set<MergeOutcome>(['merged', 'queued', 'auto-merge', 'stale', 'failed', 'unconfirmed'])

export type ActionLog = {
  /** Stamps the entry with `now()` and appends it as one line. `false` when it couldn't be written; then it isn't listed either. */
  append(entry: Omit<ActionEntry, 'at'>): Promise<boolean>
  /** The newest 50, newest first. */
  recent(): ActionEntry[]
}

export function createActionLog(opts: { file: string; now: () => number }): ActionLog {
  let { entries, partial } = readEntries(opts.file)
  return {
    async append(entry) {
      const full: ActionEntry = { at: opts.now(), ...entry }
      // A last line cut short (a crash mid-write) gets its own line, so the new entry stays readable.
      const line = (partial ? '\n' : '') + JSON.stringify(full) + '\n'
      try {
        await appendFile(opts.file, line, { encoding: 'utf8', mode: 0o600 })
      } catch {
        return false
      }
      partial = false
      entries = [full, ...entries].slice(0, ACTION_LOG_MAX)
      return true
    },
    recent: () => entries,
  }
}

/** The newest 50 good entries, newest first. A missing or unreadable file is an empty list. */
function readEntries(file: string): { entries: ActionEntry[]; partial: boolean } {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return { entries: [], partial: false }
  }
  const out: ActionEntry[] = []
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0 && out.length < ACTION_LOG_MAX; i--) {
    const entry = parseEntry(lines[i]!)
    if (entry) out.push(entry)
  }
  return { entries: out, partial: text.length > 0 && !text.endsWith('\n') }
}

function parseEntry(line: string): ActionEntry | undefined {
  let d: unknown
  try {
    d = JSON.parse(line)
  } catch {
    return undefined
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return undefined
  const e = d as Record<string, unknown>
  const str = (k: string) => typeof e[k] === 'string'
  if (typeof e.at !== 'number' || !Number.isFinite(e.at) || e.action !== 'merge' || !str('repoId') || !str('repo') || !str('target')) return undefined
  if (!RESULTS.has(e.result as MergeOutcome)) return undefined
  if (e.message !== undefined && !str('message')) return undefined
  const entry: ActionEntry = { at: e.at, action: 'merge', repoId: e.repoId as string, repo: e.repo as string, target: e.target as string, result: e.result as MergeOutcome }
  if (e.message !== undefined) entry.message = e.message as string
  return entry
}

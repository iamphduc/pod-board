// Readers for the small formats inside pod's docs: the docs version line, a
// status board's PR and Depends on cells, a queue entry's "needs you" rule,
// and the extra lines of a plan doc. Pure string functions: no I/O, and no
// import from the ported pod-flow parsers (the queue entry is typed by shape).

export const SUPPORTED_DOCS_VERSION = 2

export type DocsVersion =
  | { supported: true; version: 2 }
  | { supported: false; version: number | undefined }

export type PrRef = {
  state: 'none' | 'open' | 'merged' | 'skipped' | 'blocked' | 'unknown'
  number?: number
  url?: string
}

function lines(text: string): string[] {
  return text.replace(/^﻿/, '').split(/\r?\n/)
}

/** The value of the first line that is exactly `<label> <integer>`, spaces around it allowed. */
function firstIntegerLine(text: string, label: string): number | undefined {
  for (const line of lines(text)) {
    const m = new RegExp(`^${label}[ \\t]+(\\d+)$`).exec(line.trim())
    if (m?.[1] !== undefined) return Number(m[1])
  }
  return undefined
}

/** The docs version from `pod-docs/README.md`: its first `pod docs: <N>` line. */
export function docsVersion(readme: string | undefined): DocsVersion {
  const version = readme === undefined ? undefined : firstIntegerLine(readme, 'pod docs:')
  return version === SUPPORTED_DOCS_VERSION
    ? { supported: true, version: SUPPORTED_DOCS_VERSION }
    : { supported: false, version }
}

const URL_PATTERN = /https?:\/\/[^\s<>()[\]]+/gi
const NO_REFERENCE = new Set(['', '—', '-'])
const DONE_STATUSES = new Set(['done', 'merged'])

/** A status board's PR cell, read with the slice's status. */
export function prRef(cell: string, sliceStatus: string): PrRef {
  const text = cell.trim()
  const url = text.match(URL_PATTERN)?.[0]
  // Words and `#N` count only outside links, so a repo or anchor named
  // "merged" in a URL doesn't change the state.
  const words = text.replace(URL_PATTERN, ' ')
  const pull = url === undefined ? undefined : /\/pull\/(\d+)/.exec(url)?.[1]
  const hash = /#(\d+)\b/.exec(words)?.[1]
  const digits = pull ?? hash
  const ref: Omit<PrRef, 'state'> = {}
  if (digits !== undefined) ref.number = Number(digits)
  if (url !== undefined) ref.url = url

  const has = (word: string) => new RegExp(`\\b${word}\\b`, 'i').test(words)
  const status = sliceStatus.trim().toLowerCase()
  if (has('skipped')) return { state: 'skipped', ...ref }
  if (has('blocked')) return { state: 'blocked', ...ref }
  if (has('merged') || DONE_STATUSES.has(status)) return { state: 'merged', ...ref }
  if (url !== undefined || hash !== undefined) return { state: 'open', ...ref }
  if (NO_REFERENCE.has(text)) return { state: 'none' }
  return { state: 'unknown' }
}

/** A status board's Depends on cell: slice codes, in order, each once. */
export function sliceDeps(cell: string): string[] {
  const text = cell.trim()
  if (NO_REFERENCE.has(text) || text.toLowerCase() === 'none') return []
  const codes = text.split(',').map((part) => part.replace(/[`\s]/g, ''))
  return [...new Set(codes.filter((code) => code !== ''))]
}

/** Whether a queue entry waits on the human. */
export function needsYou(entry: { type: string; route: string; isPending: boolean }): boolean {
  if (!entry.isPending) return false
  const type = entry.type.trim().toUpperCase()
  if (type === 'SOLVED') return false
  if (type === 'BLOCKED') return true
  const arrow = /(?:→|->)\s*(.*)$/.exec(entry.route)
  return arrow?.[1]?.trim().toLowerCase() === 'human'
}

/** The plan doc lines the board reads beyond `parsePlan`. */
export function planExtras(md: string): { portBase?: number; go: 'unknown' } {
  const portBase = firstIntegerLine(md, 'Port base:')
  // pod doesn't record `go` yet (decisions.md, 2026-10-18), so no format is guessed.
  return portBase !== undefined && portBase >= 1 && portBase <= 65535
    ? { portBase, go: 'unknown' }
    : { go: 'unknown' }
}

export type PlanLook = { kind: 'set' | 'none' | 'empty'; direction?: string }
export type PlanFacts = { grilledWith?: string; look?: PlanLook; researchLinks?: string[] }

/** Not built yet. */
export function planFacts(_md: string): PlanFacts {
  return {}
}

/** Not built yet. */
export function stagingBranch(_decisions: string | undefined): string | undefined {
  return undefined
}

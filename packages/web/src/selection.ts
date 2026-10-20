// Which run and view the page shows, from the URL hash:
//   #/<repoId>                      a repo's plan-less run (idle, unsupported, or error)
//   #/<repoId>/<plan>               a run's pipeline (screen 1)
//   #/<repoId>/<plan>/board         its wave board (screen 2)
//   #/<repoId>/<plan>/board/<code>  the board with slice <code> open (screen 3)
// A hash that names no run falls back to the first run's pipeline; no runs means
// none. `resolveSelection` also returns the hash that names what it picked, so the
// page can put it in the URL and a vanished run's hash doesn't come back to life.

import type { RunSummary } from '@pod-board/model'

/** How often live minutes recompute without a new Board. */
export const LIVE_TICK_MS = 30_000

export type View = 'pipeline' | 'board'
export type RouteKey = { repoId: string; plan?: string; view: View; slice?: string }

const enc = encodeURIComponent

/** The hash for a run's view. A plan-less run only has its pipeline; a slice only opens on the board. */
export function hashFor(r: Pick<RunSummary, 'repoId' | 'plan'>, view: View = 'pipeline', slice?: string): string {
  const base = `#/${enc(r.repoId)}`
  if (r.plan === undefined) return base
  const run = `${base}/${enc(r.plan)}`
  if (view !== 'board') return run
  return slice === undefined ? `${run}/board` : `${run}/board/${enc(slice)}`
}

export function parseHash(hash: string): RouteKey | undefined {
  const m = /^#\/([^/]+)(?:\/([^/]+)(?:\/(board)(?:\/([^/]+))?)?)?$/.exec(hash)
  if (!m) return undefined
  try {
    const key: RouteKey = { repoId: decodeURIComponent(m[1]!), view: m[3] === undefined ? 'pipeline' : 'board' }
    if (m[2] !== undefined) key.plan = decodeURIComponent(m[2])
    if (m[4] !== undefined) key.slice = decodeURIComponent(m[4])
    return key
  } catch {
    return undefined
  }
}

export type Selection = { run: RunSummary | undefined; view: View; slice: string | undefined; hash: string | undefined }

/**
 * The run, view, and open slice a hash names, corrected: an unknown run → the first
 * run's pipeline; a plan-less run → its pipeline; a slice that `slicesOf(run)` doesn't
 * list → the board with none open. Without `slicesOf`, a slice is kept as named.
 */
export function resolveSelection(runs: RunSummary[], hash: string, slicesOf?: (run: RunSummary) => string[]): Selection {
  const key = parseHash(hash)
  const named = key && runs.find((r) => r.repoId === key.repoId && r.plan === key.plan)
  const run = named ?? runs[0]
  if (!run) return { run: undefined, view: 'pipeline', slice: undefined, hash: undefined }
  const view: View = named && key.view === 'board' && run.plan !== undefined ? 'board' : 'pipeline'
  const wanted = view === 'board' ? key?.slice : undefined
  const slice = wanted !== undefined && (!slicesOf || slicesOf(run).includes(wanted)) ? wanted : undefined
  return { run, view, slice, hash: hashFor(run, view, slice) }
}

/** Calls `onNow` with the time every `every` ms until the returned stop is called. */
export function startClock(onNow: (now: number) => void, every = LIVE_TICK_MS): () => void {
  const id = setInterval(() => onNow(Date.now()), every)
  return () => clearInterval(id)
}

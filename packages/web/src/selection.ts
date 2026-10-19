// Which run screen 1 shows, from the URL hash `#/<repoId>/<plan>` (`#/<repoId>`
// for a repo's plan-less run: idle, unsupported, or error). A hash that names no
// run falls back to the first run; no runs means none. `resolveSelection` also
// returns the hash that names the run it picked, so the page can put it in the
// URL and a vanished run's hash doesn't come back to life later.

import type { RunSummary } from '@pod-board/model'

/** How often live minutes recompute without a new Board. */
export const LIVE_TICK_MS = 30_000

export type RunKey = { repoId: string; plan: string | undefined }

export const hashFor = (r: Pick<RunSummary, 'repoId' | 'plan'>) =>
  `#/${encodeURIComponent(r.repoId)}${r.plan === undefined ? '' : `/${encodeURIComponent(r.plan)}`}`

export function parseHash(hash: string): RunKey | undefined {
  const m = /^#\/([^/]+)(?:\/([^/]+))?$/.exec(hash)
  if (!m) return undefined
  try {
    return { repoId: decodeURIComponent(m[1]!), plan: m[2] === undefined ? undefined : decodeURIComponent(m[2]) }
  } catch {
    return undefined
  }
}

export function resolveSelection(runs: RunSummary[], hash: string): { run: RunSummary | undefined; hash: string | undefined } {
  const key = parseHash(hash)
  const run = (key && runs.find((r) => r.repoId === key.repoId && r.plan === key.plan)) ?? runs[0]
  return { run, hash: run ? hashFor(run) : undefined }
}

/** Calls `onNow` with the time every `every` ms until the returned stop is called. */
export function startClock(onNow: (now: number) => void, every = LIVE_TICK_MS): () => void {
  const id = setInterval(() => onNow(Date.now()), every)
  return () => clearInterval(id)
}

import { execFile } from 'node:child_process'
import type { GhStatus, PrStatus } from '@pod-board/model'

// The contract types live in the model; re-exported for callers of this module.
export type { GhStatus, PrStatus }

/** `not-found`: the `gh` binary isn't on PATH. `failed`: it ran and exited non-zero, timed out, or was killed. */
export type ExecResult = { status: 'ok' | 'failed' | 'not-found'; stdout: string }
export type GhExec = (args: string[], cwd: string) => Promise<ExecResult>

export type GhReader = {
  status(): GhStatus
  /** When `gh auth status` last ran. */
  checkedAt(): number | undefined
  get(repoPath: string, n: number): PrStatus | undefined
  /** Fetches the PRs that are due. `true` when the gh status or any PR's number, state, checks, or url changed. */
  refresh(repoPath: string, numbers: number[]): Promise<boolean>
}

export const AUTH_RECHECK_MS = 60_000
export const PR_CACHE_MS = 30_000
export const GH_TIMEOUT_MS = 10_000
const PR_FIELDS = 'number,state,url,statusCheckRollup'

/** Runs `gh` directly (no shell) with a 10 s timeout and prompts turned off. */
export const defaultGhExec: GhExec = (args, cwd) =>
  new Promise((resolve) => {
    execFile(
      'gh',
      args,
      {
        cwd,
        timeout: GH_TIMEOUT_MS,
        windowsHide: true,
        shell: false,
        env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' },
      },
      (err, stdout) => {
        if (!err) return resolve({ status: 'ok', stdout: String(stdout) })
        const code = (err as NodeJS.ErrnoException).code
        resolve({ status: code === 'ENOENT' ? 'not-found' : 'failed', stdout: String(stdout ?? '') })
      },
    )
  })

type Entry = { value?: PrStatus; fetchedAt?: number; inflight?: Promise<boolean> }

export function createGhReader(opts: { exec?: GhExec; now?: () => number } = {}): GhReader {
  const exec = opts.exec ?? defaultGhExec
  const now = opts.now ?? Date.now
  let status: GhStatus = 'unknown'
  let authAt: number | undefined
  let authInflight: Promise<boolean> | undefined
  const cache = new Map<string, Entry>()

  const keyOf = (repoPath: string, n: number) => `${n}\u0000${repoPath}`

  const safeExec = async (args: string[], cwd: string): Promise<ExecResult> => {
    try {
      return await exec(args, cwd)
    } catch {
      return { status: 'failed', stdout: '' }
    }
  }

  const setStatus = (next: GhStatus) => {
    const changed = next !== status
    status = next
    return changed
  }

  /** Runs `gh auth status` when it's due; returns whether the status changed. */
  const checkAuth = (cwd: string): Promise<boolean> => {
    if (authInflight) return authInflight
    if (authAt !== undefined && now() - authAt < AUTH_RECHECK_MS) return Promise.resolve(false)
    authInflight = (async () => {
      const r = await safeExec(['auth', 'status'], cwd)
      authAt = now()
      return setStatus(r.status === 'ok' ? 'ok' : r.status === 'not-found' ? 'missing' : 'logged-out')
    })().finally(() => {
      authInflight = undefined
    })
    return authInflight
  }

  const fetchPr = async (repoPath: string, n: number, entry: Entry): Promise<boolean> => {
    const r = await safeExec(['pr', 'view', String(n), '--json', PR_FIELDS], repoPath)
    const at = now()
    entry.fetchedAt = at
    if (r.status === 'not-found') return setStatus('missing')
    if (r.status !== 'ok') return false
    const next = parsePrView(r.stdout, n, at)
    if (!next) return false
    const prev = entry.value
    entry.value = next
    return !prev || prev.state !== next.state || prev.checks !== next.checks || prev.url !== next.url
  }

  const refreshPr = (repoPath: string, n: number): Promise<boolean> => {
    const key = keyOf(repoPath, n)
    let entry = cache.get(key)
    if (!entry) cache.set(key, (entry = {}))
    if (entry.inflight) return entry.inflight
    if (entry.value && entry.value.state !== 'open') return Promise.resolve(false)
    if (entry.fetchedAt !== undefined && now() - entry.fetchedAt < PR_CACHE_MS) return Promise.resolve(false)
    const e = entry
    e.inflight = fetchPr(repoPath, n, e).finally(() => {
      e.inflight = undefined
    })
    return e.inflight
  }

  return {
    status: () => status,
    checkedAt: () => authAt,
    getBranch: () => undefined,
    get:(repoPath, n) => cache.get(keyOf(repoPath, n))?.value,
    async refresh(repoPath, numbers) {
      let changed = await checkAuth(repoPath)
      if (status !== 'ok') return changed
      const wanted = [...new Set(numbers)].filter((n) => Number.isSafeInteger(n) && n > 0)
      const results = await Promise.all(wanted.map((n) => refreshPr(repoPath, n)))
      for (const r of results) changed ||= r
      return changed
    },
  }
}

const STATES: Record<string, PrStatus['state']> = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' }
// CheckRun conclusions and StatusContext states that mean the check failed.
const FAILED = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'STARTUP_FAILURE', 'ACTION_REQUIRED'])

/** Maps `gh pr view --json number,state,url,statusCheckRollup` output; `undefined` when it isn't usable. */
export function parsePrView(stdout: string, n: number, checkedAt: number): PrStatus | undefined {
  let data: unknown
  try {
    data = JSON.parse(stdout)
  } catch {
    return undefined
  }
  if (!data || typeof data !== 'object') return undefined
  const d = data as Record<string, unknown>
  const state = typeof d.state === 'string' ? STATES[d.state] : undefined
  if (!state) return undefined
  const pr: PrStatus = { number: n, state, checks: rollupChecks(d.statusCheckRollup), checkedAt }
  if (typeof d.url === 'string' && d.url) pr.url = d.url
  return pr
}

function rollupChecks(rollup: unknown): PrStatus['checks'] {
  if (!Array.isArray(rollup) || rollup.length === 0) return 'none'
  let pending = false
  for (const item of rollup) {
    const c = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    if (c.__typename === 'StatusContext' || (c.status === undefined && typeof c.state === 'string')) {
      const s = String(c.state)
      if (FAILED.has(s)) return 'fail'
      if (s !== 'SUCCESS') pending = true
    } else if (c.status !== 'COMPLETED') {
      pending = true
    } else if (FAILED.has(String(c.conclusion))) {
      return 'fail'
    }
  }
  return pending ? 'pending' : 'pass'
}

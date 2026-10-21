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
  /** The PR found by its head branch (a fix run's `fix-<slug>`), with `branch` set. */
  getBranch(repoPath: string, branch: string): PrStatus | undefined
  /**
   * Fetches the PRs that are due, by number and by head branch. `true` when the gh status or
   * any PR's number, state, checks, or url changed.
   */
  refresh(repoPath: string, numbers: number[], branches?: string[]): Promise<boolean>
}

export const AUTH_RECHECK_MS = 60_000
export const PR_CACHE_MS = 30_000
export const GH_TIMEOUT_MS = 10_000
const PR_FIELDS = 'number,state,url,statusCheckRollup'
const LIST_FIELDS = `${PR_FIELDS},headRefName`
/** A branch gh can't read as a flag, with no spaces or shell characters. */
const BRANCH = /^[A-Za-z0-9][\w./-]{0,199}$/

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
  const branchKey = (repoPath: string, branch: string) => `branch\u0000${branch}\u0000${repoPath}`

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

  /** Runs one gh read for an entry and keeps what `parse` makes of it; `undefined` keeps the last value. */
  const fetchInto = async (
    args: string[],
    repoPath: string,
    entry: Entry,
    parse: (stdout: string, at: number) => PrStatus | undefined,
  ): Promise<boolean> => {
    const r = await safeExec(args, repoPath)
    const at = now()
    entry.fetchedAt = at
    if (r.status === 'not-found') return setStatus('missing')
    if (r.status !== 'ok') return false
    const next = parse(r.stdout, at)
    if (!next) return false
    const prev = entry.value
    entry.value = next
    return !prev || prev.number !== next.number || prev.state !== next.state || prev.checks !== next.checks || prev.url !== next.url
  }

  /**
   * Fetches an entry when it's due: not final, and not fetched in the last PR_CACHE_MS. By number,
   * merged and closed are final. By branch, only merged is: a closed PR can be reopened, or a new PR
   * opened on the same branch, while the fix run's claim lasts.
   */
  const refreshEntry = (key: string, fetch: (entry: Entry) => Promise<boolean>, isFinal: (pr: PrStatus) => boolean): Promise<boolean> => {
    let entry = cache.get(key)
    if (!entry) cache.set(key, (entry = {}))
    if (entry.inflight) return entry.inflight
    if (entry.value && isFinal(entry.value)) return Promise.resolve(false)
    if (entry.fetchedAt !== undefined && now() - entry.fetchedAt < PR_CACHE_MS) return Promise.resolve(false)
    const e = entry
    e.inflight = fetch(e).finally(() => {
      e.inflight = undefined
    })
    return e.inflight
  }

  const refreshPr = (repoPath: string, n: number) =>
    refreshEntry(
      keyOf(repoPath, n),
      (e) => fetchInto(['pr', 'view', String(n), '--json', PR_FIELDS], repoPath, e, (out, at) => parsePrView(out, n, at)),
      (pr) => pr.state !== 'open',
    )

  const refreshBranch = (repoPath: string, branch: string) =>
    refreshEntry(
      branchKey(repoPath, branch),
      (e) =>
        fetchInto(['pr', 'list', '--head', branch, '--state', 'all', '--json', LIST_FIELDS, '--limit', '10'], repoPath, e, (out, at) =>
          parsePrList(out, branch, at),
        ),
      (pr) => pr.state === 'merged',
    )

  return {
    status: () => status,
    checkedAt: () => authAt,
    get: (repoPath, n) => cache.get(keyOf(repoPath, n))?.value,
    getBranch: (repoPath, branch) => cache.get(branchKey(repoPath, branch))?.value,
    async refresh(repoPath, numbers, branches = []) {
      let changed = await checkAuth(repoPath)
      if (status !== 'ok') return changed
      const wanted = [...new Set(numbers)].filter((n) => Number.isSafeInteger(n) && n > 0)
      const heads = [...new Set(branches)].filter((b) => BRANCH.test(b))
      const results = await Promise.all([...wanted.map((n) => refreshPr(repoPath, n)), ...heads.map((b) => refreshBranch(repoPath, b))])
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
  return prOf(data, n, checkedAt)
}

function prOf(data: unknown, n: number, checkedAt: number): PrStatus | undefined {
  if (!data || typeof data !== 'object') return undefined
  const d = data as Record<string, unknown>
  const state = typeof d.state === 'string' ? STATES[d.state] : undefined
  if (!state) return undefined
  const pr: PrStatus = { number: n, state, checks: rollupChecks(d.statusCheckRollup), checkedAt }
  if (typeof d.url === 'string' && d.url) pr.url = d.url
  return pr
}

/**
 * Maps `gh pr list --head <branch> --json number,state,url,statusCheckRollup,headRefName` output to
 * the branch's PR, with `branch` set: the open one, else the newest. Entries for another head are
 * skipped. `undefined` when the output isn't a list or holds no usable entry (no PR yet).
 */
export function parsePrList(stdout: string, branch: string, checkedAt: number): PrStatus | undefined {
  let data: unknown
  try {
    data = JSON.parse(stdout)
  } catch {
    return undefined
  }
  if (!Array.isArray(data)) return undefined
  const prs: PrStatus[] = []
  for (const item of data) {
    const d = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    if (d.headRefName !== branch || typeof d.number !== 'number' || !Number.isSafeInteger(d.number) || d.number < 1) continue
    const pr = prOf(d, d.number, checkedAt)
    if (pr) prs.push(pr)
  }
  const pick = prs.find((p) => p.state === 'open') ?? prs.sort((a, b) => b.number - a.number)[0]
  return pick && { ...pick, branch }
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

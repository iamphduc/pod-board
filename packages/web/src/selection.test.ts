import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunSummary } from '@pod-board/model'
import { hashFor, parseHash, resolveSelection, startClock, LIVE_TICK_MS } from './selection.ts'

const run = (repoId: string, plan?: string): RunSummary => ({
  repoId,
  repo: repoId,
  where: 'x',
  state: plan ? 'running' : 'idle',
  ...(plan ? { plan } : {}),
})

const runs = [run('e--projects-a', 'alpha'), run('e--projects-a', 'beta'), run('e--projects-b')]

describe('selected run', () => {
  it('the hash picks the run', () => {
    expect(resolveSelection(runs, '#/e--projects-a/beta').run).toBe(runs[1])
    expect(resolveSelection(runs, '#/e--projects-b').run).toBe(runs[2])
  })

  it('an unknown, empty, or malformed hash gives the first run', () => {
    for (const hash of ['', '#', '#/', '#/nope/alpha', '#/e--projects-a/gamma', '#/e--projects-a', 'garbage', '#/%E0%A4%A']) {
      expect(resolveSelection(runs, hash).run).toBe(runs[0])
    }
  })

  it('a repo hash with a plan does not pick that repo’s plan-less run', () => {
    expect(resolveSelection(runs, '#/e--projects-b/alpha').run).toBe(runs[0])
  })

  it('no runs gives none', () => {
    expect(resolveSelection([], '#/e--projects-a/alpha')).toEqual({ run: undefined, hash: undefined })
  })

  it('when the selected run vanishes, the selection moves to the first and the hash follows', () => {
    const before = resolveSelection(runs, '#/e--projects-a/beta')
    expect(before.hash).toBe('#/e--projects-a/beta')
    const after = resolveSelection([runs[0]!, runs[2]!], before.hash!)
    expect(after.run).toBe(runs[0])
    expect(after.hash).toBe('#/e--projects-a/alpha')
  })

  it('hashFor and parseHash round-trip, plan or no plan', () => {
    for (const r of runs) expect(parseHash(hashFor(r))).toEqual({ repoId: r.repoId, plan: r.plan })
    expect(hashFor(run('a b', 'p/q'))).toBe('#/a%20b/p%2Fq')
    expect(parseHash('#/a%20b/p%2Fq')).toEqual({ repoId: 'a b', plan: 'p/q' })
  })
})

describe('live clock', () => {
  afterEach(() => vi.useRealTimers())

  it('ticks every 30 s until stopped', () => {
    vi.useFakeTimers()
    const ticks: number[] = []
    const stop = startClock((now) => ticks.push(now))
    expect(LIVE_TICK_MS).toBe(30_000)
    vi.advanceTimersByTime(29_999)
    expect(ticks).toHaveLength(0)
    vi.advanceTimersByTime(1)
    vi.advanceTimersByTime(30_000)
    expect(ticks).toHaveLength(2)
    stop()
    vi.advanceTimersByTime(90_000)
    expect(ticks).toHaveLength(2)
  })
})

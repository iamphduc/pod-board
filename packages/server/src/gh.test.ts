import { describe, expect, test } from 'vitest'
import { createGhReader, type ExecResult, type GhExec } from './gh.ts'

const REPO = 'E:\\Projects\\chess-web'
const PR_FIELDS = 'number,state,url,statusCheckRollup'

type Call = { args: string[]; cwd: string }

function prJson(n: number, state: string, rollup: unknown[] | null = [], url = `https://github.com/o/r/pull/${n}`) {
  return JSON.stringify({ number: n, state, url, statusCheckRollup: rollup })
}

const run = (conclusion: string | null, status = 'COMPLETED') => ({
  __typename: 'CheckRun',
  name: 'verify',
  status,
  conclusion: conclusion ?? '',
})
const ctx = (state: string) => ({ __typename: 'StatusContext', context: 'ci', state })

/** A fake `gh`: records every call; answers auth and pr view from mutable settings. */
type FakeGh = {
  calls: Call[]
  auth: ExecResult['status']
  prs: Map<number, ExecResult>
  hold: boolean
  waiting: (() => void)[]
  release(): void
  prViews(): number
  authCalls(): number
  exec: GhExec
}

function fakeGh(): FakeGh {
  const calls: Call[] = []
  const gh: FakeGh = {
    calls,
    auth: 'ok',
    prs: new Map<number, ExecResult>(),
    /** When set, pr view calls wait until `release()` is called. */
    hold: false,
    waiting: [],
    release() {
      for (const w of gh.waiting.splice(0)) w()
    },
    prViews: () => calls.filter((c) => c.args[0] === 'pr').length,
    authCalls: () => calls.filter((c) => c.args[0] === 'auth').length,
    exec: async (args, cwd) => {
      calls.push({ args, cwd })
      if (args[0] === 'auth') return { status: gh.auth, stdout: '' }
      if (gh.hold) await new Promise<void>((r) => gh.waiting.push(r))
      const n = Number(args[2])
      return gh.prs.get(n) ?? { status: 'failed', stdout: '' }
    },
  }
  return gh
}

function clock(start = 1_000_000) {
  const c = { t: start, now: () => c.t, advance: (ms: number) => (c.t += ms) }
  return c
}

const ok = (stdout: string): ExecResult => ({ status: 'ok', stdout })

describe('createGhReader', () => {
  test('runs only read-only commands', async () => {
    const gh = fakeGh()
    const c = clock()
    gh.prs.set(7, ok(prJson(7, 'OPEN')))
    gh.prs.set(9, ok(prJson(9, 'MERGED')))
    const reader = createGhReader({ exec: gh.exec, now: c.now })

    await reader.refresh(REPO, [7, 9])
    c.advance(61_000)
    await reader.refresh(REPO, [7, 9, 7])
    gh.auth = 'failed'
    c.advance(61_000)
    await reader.refresh(REPO, [7])

    expect(gh.calls.length).toBeGreaterThan(0)
    for (const call of gh.calls) {
      expect(call.cwd).toBe(REPO)
      const isAuth = call.args.length === 2 && call.args[0] === 'auth' && call.args[1] === 'status'
      const isView =
        call.args.length === 5 &&
        call.args[0] === 'pr' &&
        call.args[1] === 'view' &&
        /^[1-9]\d*$/.test(call.args[2] ?? '') &&
        call.args[3] === '--json' &&
        call.args[4] === PR_FIELDS
      expect(isAuth || isView, JSON.stringify(call.args)).toBe(true)
    }
    expect(gh.prViews()).toBe(3)
  })

  test('never passes a bad PR number to gh', async () => {
    const gh = fakeGh()
    const reader = createGhReader({ exec: gh.exec, now: clock().now })
    await reader.refresh(REPO, [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
    expect(gh.prViews()).toBe(0)
  })

  describe('gh status', () => {
    test('starts unknown with no check time', () => {
      const reader = createGhReader({ exec: fakeGh().exec, now: clock().now })
      expect(reader.status()).toBe('unknown')
      expect(reader.checkedAt()).toBeUndefined()
    })

    test('ok after a passing auth status, with its check time', async () => {
      const gh = fakeGh()
      const c = clock()
      gh.prs.set(1, ok(prJson(1, 'OPEN')))
      const reader = createGhReader({ exec: gh.exec, now: c.now })
      expect(await reader.refresh(REPO, [1])).toBe(true)
      expect(reader.status()).toBe('ok')
      expect(reader.checkedAt()).toBe(c.t)
    })

    test('gh not found → missing, and no pr view runs', async () => {
      const gh = fakeGh()
      gh.auth = 'not-found'
      const reader = createGhReader({ exec: gh.exec, now: clock().now })
      expect(await reader.refresh(REPO, [1])).toBe(true)
      expect(reader.status()).toBe('missing')
      expect(gh.prViews()).toBe(0)
    })

    test('auth fails → logged-out with no pr view; recheck after 60 s, not before', async () => {
      const gh = fakeGh()
      const c = clock()
      gh.auth = 'failed'
      gh.prs.set(1, ok(prJson(1, 'OPEN')))
      const reader = createGhReader({ exec: gh.exec, now: c.now })

      expect(await reader.refresh(REPO, [1])).toBe(true)
      expect(reader.status()).toBe('logged-out')
      expect(reader.checkedAt()).toBe(c.t)
      expect(gh.prViews()).toBe(0)
      expect(gh.authCalls()).toBe(1)

      gh.auth = 'ok'
      c.advance(59_999)
      expect(await reader.refresh(REPO, [1])).toBe(false)
      expect(reader.status()).toBe('logged-out')
      expect(gh.authCalls()).toBe(1)
      expect(gh.prViews()).toBe(0)

      c.advance(1)
      expect(await reader.refresh(REPO, [1])).toBe(true)
      expect(reader.status()).toBe('ok')
      expect(gh.authCalls()).toBe(2)
      expect(gh.prViews()).toBe(1)
      expect(reader.get(REPO, 1)?.state).toBe('open')
    })

    test('a missing gh is rechecked after 60 s too', async () => {
      const gh = fakeGh()
      const c = clock()
      gh.auth = 'not-found'
      const reader = createGhReader({ exec: gh.exec, now: c.now })
      await reader.refresh(REPO, [])
      c.advance(30_000)
      await reader.refresh(REPO, [])
      expect(gh.authCalls()).toBe(1)
      gh.auth = 'ok'
      c.advance(30_000)
      await reader.refresh(REPO, [])
      expect(reader.status()).toBe('ok')
    })

    test('logging out later is noticed within 60 s, and the last PR values stay', async () => {
      const gh = fakeGh()
      const c = clock()
      gh.prs.set(1, ok(prJson(1, 'OPEN')))
      const reader = createGhReader({ exec: gh.exec, now: c.now })
      await reader.refresh(REPO, [1])
      gh.auth = 'failed'
      c.advance(60_000)
      expect(await reader.refresh(REPO, [1])).toBe(true)
      expect(reader.status()).toBe('logged-out')
      expect(gh.prViews()).toBe(1)
      expect(reader.get(REPO, 1)?.state).toBe('open')
    })

    test('gh vanishing during pr view → missing', async () => {
      const gh = fakeGh()
      gh.prs.set(1, { status: 'not-found', stdout: '' })
      const reader = createGhReader({ exec: gh.exec, now: clock().now })
      await reader.refresh(REPO, [1])
      expect(reader.status()).toBe('missing')
      expect(reader.get(REPO, 1)).toBeUndefined()
    })

    test('two refreshes at once share one auth status call', async () => {
      const gh = fakeGh()
      const reader = createGhReader({ exec: gh.exec, now: clock().now })
      await Promise.all([reader.refresh(REPO, []), reader.refresh(REPO, [])])
      expect(gh.authCalls()).toBe(1)
    })
  })

  test('caches each PR for 30 seconds', async () => {
    const gh = fakeGh()
    const c = clock()
    gh.prs.set(5, ok(prJson(5, 'OPEN', [run(null, 'IN_PROGRESS')])))
    const reader = createGhReader({ exec: gh.exec, now: c.now })

    expect(await reader.refresh(REPO, [5])).toBe(true)
    expect(gh.prViews()).toBe(1)
    expect(reader.get(REPO, 5)).toEqual({
      number: 5,
      state: 'open',
      checks: 'pending',
      url: 'https://github.com/o/r/pull/5',
      checkedAt: c.t,
    })

    // A second ask within 30 s makes no call.
    c.advance(29_999)
    expect(await reader.refresh(REPO, [5])).toBe(false)
    expect(gh.prViews()).toBe(1)

    // After 30 s it does; unchanged values report no change but update checkedAt.
    c.advance(1)
    expect(await reader.refresh(REPO, [5])).toBe(false)
    expect(gh.prViews()).toBe(2)
    expect(reader.get(REPO, 5)?.checkedAt).toBe(c.t)

    // A changed value reports a change.
    gh.prs.set(5, ok(prJson(5, 'OPEN', [run('SUCCESS')])))
    c.advance(30_000)
    expect(await reader.refresh(REPO, [5])).toBe(true)
    expect(reader.get(REPO, 5)?.checks).toBe('pass')

    // Two asks at once make one call, and both see the value.
    gh.hold = true
    c.advance(30_000)
    const a = reader.refresh(REPO, [5])
    const b = reader.refresh(REPO, [5])
    await new Promise((r) => setTimeout(r, 0))
    gh.release()
    await Promise.all([a, b])
    expect(gh.prViews()).toBe(4)

    // Duplicates in one ask make one call.
    gh.hold = false
    c.advance(30_000)
    await reader.refresh(REPO, [5, 5, 5])
    expect(gh.prViews()).toBe(5)
  })

  test('caches per repo folder', async () => {
    const gh = fakeGh()
    gh.prs.set(1, ok(prJson(1, 'OPEN')))
    const reader = createGhReader({ exec: gh.exec, now: clock().now })
    await reader.refresh(REPO, [1])
    expect(reader.get('E:\\Projects\\other', 1)).toBeUndefined()
    await reader.refresh('E:\\Projects\\other', [1])
    expect(gh.prViews()).toBe(2)
    expect(gh.calls.at(-1)?.cwd).toBe('E:\\Projects\\other')
  })

  describe('final and failed PRs', () => {
    test('a merged or closed PR is never fetched again', async () => {
      const gh = fakeGh()
      const c = clock()
      gh.prs.set(1, ok(prJson(1, 'MERGED')))
      gh.prs.set(2, ok(prJson(2, 'CLOSED')))
      const reader = createGhReader({ exec: gh.exec, now: c.now })
      await reader.refresh(REPO, [1, 2])
      expect(gh.prViews()).toBe(2)
      for (let i = 0; i < 5; i++) {
        c.advance(10 * 60_000)
        expect(await reader.refresh(REPO, [1, 2])).toBe(false)
      }
      expect(gh.prViews()).toBe(2)
      expect(reader.get(REPO, 1)?.state).toBe('merged')
      expect(reader.get(REPO, 2)?.state).toBe('closed')
    })

    test('a failed fetch keeps the last value', async () => {
      const gh = fakeGh()
      const c = clock()
      gh.prs.set(3, ok(prJson(3, 'OPEN', [run('SUCCESS')])))
      const reader = createGhReader({ exec: gh.exec, now: c.now })
      await reader.refresh(REPO, [3])
      const before = reader.get(REPO, 3)

      gh.prs.set(3, { status: 'failed', stdout: '' })
      c.advance(30_000)
      expect(await reader.refresh(REPO, [3])).toBe(false)
      expect(reader.get(REPO, 3)).toEqual(before)

      // Unparseable output counts as a failure too.
      gh.prs.set(3, ok('not json'))
      c.advance(30_000)
      expect(await reader.refresh(REPO, [3])).toBe(false)
      expect(reader.get(REPO, 3)).toEqual(before)

      gh.prs.set(3, ok(JSON.stringify({ number: 3, state: 'WEIRD' })))
      c.advance(30_000)
      expect(await reader.refresh(REPO, [3])).toBe(false)
      expect(reader.get(REPO, 3)).toEqual(before)
    })

    test('a failed fetch still waits 30 s before the next try', async () => {
      const gh = fakeGh()
      const c = clock()
      gh.prs.set(3, { status: 'failed', stdout: '' })
      const reader = createGhReader({ exec: gh.exec, now: c.now })
      await reader.refresh(REPO, [3])
      c.advance(10_000)
      await reader.refresh(REPO, [3])
      expect(gh.prViews()).toBe(1)
      expect(reader.get(REPO, 3)).toBeUndefined()
    })

    test('an exec that throws counts as a failed fetch', async () => {
      const gh = fakeGh()
      const exec: GhExec = async (args, cwd) => {
        if (args[0] === 'pr') throw new Error('boom')
        return gh.exec(args, cwd)
      }
      const reader = createGhReader({ exec, now: clock().now })
      await expect(reader.refresh(REPO, [3])).resolves.toBe(true)
      expect(reader.status()).toBe('ok')
      expect(reader.get(REPO, 3)).toBeUndefined()
    })
  })

  describe('maps pr view output', () => {
    async function view(stdout: string) {
      const gh = fakeGh()
      gh.prs.set(4, ok(stdout))
      const reader = createGhReader({ exec: gh.exec, now: clock().now })
      await reader.refresh(REPO, [4])
      return reader.get(REPO, 4)
    }
    const checks = async (rollup: unknown[] | null) => (await view(prJson(4, 'OPEN', rollup)))?.checks

    test('state', async () => {
      expect((await view(prJson(4, 'OPEN')))?.state).toBe('open')
      expect((await view(prJson(4, 'MERGED')))?.state).toBe('merged')
      expect((await view(prJson(4, 'CLOSED')))?.state).toBe('closed')
    })

    test('url', async () => {
      expect((await view(prJson(4, 'OPEN')))?.url).toBe('https://github.com/o/r/pull/4')
      const noUrl = await view(JSON.stringify({ number: 4, state: 'OPEN', statusCheckRollup: [] }))
      expect(noUrl).toBeDefined()
      expect(noUrl?.url).toBeUndefined()
    })

    test('no rollup → none', async () => {
      expect(await checks([])).toBe('none')
      expect(await checks(null)).toBe('none')
      expect((await view(JSON.stringify({ number: 4, state: 'OPEN' })))?.checks).toBe('none')
    })

    test('any failed, errored, cancelled, or timed-out → fail', async () => {
      for (const c of ['FAILURE', 'CANCELLED', 'TIMED_OUT', 'STARTUP_FAILURE', 'ACTION_REQUIRED']) {
        expect(await checks([run('SUCCESS'), run(c)]), c).toBe('fail')
      }
      expect(await checks([ctx('SUCCESS'), ctx('FAILURE')])).toBe('fail')
      expect(await checks([ctx('ERROR')])).toBe('fail')
      // A failure wins over a check still running.
      expect(await checks([run(null, 'IN_PROGRESS'), run('FAILURE')])).toBe('fail')
    })

    test('any not completed → pending', async () => {
      for (const s of ['QUEUED', 'IN_PROGRESS', 'WAITING', 'PENDING', 'REQUESTED']) {
        expect(await checks([run('SUCCESS'), run(null, s)]), s).toBe('pending')
      }
      expect(await checks([ctx('PENDING')])).toBe('pending')
      expect(await checks([ctx('EXPECTED')])).toBe('pending')
    })

    test('else pass', async () => {
      expect(await checks([run('SUCCESS'), run('NEUTRAL'), run('SKIPPED'), ctx('SUCCESS')])).toBe('pass')
    })

    test('real gh output', async () => {
      const real = JSON.stringify({
        number: 4,
        state: 'MERGED',
        statusCheckRollup: [
          {
            __typename: 'CheckRun',
            completedAt: '2026-10-19T05:30:10Z',
            conclusion: 'SUCCESS',
            name: 'verify (ubuntu-latest)',
            status: 'COMPLETED',
            workflowName: 'pod-ci',
          },
        ],
        url: 'https://github.com/iamphduc/pod-board/pull/3',
      })
      expect(await view(real)).toMatchObject({ number: 4, state: 'merged', checks: 'pass' })
    })
  })
})

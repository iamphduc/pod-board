import { describe, expect, test } from 'vitest'
import { MERGE_TIMEOUT_MS, QUEUE_QUERY, VIEW_FIELDS, mergePr, readPr } from './gh-actions.ts'
import type { ExecResult, GhExec } from './gh.ts'

const REPO = 'E:\\Projects\\chess-web'
const SHA = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)
const URL7 = 'https://github.com/o/r/pull/7'

type View = Partial<{
  number: number
  state: string
  url: string
  title: string
  headRefOid: string
  mergeable: string
  mergeStateStatus: string
  statusCheckRollup: unknown[]
  autoMergeRequest: unknown
}>

const view = (over: View = {}): ExecResult => ({
  status: 'ok',
  stdout: JSON.stringify({
    number: 7,
    state: 'OPEN',
    url: URL7,
    title: 'Wave 2: merge routes',
    headRefOid: SHA,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    autoMergeRequest: null,
    ...over,
  }),
})

type Call = { args: string[]; cwd: string; timeoutMs?: number }

/** GitHub's GraphQL answer for the PR's merge-queue entry (`null` → not in a queue). */
const queue = (entry: unknown): ExecResult => ({
  status: 'ok',
  stdout: JSON.stringify({ data: { repository: { pullRequest: { mergeQueueEntry: entry } } } }),
})
const QUEUED = queue({ state: 'QUEUED' })

/**
 * A fake gh: answers each `pr view` from `views` in turn (the last repeats), `pr merge` with `merge`,
 * and `api graphql` with `graphql`.
 */
function fakeGh(views: (ExecResult | Error)[], merge: ExecResult | Error = { status: 'ok', stdout: '' }, graphql: ExecResult | Error = queue(null)) {
  const calls: Call[] = []
  let i = 0
  const exec: GhExec = async (args, cwd, opts) => {
    calls.push({ args, cwd, ...(opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}) })
    const answer = args[0] === 'api' ? graphql : args[1] === 'merge' ? merge : views[Math.min(i++, views.length - 1)]!
    if (answer instanceof Error) throw answer
    return answer
  }
  return {
    calls,
    exec,
    merges: () => calls.filter((c) => c.args[1] === 'merge'),
    graphqls: () => calls.filter((c) => c.args[0] === 'api'),
  }
}

describe('merge', () => {
  test('merge argv is exact', async () => {
    const gh = fakeGh([view(), view({ state: 'MERGED' })])
    await mergePr(gh.exec, REPO, 7, SHA)
    expect(gh.merges()).toEqual([{ args: ['pr', 'merge', URL7, '--merge', '--match-head-commit', SHA], cwd: REPO, timeoutMs: MERGE_TIMEOUT_MS }])
    expect(MERGE_TIMEOUT_MS).toBe(60_000)
    const flags = gh.merges()[0]!.args.filter((a) => a.startsWith('-'))
    expect(flags).toEqual(['--merge', '--match-head-commit'])
    // Reads before and after use the one field list.
    for (const c of gh.calls.filter((c) => c.args[1] === 'view')) expect(c.args).toEqual(['pr', 'view', '7', '--json', VIEW_FIELDS])
  })

  test('outcome comes from the re-read', async () => {
    const run = async (reread: ExecResult | Error, merge?: ExecResult, graphql?: ExecResult | Error) =>
      mergePr(fakeGh([view(), reread], merge, graphql).exec, REPO, 7, SHA)
    expect(await run(view({ state: 'MERGED' }))).toEqual({ outcome: 'merged', number: 7, ran: true })
    expect(await run(view({ autoMergeRequest: { enabledAt: '2026-10-21T00:00:00Z', mergeMethod: 'MERGE' } }))).toMatchObject({ outcome: 'auto-merge' })
    // Open with no auto-merge after a successful call: queued only when GitHub shows a merge-queue entry.
    expect(await run(view(), undefined, QUEUED)).toEqual({ outcome: 'queued', number: 7, ran: true })
    expect(await run(view(), undefined, queue({ state: 'UNMERGEABLE' }))).toMatchObject({ outcome: 'queued' })
    const notQueued = await run(view(), undefined, queue(null))
    expect(notQueued).toMatchObject({ outcome: 'unconfirmed', ran: true })
    expect(notQueued.message).toMatch(/GitHub hasn't confirmed the merge yet/)
    // The queue question fails → unconfirmed, never queued.
    const answers: (ExecResult | Error)[] = [
      { status: 'failed', stdout: '', stderr: 'HTTP 502' },
      new Error('spawn'),
      { status: 'ok', stdout: 'not json' },
      { status: 'ok', stdout: JSON.stringify({ data: { repository: { pullRequest: null } }, errors: [{ type: 'NOT_FOUND' }] }) },
      { status: 'ok', stdout: JSON.stringify({ data: { repository: null } }) },
      { status: 'ok', stdout: JSON.stringify({ data: { repository: { pullRequest: { mergeQueueEntry: 'QUEUED' } } } }) },
      { status: 'failed', stdout: QUEUED.stdout },
    ]
    for (const answer of answers) {
      expect(await run(view(), undefined, answer), String(answer instanceof Error ? answer : answer.stdout)).toMatchObject({
        outcome: 'unconfirmed',
        message: expect.stringMatching(/GitHub hasn't confirmed the merge yet/),
      })
    }
    expect(await run(view({ state: 'CLOSED' }))).toEqual({ outcome: 'failed', number: 7, message: 'PR is closed', ran: true })
    const unread = await run({ status: 'failed', stdout: '' })
    expect(unread).toMatchObject({ outcome: 'unconfirmed', ran: true })
    expect(unread.message).toMatch(/couldn't read the PR again/i)
    expect((await run(new Error('spawn'))).outcome).toBe('unconfirmed')
    expect((await run({ status: 'ok', stdout: 'not json' })).outcome).toBe('unconfirmed')
  })

  test('the merge queue is asked only for an open PR after a successful call', async () => {
    // The one case: one GraphQL call, after the merge, on the re-read url's owner and name, default timeout.
    const gh = fakeGh([view(), view({ url: 'https://github.com/123/9.x/pull/7' })], undefined, QUEUED)
    expect((await mergePr(gh.exec, REPO, 7, SHA)).outcome).toBe('queued')
    // Owner and name as raw strings (-f): -F would turn "123" into a number.
    expect(gh.graphqls()).toEqual([
      { args: ['api', 'graphql', '-f', `query=${QUEUE_QUERY}`, '-f', 'owner=123', '-f', 'name=9.x', '-F', 'number=7'], cwd: REPO },
    ])
    expect(gh.calls.findIndex((c) => c.args[0] === 'api')).toBeGreaterThan(gh.calls.findIndex((c) => c.args[1] === 'merge'))
    expect(QUEUE_QUERY).toMatch(/pullRequest\(number: \$number\)\s*\{\s*mergeQueueEntry\s*\{\s*state\s*\}/)

    const failed: ExecResult = { status: 'failed', stdout: '', stderr: 'no' }
    const none: [string, (ExecResult | Error)[], (ExecResult | Error)?][] = [
      ['merged', [view(), view({ state: 'MERGED' })]],
      ['closed', [view(), view({ state: 'CLOSED' })]],
      ['auto-merge', [view(), view({ autoMergeRequest: { mergeMethod: 'MERGE' } })]],
      ['failed call, open re-read', [view(), view()], failed],
      ['failed call, thrown', [view(), view()], new Error('boom')],
      ['failed re-read', [view(), { status: 'failed', stdout: '' }]],
      ['stale', [view({ headRefOid: OTHER })]],
      ['failed first read', [{ status: 'failed', stdout: '' }]],
    ]
    for (const [name, views, merge] of none) {
      const g = fakeGh(views, merge, QUEUED)
      const r = await mergePr(g.exec, REPO, 7, SHA)
      expect(g.graphqls(), name).toEqual([])
      expect(r.outcome, name).not.toBe('queued')
    }
    // A failed call with an open re-read keeps gh's text.
    expect(await mergePr(fakeGh([view(), view()], failed, QUEUED).exec, REPO, 7, SHA)).toMatchObject({ outcome: 'failed', message: 'no' })
    // The preview never asks.
    const p = fakeGh([view()], undefined, QUEUED)
    await readPr(p.exec, REPO, 7)
    expect(p.graphqls()).toEqual([])
  })

  test('failure shows gh\'s text', async () => {
    const failed = (stderr?: string): ExecResult => ({ status: 'failed', stdout: '', ...(stderr !== undefined ? { stderr } : {}) })
    const run = async (merge: ExecResult | Error, reread: ExecResult = view()) => mergePr(fakeGh([view(), reread], merge).exec, REPO, 7, SHA)

    // A failed or timed-out call whose re-read says MERGED is merged.
    expect((await run(failed('timed out'), view({ state: 'MERGED' }))).outcome).toBe('merged')
    expect((await run(failed('x'), view({ autoMergeRequest: {} }))).outcome).toBe('auto-merge')

    expect(await run(failed('\u001b[31mX\u001b[0m Pull request #7 is not mergeable: the merge commit cannot be cleanly created.\n'))).toEqual({
      outcome: 'failed',
      number: 7,
      message: 'X Pull request #7 is not mergeable: the merge commit cannot be cleanly created.',
      ran: true,
    })
    const long = await run(failed(`  ${'e'.repeat(800)}  `))
    expect(long.message).toBe('e'.repeat(500))
    expect((await run(failed('  \n\u001b[0m '))).message).toBe('gh pr merge failed')
    expect((await run(failed())).message).toBe('gh pr merge failed')
    expect((await run(new Error('boom'))).message).toBe('gh pr merge failed')
    // A failed call beats a closed or unreadable re-read: gh's text is the reason.
    expect(await run(failed('no'), view({ state: 'CLOSED' }))).toMatchObject({ outcome: 'failed', message: 'no' })
    expect(await run(failed('no'), { status: 'failed', stdout: '' })).toMatchObject({ outcome: 'failed', message: 'no' })
  })

  test('a moved head is stale and never merged', async () => {
    const gh = fakeGh([view({ headRefOid: OTHER })])
    expect(await mergePr(gh.exec, REPO, 7, SHA)).toEqual({ outcome: 'stale', number: 7, headSha: OTHER, ran: false })
    expect(gh.merges()).toEqual([])
  })

  test('a read that fails before the merge runs no merge', async () => {
    for (const first of [{ status: 'failed', stdout: '', stderr: 'HTTP 502' } as ExecResult, view({ url: 'https://evil.example/o/r/pull/7' })]) {
      const gh = fakeGh([first])
      const r = await mergePr(gh.exec, REPO, 7, SHA)
      expect(r).toMatchObject({ outcome: 'failed', ran: false })
      expect(gh.merges()).toEqual([])
    }
  })
})

describe('preview', () => {
  test('preview reads and checks the PR', async () => {
    const gh = fakeGh([view({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY', statusCheckRollup: [{ __typename: 'CheckRun', status: 'IN_PROGRESS' }] })])
    expect(await readPr(gh.exec, REPO, 7)).toEqual({
      ok: true,
      preview: {
        number: 7,
        url: URL7,
        title: 'Wave 2: merge routes',
        headSha: SHA,
        state: 'open',
        checks: 'pending',
        mergeable: 'conflicting',
        mergeState: 'DIRTY',
      },
      autoMerge: false,
    })
    expect(gh.calls).toEqual([{ args: ['pr', 'view', '7', '--json', VIEW_FIELDS], cwd: REPO }])

    const one = async (r: ExecResult) => readPr(fakeGh([r]).exec, REPO, 7)
    expect(await one(view({ mergeable: 'MERGEABLE', statusCheckRollup: [] }))).toMatchObject({ preview: { mergeable: 'mergeable', checks: 'none' } })
    expect(await one(view({ mergeable: 'UNKNOWN' }))).toMatchObject({ preview: { mergeable: 'unknown' } })
    expect(await one(view({ mergeable: 'WHAT' }))).toMatchObject({ preview: { mergeable: 'unknown' } })
    expect(await one(view({ autoMergeRequest: { mergeMethod: 'MERGE' } }))).toMatchObject({ autoMerge: true })

    // Not this PR's GitHub pull url → not ok.
    for (const url of ['https://github.com/o/r/pull/8', 'https://github.com.evil/o/r/pull/7', 'http://github.com/o/r/pull/7', 'https://github.com/o/r/pull/7/files', 'https://github.com/o/pull/7', '']) {
      expect(await one(view({ url })), url).toEqual({ ok: false, message: 'gh failed' })
    }
    // gh's own text, cleaned; else the fallback.
    expect(await one({ status: 'failed', stdout: '', stderr: '\u001b[1mGraphQL: Could not resolve\u001b[0m\n' })).toEqual({ ok: false, message: 'GraphQL: Could not resolve' })
    expect(await one({ status: 'failed', stdout: '' })).toEqual({ ok: false, message: 'gh failed' })
    expect(await one({ status: 'ok', stdout: '{' })).toEqual({ ok: false, message: 'gh failed' })
    expect(await one(view({ headRefOid: 'abc' }))).toEqual({ ok: false, message: 'gh failed' })
    expect(await one(view({ state: 'DRAFTY' }))).toEqual({ ok: false, message: 'gh failed' })
    expect(await readPr(async () => Promise.reject(new Error('x')), REPO, 7)).toEqual({ ok: false, message: 'gh failed' })
  })
})

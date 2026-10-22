import { describe, expect, test } from 'vitest'
import { MERGE_TIMEOUT_MS, VIEW_FIELDS, mergePr, readPr } from './gh-actions.ts'
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

/** A fake gh: answers each `pr view` from `views` in turn (the last repeats) and `pr merge` with `merge`. */
function fakeGh(views: (ExecResult | Error)[], merge: ExecResult | Error = { status: 'ok', stdout: '' }) {
  const calls: Call[] = []
  let i = 0
  const exec: GhExec = async (args, cwd, opts) => {
    calls.push({ args, cwd, ...(opts?.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}) })
    const answer = args[1] === 'merge' ? merge : views[Math.min(i++, views.length - 1)]!
    if (answer instanceof Error) throw answer
    return answer
  }
  return { calls, exec, merges: () => calls.filter((c) => c.args[1] === 'merge') }
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
    const run = async (reread: ExecResult | Error, merge?: ExecResult) => mergePr(fakeGh([view(), reread], merge).exec, REPO, 7, SHA)
    expect(await run(view({ state: 'MERGED' }))).toEqual({ outcome: 'merged', number: 7, ran: true })
    expect(await run(view({ autoMergeRequest: { enabledAt: '2026-10-21T00:00:00Z', mergeMethod: 'MERGE' } }))).toMatchObject({ outcome: 'auto-merge' })
    // gh has no merge-queue field: an open PR with no auto-merge after a successful call is queued.
    expect(await run(view())).toMatchObject({ outcome: 'queued' })
    expect(await run(view({ state: 'CLOSED' }))).toEqual({ outcome: 'failed', number: 7, message: 'PR is closed', ran: true })
    const unread = await run({ status: 'failed', stdout: '' })
    expect(unread).toMatchObject({ outcome: 'unconfirmed', ran: true })
    expect(unread.message).toMatch(/couldn't read the PR again/i)
    expect((await run(new Error('spawn'))).outcome).toBe('unconfirmed')
    expect((await run({ status: 'ok', stdout: 'not json' })).outcome).toBe('unconfirmed')
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

import { describe, expect, it } from 'vitest'
import { buildRepoModel, runReplies, type AgentRun, type BoardRepo, type Claim, type PrStatus, type ReplySignal, type RunSummary } from '@pod-board/model'
import { NO_SESSION, replyPanel } from './reply-view.ts'

const NOW = Date.UTC(2026, 9, 21, 12)
const MIN = 60_000
const README = '# pod docs\n\npod docs: 2\n'

const PLAN = [
  '# Plan: alpha',
  '',
  '_Generated: 2026-10-21 · Status: active · Grilled-with: grilling_',
  '',
  '## Sprint sequence',
  '',
  '| Sprint | Goal | Status | Depends on |',
  '|--------|------|--------|------------|',
  '| one | goal | active | — |',
  '',
].join('\n')

const SPRINT = [
  '# Sprint: one',
  '',
  '_From plan: pod-docs/plans/alpha.md · Slug: one · Status: active · Generated: 2026-10-21_',
  '',
  '## Status board',
  '',
  '| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |',
  '|------|-------|-------|--------|----|--------|------------|------------|',
  '| 1 | A1 | Title | one-A1 | [#7](https://github.com/o/r/pull/7) | pushed | medium | — |',
  '',
].join('\n')

const PATH = 'E:\\Projects\\some repo with a long folder name'

function repo(agents: AgentRun[] = []): BoardRepo {
  const model = buildRepoModel({ 'pod-docs/README.md': README, 'pod-docs/plans/alpha.md': PLAN, 'pod-docs/sprints/one.md': SPRINT })
  return { id: 'id-r', name: 'r', path: PATH, source: 'registered', model, agents, prs: [], claims: [] }
}

const agent = (over: Partial<AgentRun>): AgentRun => ({ id: 'a1', session: 's', type: 'pod:engineer', tokens: 0, ended: true, plan: 'alpha', ...over })
const run = (over: Partial<RunSummary> = {}): RunSummary => ({ repoId: 'id-r', repo: 'r', plan: 'alpha', where: 'one · wave 1/1', state: 'needs-you', ...over })

const clock = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

describe('reply panel', () => {
  it('rows keep word, why, and session lines', () => {
    const start = NOW - 50 * MIN
    const id = '0f6c1e2a-5b7d-4c11-9a3e-2d4f6b8c0e1a'
    const view = replyPanel(run(), repo([agent({ session: id, startedAt: start, lastAt: NOW - 40 * MIN })]), NOW)
    // The word, its why, and the chat: session line, its first agent's time, cd and resume.
    expect(view).toEqual({
      target: { repoId: 'id-r', run: 'alpha' },
      rows: [{ key: 'continue', word: 'continue', why: 'Merge PR #7, then reply continue.' }],
      session: { line: `Session ${id}`, time: `first agent ${clock(start)}`, path: PATH, cd: `cd "${PATH}"`, resume: `claude --resume ${id}` },
    })

    // No start known: no time. An id outside the pattern: no resume line, only the id.
    const odd = replyPanel(run(), repo([agent({ session: 'odd id', startedAt: undefined, lastAt: NOW - 40 * MIN })]), NOW)
    expect(odd?.session).toEqual({ line: 'Session odd id', path: PATH, cd: `cd "${PATH}"` })

    // No session: the no-session text instead.
    const none = replyPanel(run(), repo(), NOW)
    expect(none).toEqual({ target: { repoId: 'id-r', run: 'alpha' }, rows: [{ key: 'continue', word: 'continue', why: 'Merge PR #7, then reply continue.' }], noSession: NO_SESSION })

    // A row with a send button keeps its word and why, and the session lines stay as they were.
    const sendable = repo([agent({ session: id, startedAt: start, lastAt: NOW - 40 * MIN })])
    sendable.prs = [{ number: 7, state: 'merged', checks: 'pass', checkedAt: NOW }]
    expect(replyPanel(run(), sendable, NOW)).toEqual({
      target: { repoId: 'id-r', run: 'alpha' },
      rows: [{ key: 'continue', word: 'continue', why: 'PR #7 merged.', send: 'continue' }],
      session: { line: `Session ${id}`, time: `first agent ${clock(start)}`, path: PATH, cd: `cd "${PATH}"`, resume: `claude --resume ${id}` },
    })
    expect(NO_SESSION).toBe('No pod session found for this run. Paste it in the chat that runs it.')

    // Nothing for a repo row, no run, no repo, or a run with no reply.
    expect(replyPanel(run({ plan: undefined, where: 'no active plan', state: 'idle' }), repo(), NOW)).toBeUndefined()
    expect(replyPanel(undefined, repo(), NOW)).toBeUndefined()
    expect(replyPanel(run(), undefined, NOW)).toBeUndefined()
    const working = repo([agent({ sprint: 'one', slice: 'A1', ended: false, startedAt: NOW - 5 * MIN, lastAt: NOW - MIN })])
    expect(replyPanel(run(), working, NOW)).toBeUndefined()
  })
})

// One fixture per signal, the same shapes as the model's auto-continue tests.

type SprintRow = [slug: string, status: string]
type BoardRow = [wave: number, code: string, pr: string, status: string]

const planDoc = (sprints: SprintRow[]) =>
  [
    '# Plan: alpha',
    '',
    '_Generated: 2026-10-22 · Status: active · Grilled-with: grilling_',
    '',
    '## Sprint sequence',
    '',
    '| Sprint | Goal | Status | Depends on |',
    '|--------|------|--------|------------|',
    ...sprints.map(([s, st]) => `| ${s} | goal | ${st} | — |`),
    '',
  ].join('\n')

const sprintDoc = (slug: string, rows: BoardRow[]) =>
  [
    `# Sprint: ${slug}`,
    '',
    `_From plan: pod-docs/plans/alpha.md · Slug: ${slug} · Status: active · Generated: 2026-10-22_`,
    '',
    '## Status board',
    '',
    '| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |',
    '|------|-------|-------|--------|----|--------|------------|------------|',
    ...rows.map(([w, code, pr, status]) => `| ${w} | ${code} | Title | ${slug}-${code} | ${pr} | ${status} | medium | — |`),
    '',
  ].join('\n')

type Opts = { sprints?: SprintRow[]; docs?: Record<string, BoardRow[]>; queue?: string[] }
const gh = (number: number, state: PrStatus['state'], over: Partial<PrStatus> = {}): PrStatus => ({ number, state, checks: 'pass', checkedAt: NOW, ...over })
const claim = (plan: string): Claim => ({ portBase: 3100, repoPath: '/r', plan })
const link = (n: number) => `[#${n}](https://github.com/o/r/pull/${n})`
const handBack = (n: number) =>
  `- \`[2026-10-22 · PENDING · orchestrator → human · plan: alpha]\` Plan complete: merge https://github.com/o/r/pull/${n} **Resolution:** pending`

function planRepo(opts: Opts, extra: Partial<BoardRepo> = {}): BoardRepo {
  const files: Record<string, string> = {
    'pod-docs/README.md': README,
    'pod-docs/plans/alpha.md': planDoc(opts.sprints ?? [['one', 'active']]),
    'pod-docs/handoff-queue.md': (opts.queue ?? []).join('\n'),
  }
  for (const [s, rows] of Object.entries(opts.docs ?? {})) files[`pod-docs/sprints/${s}.md`] = sprintDoc(s, rows)
  const a = agent({ session: 'sess-1', startedAt: NOW - 60 * MIN, lastAt: NOW - 40 * MIN })
  return { id: 'id-r', name: 'r', path: '/r', source: 'registered', model: buildRepoModel(files), agents: [a], prs: [], claims: [], ...extra }
}

const FIX = 'fix-scroll'
function fixRepo(state: PrStatus['state']): BoardRepo {
  const eng = agent({ id: 'e1', plan: undefined, branch: FIX, session: 'sess-1', startedAt: NOW - 90 * MIN, lastAt: NOW - 60 * MIN })
  const rev = agent({ id: 'r1', plan: undefined, type: 'pod:reviewer', kind: 'fix', branch: FIX, session: 'sess-1', startedAt: NOW - 50 * MIN, lastAt: NOW - 5 * MIN })
  return {
    id: 'id-r',
    name: 'r',
    path: '/r',
    source: 'registered',
    model: buildRepoModel({ 'pod-docs/README.md': README }),
    agents: [eng, rev],
    prs: [gh(36, state, { branch: FIX })],
    claims: [claim(FIX)],
  }
}

const PUSHED: BoardRow[] = [
  [1, 'A1', `${link(5)} merged`, 'done'],
  [2, 'B1', link(7), 'pushed'],
]
const DONE: Opts = { sprints: [['one', 'done']], docs: { one: [[1, 'A1', 'merged', 'done']] }, queue: [handBack(12)] }
const BETWEEN: Opts = { sprints: [['one', 'done'], ['two', 'planned']], docs: { one: [[1, 'A1', 'merged', 'done']] } }
const FRESH: Opts = { sprints: [['one', 'planned'], ['two', 'planned']] }

type Sends = Partial<Record<string, 'continue' | 'go'>>
/** Each signal's repo and run, with the send each word's row gets. */
const BY_SIGNAL: Record<ReplySignal, { repo: BoardRepo; run: string; sends: Sends }> = {
  'wave-waiting': { repo: planRepo({ docs: { one: PUSHED } }), run: 'alpha', sends: {} },
  'wave-merged': { repo: planRepo({ docs: { one: PUSHED } }, { prs: [gh(7, 'merged')] }), run: 'alpha', sends: { continue: 'continue' } },
  'sprint-done': { repo: planRepo(BETWEEN), run: 'alpha', sends: { continue: 'continue' } },
  'final-waiting': { repo: planRepo(DONE), run: 'alpha', sends: {} },
  'final-merged': { repo: planRepo(DONE, { claims: [claim('alpha')], prs: [gh(12, 'merged')] }), run: 'alpha', sends: { continue: 'continue' } },
  'not-started': { repo: planRepo(FRESH), run: 'alpha', sends: { go: 'go' } },
  'fix-waiting': { repo: fixRepo('open'), run: FIX, sends: {} },
  'fix-merged': { repo: fixRepo('merged'), run: FIX, sends: { continue: 'continue' } },
}

describe('send buttons', () => {
  it('send buttons follow sendableReply', () => {
    for (const [signal, { repo: r, run: plan, sends }] of Object.entries(BY_SIGNAL)) {
      // The fixture gives the signal it names.
      expect(runReplies(r, plan, NOW).map((x) => x.signal), signal).toContain(signal)
      const fix = plan.startsWith('fix-') ? { fix: plan.slice(4) } : {}
      const view = replyPanel(run({ plan, ...fix }), r, NOW)
      expect(view, signal).toBeDefined()
      expect(view!.target, signal).toEqual({ repoId: 'id-r', run: plan })
      for (const row of view!.rows) {
        const want = sends[row.word]
        if (want === undefined) expect(row, `${signal} ${row.word}`).not.toHaveProperty('send')
        else expect(row.send, `${signal} ${row.word}`).toBe(want)
      }
    }
    // try never gets one: the final-waiting run shows continue and try, neither sendable.
    const fw = replyPanel(run(), BY_SIGNAL['final-waiting'].repo, NOW)
    expect(fw!.rows.map((r) => r.word)).toEqual(['continue', 'try'])
    expect(fw!.rows.some((r) => r.send !== undefined)).toBe(false)
    // A fresh plan's one row gets Go.
    expect(replyPanel(run(), BY_SIGNAL['not-started'].repo, NOW)!.rows).toEqual([{ key: 'go', word: 'go', why: 'Only if pod asked for go.', send: 'go' }])
    // Each sending row's word sends: continue on the merged wave.
    expect(replyPanel(run(), BY_SIGNAL['wave-merged'].repo, NOW)!.rows).toEqual([{ key: 'continue', word: 'continue', why: 'PR #7 merged.', send: 'continue' }])
  })
})

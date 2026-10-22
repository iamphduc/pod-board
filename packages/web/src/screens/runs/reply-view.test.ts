import { describe, expect, it } from 'vitest'
import { buildRepoModel, type AgentRun, type BoardRepo, type RunSummary } from '@pod-board/model'
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
  it('reply panel rows', () => {
    const start = NOW - 50 * MIN
    const id = '0f6c1e2a-5b7d-4c11-9a3e-2d4f6b8c0e1a'
    const view = replyPanel(run(), repo([agent({ session: id, startedAt: start, lastAt: NOW - 40 * MIN })]), NOW)
    // The word, its why, and the chat: session line, its first agent's time, cd and resume.
    expect(view).toEqual({
      rows: [{ key: 'continue', word: 'continue', why: 'Merge PR #7, then reply continue.' }],
      session: { line: `Session ${id}`, time: `first agent ${clock(start)}`, path: PATH, cd: `cd "${PATH}"`, resume: `claude --resume ${id}` },
    })

    // No start known: no time. An id outside the pattern: no resume line, only the id.
    const odd = replyPanel(run(), repo([agent({ session: 'odd id', startedAt: undefined, lastAt: NOW - 40 * MIN })]), NOW)
    expect(odd?.session).toEqual({ line: 'Session odd id', path: PATH, cd: `cd "${PATH}"` })

    // No session: the no-session text instead.
    const none = replyPanel(run(), repo(), NOW)
    expect(none).toEqual({ rows: [{ key: 'continue', word: 'continue', why: 'Merge PR #7, then reply continue.' }], noSession: NO_SESSION })
    expect(NO_SESSION).toBe('No pod session found for this run. Paste it in the chat that runs it.')

    // Nothing for a repo row, no run, no repo, or a run with no reply.
    expect(replyPanel(run({ plan: undefined, where: 'no active plan', state: 'idle' }), repo(), NOW)).toBeUndefined()
    expect(replyPanel(undefined, repo(), NOW)).toBeUndefined()
    expect(replyPanel(run(), undefined, NOW)).toBeUndefined()
    const working = repo([agent({ sprint: 'one', slice: 'A1', ended: false, startedAt: NOW - 5 * MIN, lastAt: NOW - MIN })])
    expect(replyPanel(run(), working, NOW)).toBeUndefined()
  })
})

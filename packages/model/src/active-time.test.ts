import { describe, expect, it } from 'vitest'
import type { AgentRun, BoardRepo } from './board.ts'
import { buildFixPipeline } from './fix-runs.ts'
import { buildPipeline } from './pipeline.ts'
import { buildRepoModel } from './run-model.ts'
import { IDLE_GAP_MS, parseAgentTranscript } from './transcript.ts'

// Slice, wave, and fix-run times count only active time: a gap between two records longer
// than IDLE_GAP_MS (the laptop asleep, a run left waiting) is left out. Tokens are unchanged.
// Every snapshot is built inline: test/no-io.test.ts scans this folder, so no file reads here.

const MIN = 60_000
const T0 = Date.parse('2026-10-25T08:50:00.000Z')
const at = (m: number) => new Date(T0 + m * MIN).toISOString()
const rec = (m: number, id: string) => ({ type: 'assistant', timestamp: at(m), message: { id, role: 'assistant', model: 'claude-opus-5-5', stop_reason: null, usage: { input_tokens: 10, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, content: [] } })
const prompt = (m: number) => ({ type: 'user', timestamp: at(m), message: { role: 'user', content: 'Build F1.' } })
const parse = (id: string, minutes: number[], end = false): AgentRun => {
  const lines = [prompt(minutes[0]!), ...minutes.slice(1).map((m, i) => rec(m, `${id}-${i}`))]
  if (end) lines.push({ type: 'assistant', timestamp: at(minutes.at(-1)!), message: { id: `${id}-end`, role: 'assistant', model: 'x', stop_reason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, content: [] } } as never)
  const run = parseAgentTranscript({ id, session: 's', meta: JSON.stringify({ agentType: 'pod:engineer' }), jsonl: lines.map((l) => JSON.stringify(l)).join('\n') })
  if (!run) throw new Error('not parsed')
  return run
}
const ms = (m: number) => T0 + m * MIN

describe('active spans from a transcript', () => {
  it('the idle-gap threshold is 10 minutes', () => {
    expect(IDLE_GAP_MS).toBe(10 * MIN)
  })

  it('a gap over 10 minutes splits the run; a gap of exactly 10 does not', () => {
    expect(parse('a', [0, 5, 10, 190, 195]).active).toEqual([[ms(0), ms(10)], [ms(190), ms(195)]])
    expect(parse('b', [0, 10, 20]).active).toEqual([[ms(0), ms(20)]])
    expect(parse('c', [0, 10.5]).active).toEqual([[ms(0), ms(0)], [ms(10.5), ms(10.5)]])
    // One record: a span of no length. No timestamps: no spans.
    expect(parse('d', [3]).active).toEqual([[ms(3), ms(3)]])
    const none = parseAgentTranscript({ id: 'e', session: 's', meta: JSON.stringify({ agentType: 'pod:engineer' }), jsonl: '{"type":"user"}' })
    expect(none).not.toHaveProperty('active')
  })

  it('start, last record, and tokens are unchanged', () => {
    const run = parse('a', [0, 5, 10, 190, 195])
    expect(run).toMatchObject({ startedAt: ms(0), lastAt: ms(195), tokens: 40 })
  })
})

const README = 'pod docs: 2\n'
const files = {
  'pod-docs/README.md': README,
  'pod-docs/plans/alpha.md': '# Plan: Alpha\n\n_Status: active_\n\n## Sprint sequence\n\n| Sprint | Goal | Status | Depends on |\n|---|---|---|---|\n| one | g | active | — |\n',
  'pod-docs/sprints/one.md': '# Sprint: one\n\n_From plan: pod-docs/plans/alpha.md · Slug: one · Status: active_\n\n## Status board\n\n| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |\n|---|---|---|---|---|---|---|---|\n| 1 | F1 | T | one-F1 | — | done | medium | — |\n| 2 | G1 | T | one-G1 | — | pending | — | — |\n',
}
const repo = (agents: AgentRun[], extra: Partial<BoardRepo> = {}): BoardRepo => ({ id: 'r', name: 'r', path: '/r', source: 'registered', model: buildRepoModel(files), agents, prs: [], claims: [], ...extra })
const slice = (a: AgentRun, code: string): AgentRun => ({ ...a, sprint: 'one', slice: code })

describe('slice and wave minutes count active time only', () => {
  // The pod-trial F1 slice: the first engineer worked 08:50–09:00, then wrote once after 180 min
  // and once after 997 more (the PC asleep); the re-dispatch worked 04:38–04:45 the next morning.
  const first = slice(parse('f1a', [0, 2, 4, 6, 8, 10, 190, 1187], true), 'F1')
  const second = slice(parse('f1b', [1188, 1190, 1192, 1195], true), 'F1')
  const now = ms(1300)

  it('F1 reads 17 min, not 1195', () => {
    const p = buildPipeline(repo([first, second]), 'alpha', now)
    const row = p?.log[0]?.rows[0]
    expect(row).toMatchObject({ code: 'F1', minutes: 17 })
    // Tokens unchanged: every message counted.
    expect(row?.tokens).toBe(first.tokens + second.tokens)
    expect(p?.stages.find((s) => s.key === 'sprint:one')?.steps[0]?.detail).toBe('2 engineers · 17 min · 100 tok')
  })

  it('parallel engineers overlap: the wave counts wall time they were active, once', () => {
    const a = slice(parse('pa', [0, 5, 10], true), 'F1')
    const b = slice(parse('pb', [5, 10, 15], true), 'F1')
    expect(buildPipeline(repo([a, b]), 'alpha', now)?.log[0]?.rows[0]?.minutes).toBe(15)
  })

  it('a live agent counts to now only while its last record is within the gap', () => {
    const live = slice(parse('l', [0, 5]), 'G1')
    // Last record 5 min ago: active up to now (10 min so far).
    expect(buildPipeline(repo([live]), 'alpha', ms(10))?.log[1]?.rows[0]).toMatchObject({ minutes: 10, live: true })
    // Last record 20 min ago (still running by the 30-minute rule): no time added after it.
    expect(buildPipeline(repo([live]), 'alpha', ms(25))?.log[1]?.rows[0]).toMatchObject({ minutes: 5, live: true })
  })

  it('an agent with no spans (an older Board) keeps the start-to-last rule', () => {
    const old: AgentRun = { id: 'o', session: 's', type: 'pod:engineer', sprint: 'one', slice: 'F1', tokens: 1, ended: true, startedAt: ms(0), lastAt: ms(30) }
    expect(buildPipeline(repo([old]), 'alpha', now)?.log[0]?.rows[0]?.minutes).toBe(30)
  })
})

describe('fix run steps count active time only', () => {
  it('an engineer that slept mid-build reads its active minutes', () => {
    const eng = { ...parse('fx', [0, 5, 10, 400, 404], true), branch: 'fix-scroll' }
    const r: BoardRepo = { id: 'r', name: 'r', path: '/r', source: 'claim', model: buildRepoModel({ 'pod-docs/README.md': README }), agents: [eng], prs: [], claims: [{ portBase: 3100, repoPath: '/r', plan: 'fix-scroll' }] }
    const build = buildFixPipeline(r, 'fix-scroll', ms(500))?.stages[0]?.steps[0]
    expect(build?.detail).toBe('14 min · 40 tok')
  })
})

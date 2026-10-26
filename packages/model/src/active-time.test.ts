import { describe, expect, it } from 'vitest'
import type { AgentRun, BoardRepo } from './board.ts'
import { buildFixPipeline } from './fix-runs.ts'
import { buildPipeline } from './pipeline.ts'
import { buildRepoModel } from './run-model.ts'
import { IDLE_GAP_MS, parseAgentTranscript } from './transcript.ts'

// Slice, wave, and fix-run times count only active time: a gap between two records longer
// than IDLE_GAP_MS (the laptop asleep, a run left waiting) is left out, unless it ends in the result of
// the tool call the agent was waiting on (up to 30 minutes). Tokens are unchanged.
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
  it('the idle-gap threshold is 15 minutes: headroom over the Bash tool’s 10-minute limit', () => {
    expect(IDLE_GAP_MS).toBe(15 * MIN)
  })

  it('a gap over 15 minutes splits the run; a gap of exactly 15 does not', () => {
    expect(parse('a', [0, 5, 10, 190, 195]).active).toEqual([[ms(0), ms(10)], [ms(190), ms(195)]])
    expect(parse('b', [0, 15, 30]).active).toEqual([[ms(0), ms(30)]])
    expect(parse('c', [0, 15.5]).active).toEqual([[ms(0), ms(0)], [ms(15.5), ms(15.5)]])
    // One record: a span of no length. No timestamps: no spans.
    expect(parse('d', [3]).active).toEqual([[ms(3), ms(3)]])
    const none = parseAgentTranscript({ id: 'e', session: 's', meta: JSON.stringify({ agentType: 'pod:engineer' }), jsonl: '{"type":"user"}' })
    expect(none).not.toHaveProperty('active')
  })

  // A Bash call that runs to its 600 s limit writes its result about 10.02 minutes after the call.
  const call = (m: number, id: string) => ({ type: 'assistant', timestamp: at(m), message: { id: `m-${id}`, role: 'assistant', model: 'x', stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, content: [{ type: 'tool_use', id, name: 'Bash', input: {} }] } })
  const result = (m: number, id: string) => ({ type: 'user', timestamp: at(m), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'x' }] } })
  const raw = (...lines: unknown[]) => parseAgentTranscript({ id: 't', session: 's', meta: JSON.stringify({ agentType: 'pod:engineer' }), jsonl: lines.map((l) => JSON.stringify(l)).join('\n') })

  it('a tool call that runs to the Bash limit counts as active', () => {
    expect(raw(prompt(0), call(1, 't1'), result(11.02, 't1'), rec(12, 'r')).active).toEqual([[ms(0), ms(12)]])
  })

  it('a gap ending in the pending tool call’s result counts up to 30 minutes, not hours', () => {
    expect(raw(prompt(0), call(1, 't1'), result(21, 't1')).active).toEqual([[ms(0), ms(21)]])
    // The same gap with no call waiting on that result (another record, or another call's result) splits.
    expect(raw(prompt(0), call(1, 't1'), rec(21, 'r')).active).toEqual([[ms(0), ms(1)], [ms(21), ms(21)]])
    expect(raw(prompt(0), call(1, 't1'), result(2, 't1'), result(22, 't1')).active).toEqual([[ms(0), ms(2)], [ms(22), ms(22)]])
    // The laptop asleep mid-call: three hours, result or not, is idle.
    expect(raw(prompt(0), call(1, 't1'), result(181, 't1')).active).toEqual([[ms(0), ms(1)], [ms(181), ms(181)]])
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
  // 10 min, plus 04:37–04:45: the minute between the two engineers is under the gap, so it counts.
  const first = slice(parse('f1a', [0, 2, 4, 6, 8, 10, 190, 1187], true), 'F1')
  const second = slice(parse('f1b', [1188, 1190, 1192, 1195], true), 'F1')
  const now = ms(1300)

  it('F1 reads 18 min, not 1195', () => {
    const p = buildPipeline(repo([first, second]), 'alpha', now)
    const row = p?.log[0]?.rows[0]
    expect(row).toMatchObject({ code: 'F1', minutes: 18 })
    // Tokens unchanged: every message counted.
    expect(row?.tokens).toBe(first.tokens + second.tokens)
    expect(p?.stages.find((s) => s.key === 'sprint:one')?.steps[0]?.detail).toBe('2 engineers · 18 min · 100 tok')
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

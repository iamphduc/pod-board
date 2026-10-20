import { describe, expect, it } from 'vitest'
import { STALE_MS, agentState, parseAgentTranscript } from './transcript.ts'
import type { AgentRun } from './board.ts'

// Transcripts are built inline in the shape the shared contract describes:
// test/no-io.test.ts scans this folder, so no file reads here.

type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }
type Block = Record<string, unknown>

const usage = (input: number, output: number, cacheWrite = 0, cacheRead = 0): Usage => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: cacheWrite,
  cache_read_input_tokens: cacheRead,
})

const T0 = Date.parse('2026-10-18T10:00:00.000Z')
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString()

const user = (minutes: number, content: string | Block[]) => ({ type: 'user', timestamp: at(minutes), message: { role: 'user', content } })

function assistant(
  minutes: number,
  id: string,
  opts: { usage?: Usage; stop?: string | null; model?: string; content?: Block[] } = {},
) {
  return {
    type: 'assistant',
    timestamp: at(minutes),
    message: {
      id,
      role: 'assistant',
      model: opts.model ?? 'claude-opus-5-5',
      stop_reason: opts.stop ?? null,
      usage: opts.usage ?? usage(1, 1),
      content: opts.content ?? [{ type: 'text', text: 'working' }],
    },
  }
}

const jsonl = (...records: unknown[]) => records.map((r) => JSON.stringify(r)).join('\n') + '\n'
const meta = (agentType: string, description = 'Build M1') => JSON.stringify({ agentType, description })

const PROMPT = [
  'Dispatched by /pod:autopilot (wave 1 of 3, sprint server-runs, plan board-read).',
  '',
  '- **sprint slug:** server-runs',
  '- **slice code:** M1',
  '- **branch name:** server-runs-M1 (cut from origin/board-read)',
  '- **merge-target branch:** board-read',
].join('\n')

const parse = (m: string, lines: string) => parseAgentTranscript({ id: 'a1', session: 's1', meta: m, jsonl: lines })

describe('parseAgentTranscript', () => {
  it('reads an engineer transcript', () => {
    const run = parse(
      meta('pod:engineer', 'Build M1: board types and transcript parser'),
      jsonl(
        user(0, PROMPT),
        assistant(1, 'm1', { model: 'claude-sonnet-5-5' }),
        user(2, [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }]),
        assistant(5, 'm2', { model: 'claude-opus-5-5' }),
      ),
    )
    expect(run).toMatchObject({
      id: 'a1',
      session: 's1',
      type: 'pod:engineer',
      sprint: 'server-runs',
      slice: 'M1',
      branch: 'server-runs-M1',
      model: 'claude-opus-5-5',
      startedAt: T0,
      lastAt: T0 + 5 * 60_000,
      ended: false,
    })
    expect(run).not.toHaveProperty('plan')
    expect(run).not.toHaveProperty('round')
  })

  it('reads the prompt from the first text block, and a reviewer plan and round', () => {
    const prompt = '- **plan slug:** board-read\n- **round:** 2\n'
    const run = parse(
      meta('pod:reviewer', 'Review board-read'),
      jsonl(user(0, [{ type: 'image', source: {} }, { type: 'text', text: prompt }]), assistant(1, 'm1')),
    )
    expect(run).toMatchObject({ type: 'pod:reviewer', plan: 'board-read', round: 2 })
    expect(run).not.toHaveProperty('sprint')
  })

  it('takes dispatch fields from the first user record only', () => {
    const run = parse(
      meta('pod:engineer'),
      jsonl(user(0, 'no fields here'), assistant(1, 'm1'), user(2, '- **slice code:** Z9')),
    )
    expect(run).not.toHaveProperty('slice')
  })

  it('never carries the meta file description', () => {
    const secret = `desc-${Math.random().toString(36).slice(2)}`
    const run = parse(meta('pod:engineer', secret), jsonl(user(0, PROMPT)))
    expect(run).toBeDefined()
    expect(run).not.toHaveProperty('description')
    expect(JSON.stringify(run)).not.toContain(secret)
  })

  it('tokens count each message once', () => {
    const run = parse(
      meta('pod:engineer'),
      jsonl(
        user(0, PROMPT),
        // One message streamed over three records: its usage counts once, from its last record.
        assistant(1, 'm1', { usage: usage(10, 1, 100, 5000) }),
        assistant(1, 'm1', { usage: usage(10, 1, 100, 5000) }),
        assistant(1, 'm1', { usage: usage(10, 20, 100, 5000), stop: 'tool_use' }),
        assistant(2, 'm2', { usage: usage(3, 4, 0, 9999) }),
      ),
    )
    // m1: 10 + 20 + 100; m2: 3 + 4. Cache reads are left out.
    expect(run?.tokens).toBe(130 + 7)
  })

  it('ended rules', () => {
    const handback = parse(
      meta('pod:engineer'),
      jsonl(
        user(0, PROMPT),
        assistant(1, 'm1', { content: [{ type: 'tool_use', id: 't1', name: 'SubagentHandback', input: { message: 'done' } }] }),
        // A streamed copy after the hand-back, still mid-turn: the hand-back alone ends it.
        assistant(1, 'm1', { stop: null }),
      ),
    )
    expect(handback?.ended).toBe(true)

    const endTurn = parse(meta('pod:engineer'), jsonl(user(0, PROMPT), assistant(1, 'm1', { stop: 'tool_use' }), assistant(2, 'm2', { stop: 'end_turn' })))
    expect(endTurn?.ended).toBe(true)

    // end_turn earlier, then more work: only the last assistant record counts.
    const midTurn = parse(
      meta('pod:engineer'),
      jsonl(user(0, PROMPT), assistant(1, 'm1', { stop: 'end_turn' }), user(2, 'go on'), assistant(3, 'm2', { stop: 'tool_use' })),
    )
    expect(midTurn?.ended).toBe(false)

    const otherTool = parse(
      meta('pod:engineer'),
      jsonl(user(0, PROMPT), assistant(1, 'm1', { stop: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] })),
    )
    expect(otherTool?.ended).toBe(false)
  })

  it('tolerates bad transcripts', () => {
    expect(parse(meta('general-purpose'), jsonl(user(0, PROMPT)))).toBeUndefined()
    expect(parse(meta('Explore'), jsonl(user(0, PROMPT)))).toBeUndefined()
    expect(parse('{not json', jsonl(user(0, PROMPT)))).toBeUndefined()
    expect(parse('', jsonl(user(0, PROMPT)))).toBeUndefined()
    expect(parse('null', jsonl(user(0, PROMPT)))).toBeUndefined()
    expect(parse('[]', jsonl(user(0, PROMPT)))).toBeUndefined()
    expect(parse(JSON.stringify({ agentType: 7 }), jsonl(user(0, PROMPT)))).toBeUndefined()

    // Empty text: a run with nothing known yet.
    const empty = parse(meta('pod:engineer'), '')
    expect(empty).toEqual({ id: 'a1', session: 's1', type: 'pod:engineer', tokens: 0, ended: false })

    // Bad lines, records missing fields, odd values, and a partial last line are skipped.
    const lines = [
      'not json at all',
      '42',
      'null',
      '"a string"',
      JSON.stringify({ type: 'user' }),
      JSON.stringify({ type: 'user', timestamp: 'yesterday', message: { content: 7 } }),
      JSON.stringify(user(0, PROMPT)),
      JSON.stringify({ type: 'assistant', timestamp: at(1) }),
      JSON.stringify({ type: 'assistant', timestamp: at(2), message: { id: 'm1', usage: { input_tokens: 'many' }, content: 'oops' } }),
      JSON.stringify({ type: 'assistant', timestamp: at(3), message: { usage: usage(1000, 1000) } }),
      JSON.stringify(assistant(4, 'm2', { usage: usage(5, 5) })),
      JSON.stringify(assistant(9, 'm3', { usage: usage(7, 7) })).slice(0, 40),
    ].join('\r\n')
    const run = parse(meta('pod:engineer'), lines)
    expect(run).toMatchObject({ slice: 'M1', startedAt: T0, lastAt: T0 + 4 * 60_000, tokens: 10, model: 'claude-opus-5-5', ended: false })
  })

  it('never keeps transcript text', () => {
    const SECRET = 'sk-FAKE-planted-secret-0000'
    const run = parse(
      meta('pod:engineer'),
      jsonl(
        user(0, PROMPT),
        assistant(1, 'm1', { content: [{ type: 'text', text: `here is ${SECRET}` }] }),
        assistant(2, 'm2', { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: `echo ${SECRET}` } }] }),
        user(3, [{ type: 'tool_result', tool_use_id: 't1', content: SECRET }]),
        user(4, [{ type: 'text', text: SECRET }]),
        assistant(5, 'm3', { stop: 'end_turn', content: [{ type: 'text', text: SECRET }] }),
      ),
    )
    expect(run).toBeDefined()
    expect(JSON.stringify(run)).not.toContain('planted')
  })
})

describe('agentState', () => {
  const run = (patch: Partial<AgentRun>): AgentRun => ({ id: 'a', session: 's', type: 'pod:engineer', description: '', tokens: 0, ended: false, ...patch })
  const now = T0 + 60 * 60_000

  it('agentState edges', () => {
    expect(STALE_MS).toBe(30 * 60_000)
    expect(agentState(run({ ended: true, lastAt: now }), now)).toBe('ended')
    expect(agentState(run({ ended: true }), now)).toBe('ended')
    expect(agentState(run({ lastAt: now - 29 * 60_000 }), now)).toBe('running')
    expect(agentState(run({ lastAt: now - STALE_MS + 1 }), now)).toBe('running')
    expect(agentState(run({ lastAt: now - 30 * 60_000 }), now)).toBe('stale')
    expect(agentState(run({}), now)).toBe('stale')
    // A clock running behind the transcript still reads as running.
    expect(agentState(run({ lastAt: now + 5000 }), now)).toBe('running')
  })
})

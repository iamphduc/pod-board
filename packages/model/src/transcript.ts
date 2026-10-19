// One pod agent's transcript read into an AgentRun: who it is, where it works,
// when it ran, what it cost, and whether it ended. Pure: the server reads the
// files and hands their text in. No transcript text, tool input, or tool output
// is ever kept. The rules and why are in pod-docs/feature-details/run-model.md.

import type { AgentRun, AgentState } from './board.ts'
import { parseDispatch, turnTokens } from './pod-flow/model.ts'
import type { Usage } from './pod-flow/types.ts'

/** An agent that wrote nothing for this long, and didn't end, reads as stale. */
export const STALE_MS = 30 * 60 * 1000

const DESCRIPTION_MAX = 80

/** One agent's files, as text: `agent-<id>.meta.json` and `agent-<id>.jsonl`. */
export type AgentFile = { id: string; session: string; meta: string; jsonl: string }

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** The agent's run, or undefined when it isn't a pod agent or its meta isn't JSON. Never throws. */
export function parseAgentTranscript({ id, session, meta, jsonl }: AgentFile): AgentRun | undefined {
  const info = parseJson(meta)
  if (!isObject(info) || typeof info.agentType !== 'string' || !info.agentType.startsWith('pod:')) return undefined
  const description = typeof info.description === 'string' ? [...info.description].slice(0, DESCRIPTION_MAX).join('') : ''

  let prompt: string | undefined
  let startedAt: number | undefined
  let lastAt: number | undefined
  let model: string | undefined
  let lastStop: unknown
  let handedBack = false
  // A message streams over several records with the same id; its last record has the final usage.
  const usageById = new Map<string, number>()

  for (const line of jsonl.split('\n')) {
    const record = parseJson(line)
    if (!isObject(record)) continue
    const time = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : Number.NaN
    if (Number.isFinite(time)) {
      startedAt ??= time
      lastAt = time
    }
    const message = record.message
    if (!isObject(message)) continue
    if (record.type === 'user') {
      prompt ??= promptText(message.content)
    } else if (record.type === 'assistant') {
      if (typeof message.model === 'string') model = message.model
      lastStop = message.stop_reason
      if (Array.isArray(message.content) && message.content.some(isHandback)) handedBack = true
      if (typeof message.id === 'string' && isObject(message.usage)) usageById.set(message.id, tokensOf(message.usage))
    }
  }

  const run: AgentRun = { id, session, type: info.agentType, description, tokens: 0, ended: handedBack || lastStop === 'end_turn' }
  for (const tokens of usageById.values()) run.tokens += tokens
  if (prompt !== undefined) {
    for (const [key, value] of Object.entries(parseDispatch(prompt))) {
      if (value !== undefined) Object.assign(run, { [key]: value })
    }
  }
  if (model !== undefined) run.model = model
  if (startedAt !== undefined) run.startedAt = startedAt
  if (lastAt !== undefined) run.lastAt = lastAt
  return run
}

/** `ended` → ended; written to within STALE_MS → running; else, or never written to, stale. */
export function agentState(a: AgentRun, now: number): AgentState {
  if (a.ended) return 'ended'
  return a.lastAt !== undefined && now - a.lastAt < STALE_MS ? 'running' : 'stale'
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** A user message's prompt: its string content, or its first text block. */
function promptText(content: unknown): string | undefined {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  const block = content.find((b) => isObject(b) && b.type === 'text' && typeof b.text === 'string')
  return block?.text as string | undefined
}

const isHandback = (block: unknown) => isObject(block) && block.type === 'tool_use' && block.name === 'SubagentHandback'

/** A usage field that's missing or not a number counts as 0. */
function tokensOf(u: Json): number {
  const usage: Usage = {
    input_tokens: num(u.input_tokens),
    output_tokens: num(u.output_tokens),
    cache_creation_input_tokens: num(u.cache_creation_input_tokens),
    cache_read_input_tokens: num(u.cache_read_input_tokens),
  }
  return turnTokens(usage)
}

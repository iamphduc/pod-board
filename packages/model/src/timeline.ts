// One agent's transcript read into a tool timeline: one event per tool call,
// each with a short summary, plus the agent's test progress. Pure: the server
// reads the file and hands its text in. No text leaves it: a summary is built
// only from the tool name, file paths, and fixed words, never from assistant
// text, prompts, tool output, command arguments, patterns, or URLs beyond the
// host. Transcripts can hold secrets. The rules and why are in
// pod-docs/feature-details/run-model.md.

export type ToolEvent = { at: number; tool: string; summary: string; result?: 'ok' | 'failed' }
export type TestProgress = { testFiles: number; runs: number; failedRuns: number; last?: 'pass' | 'fail'; testFirst?: boolean }
export type AgentTimeline = { agentId: string; events: ToolEvent[]; total: number; tests: TestProgress }

/** How many events a timeline keeps: the newest ones. */
export const TIMELINE_MAX = 300

const PATH_MAX = 60
const MAX_SEGMENTS = 3
const SUBCOMMAND_REACH = 4

const PROGRAMS = new Set([
  'pnpm', 'npm', 'npx', 'yarn', 'bun', 'deno', 'node', 'tsx', 'git', 'gh', 'vitest', 'jest', 'tsc', 'vite', 'agent-browser',
  'curl', 'ls', 'cd', 'cat', 'mkdir', 'rm', 'cp', 'mv', 'echo', 'grep', 'rg', 'find', 'head', 'tail', 'sed', 'wc', 'sort',
  'touch', 'pwd', 'sleep', 'kill', 'netstat', 'ps', 'corepack', 'bash', 'sh', 'pwsh', 'powershell', 'cmd',
])

const SUBCOMMANDS = new Set([
  'test', 'run', 'install', 'add', 'remove', 'build', 'dev', 'verify', 'typecheck', 'lint', 'exec', 'dlx', 'vitest', 'start',
  'commit', 'push', 'pull', 'fetch', 'status', 'diff', 'log', 'show', 'checkout', 'switch', 'merge', 'rebase', 'reset',
  'restore', 'stash', 'worktree', 'branch', 'tag', 'remote', 'clone', 'init', 'pr', 'issue', 'api', 'auth', 'view',
  'list', 'open', 'close', 'batch', 'snapshot', 'click', 'fill', 'screenshot',
])

const TEST_PROGRAMS = new Set(['vitest', 'jest'])
const TEST_SUBCOMMANDS = new Set(['test', 'verify', 'vitest'])

const NAME = /^[\w:.-]{1,64}$/
const AGENT_NAME = /^[\w:.-]{1,40}$/
const HOST = /^[a-z0-9.-]+$/
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i
const NOT_CODE = /\.(md|json|ya?ml|lock)$/i

type Json = Record<string, unknown>
type Shell = { summary: string; isTest: boolean }
type Draft = { at: number; tool: string; summary: string; order: number; id?: string; shell?: Shell; edited?: string }

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The agent's tool timeline. Never throws: bad lines, partial lines, and odd records are skipped. */
export function parseAgentTimeline(input: { agentId: string; jsonl: string; roots: string[] }): AgentTimeline {
  const agentId = String(input.agentId)
  try {
    return build(agentId, typeof input.jsonl === 'string' ? input.jsonl : '', Array.isArray(input.roots) ? input.roots : [])
  } catch {
    return { agentId, events: [], total: 0, tests: { testFiles: 0, runs: 0, failedRuns: 0 } }
  }
}

function build(agentId: string, jsonl: string, rawRoots: unknown[]): AgentTimeline {
  const roots = rawRoots.filter((r): r is string => typeof r === 'string').map(rootOf).filter((r) => r !== '')
  const drafts: Draft[] = []
  const byId = new Map<string, Draft>()
  const results = new Map<string, 'ok' | 'failed'>()

  for (const line of jsonl.split('\n')) {
    const record = parseJson(line)
    if (!isObject(record) || !isObject(record.message) || !Array.isArray(record.message.content)) continue
    const blocks = record.message.content.filter(isObject)
    if (record.type === 'assistant') {
      const at = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : Number.NaN
      if (!Number.isFinite(at)) continue
      for (const block of blocks) {
        if (block.type !== 'tool_use') continue
        const id = typeof block.id === 'string' ? block.id : undefined
        // A block repeated over a message's streamed records counts once.
        if (id !== undefined && byId.has(id)) continue
        const draft: Draft = { at, order: drafts.length, ...describe(block.name, isObject(block.input) ? block.input : {}, roots) }
        if (id !== undefined) {
          draft.id = id
          byId.set(id, draft)
        }
        drafts.push(draft)
      }
    } else if (record.type === 'user') {
      for (const block of blocks) {
        if (block.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue
        // Only a result that comes after its call, and the first one, counts.
        if (!byId.has(block.tool_use_id) || results.has(block.tool_use_id)) continue
        results.set(block.tool_use_id, block.is_error === true ? 'failed' : 'ok')
      }
    }
  }

  drafts.sort((a, b) => a.at - b.at || a.order - b.order)
  const resultOf = (d: Draft) => (d.id === undefined ? undefined : results.get(d.id))
  const events = drafts.slice(-TIMELINE_MAX).map((d): ToolEvent => {
    const event: ToolEvent = { at: d.at, tool: d.tool, summary: d.summary }
    const result = resultOf(d)
    if (result !== undefined) event.result = result
    return event
  })
  return { agentId, events, total: drafts.length, tests: testProgress(drafts, resultOf) }
}

function testProgress(drafts: Draft[], resultOf: (d: Draft) => 'ok' | 'failed' | undefined): TestProgress {
  const tests: TestProgress = { testFiles: 0, runs: 0, failedRuns: 0 }
  const testFiles = new Set<string>()
  let codeFirst = false
  for (const d of drafts) {
    if (d.shell?.isTest) {
      const result = resultOf(d)
      if (result !== undefined) {
        tests.runs++
        if (result === 'failed') tests.failedRuns++
        tests.last = result === 'failed' ? 'fail' : 'pass'
      }
    }
    if (d.edited !== undefined) {
      if (isTestFile(d.edited)) testFiles.add(d.edited)
      else if (testFiles.size === 0 && !NOT_CODE.test(d.edited)) codeFirst = true
    }
  }
  tests.testFiles = testFiles.size
  if (testFiles.size > 0) tests.testFirst = !codeFirst
  return tests
}

const isTestFile = (p: string) => TEST_FILE.test(p) || /(^|\/)__tests__\//.test(p)

/** The event's tool and summary, from the name, paths, and fixed words only. */
function describe(rawName: unknown, input: Json, roots: string[]): Pick<Draft, 'tool' | 'summary' | 'shell' | 'edited'> {
  const tool = typeof rawName === 'string' && NAME.test(rawName) ? rawName : 'tool'
  const path = relPath(input.file_path ?? input.notebook_path ?? input.path, roots)
  switch (tool) {
    case 'Read':
    case 'NotebookEdit':
      return { tool, summary: path === undefined ? tool : `${tool} ${shorten(path)}` }
    case 'Edit':
    case 'Write':
    case 'MultiEdit': {
      const summary = path === undefined ? tool : `${tool} ${shorten(path)}`
      return path === undefined ? { tool, summary } : { tool, summary, edited: path }
    }
    case 'Grep':
    case 'Glob': {
      const where = relPath(input.path, roots)
      return { tool, summary: where === undefined ? tool : `${tool} in ${shorten(where)}` }
    }
    case 'Bash':
    case 'PowerShell': {
      const shell = shellSummary(input.command)
      return { tool, summary: shell.summary === '' ? tool : `${tool}: ${shell.summary}`, shell }
    }
    case 'Task':
    case 'Agent':
      return { tool, summary: named(tool, input.subagent_type) }
    case 'Skill':
      return { tool, summary: named(tool, input.skill) }
    case 'WebFetch': {
      const host = hostOf(input.url)
      return { tool, summary: host === undefined ? tool : `${tool} ${host}` }
    }
    case 'SubagentHandback':
      return { tool, summary: 'Hand-back' }
    default:
      return { tool, summary: tool }
  }
}

const named = (tool: string, value: unknown) => (typeof value === 'string' && AGENT_NAME.test(value) ? `${tool}: ${value}` : tool)

function hostOf(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined
  try {
    const host = new URL(url).hostname
    return HOST.test(host) ? host : undefined
  } catch {
    return undefined
  }
}

/**
 * Programs and known subcommands of up to three command segments. Arguments,
 * env tokens, and unknown programs never show; an unknown program reads as
 * `command`.
 */
function shellSummary(command: unknown): Shell {
  if (typeof command !== 'string') return { summary: '', isTest: false }
  const parts: string[] = []
  let isTest = false
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const tokens = segment.split(/\s+/).filter((t) => t !== '' && !t.includes('='))
    const first = tokens[0]
    if (first === undefined) continue
    const base = (first.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '')
    const program = PROGRAMS.has(base) ? base : undefined
    const sub = tokens.slice(1, 1 + SUBCOMMAND_REACH).find((t) => SUBCOMMANDS.has(t))
    if ((program !== undefined && TEST_PROGRAMS.has(program)) || (sub !== undefined && TEST_SUBCOMMANDS.has(sub))) isTest = true
    parts.push(program === undefined ? 'command' : sub === undefined ? program : `${program} ${sub}`)
  }
  const shown = parts.slice(0, MAX_SEGMENTS).join(' · ')
  return { summary: parts.length > MAX_SEGMENTS ? `${shown} …` : shown, isTest }
}

/** A root with `/` slashes and no trailing slash. */
const rootOf = (root: string) => root.replaceAll('\\', '/').replace(/\/+$/, '')

/** The path inside a worktree, else inside a root (any case), else its base name. */
function relPath(raw: unknown, roots: string[]): string | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  const p = raw.replaceAll('\\', '/')
  const worktree = /\/\.claude\/worktrees\/[^/]+\/(.+)$/i.exec(p)?.[1]
  if (worktree !== undefined) return worktree
  const lower = p.toLowerCase()
  for (const root of roots) {
    const prefix = root.toLowerCase() + '/'
    if (lower.startsWith(prefix) && p.length > prefix.length) return p.slice(prefix.length)
  }
  return p.split('/').filter((s) => s !== '').pop()
}

/** Over 60 characters → `…` and the last 59. */
function shorten(p: string): string {
  const chars = [...p]
  return chars.length > PATH_MAX ? '…' + chars.slice(-(PATH_MAX - 1)).join('') : p
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

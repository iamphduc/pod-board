import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, mkdirSync, openSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { ReplyWord } from '@pod-board/model'
import { envKey, isFile, resolveBin } from './bin-path.ts'
import { envValue, type Env } from './config.ts'

export { resolveBin }

export type ResumeWord = Exclude<ReplyWord, 'try'>
export type StartResult = { outcome: 'started' | 'failed'; message?: string }
export type ClaudeRunner = {
  /** Starts `claude -p --resume <session> <word>` in `cwd` and reports how its first `windowMs` went. */
  start(r: { session: string; word: ResumeWord; cwd: string }): Promise<StartResult>
  /** A child this runner started for `session` is still alive. */
  isRunning(session: string): boolean
}

/** How long `start` watches the child before it calls the run started. */
export const RESUME_WINDOW_MS = 10_000
const TAIL_CHARS = 500

/**
 * A session id claude accepts and nothing reads as a flag or a command: the contract's
 * `^[A-Za-z0-9-]{1,64}$`, minus a leading `-` (`--bare` would match it).
 */
const SESSION = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/
const WORDS: readonly string[] = ['continue', 'go']
/** Env names never passed on, compared upper-cased: so the run uses the human's own login. */
const DROPPED_ENV = new Set(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'])
/** Characters cmd.exe would act on even inside quotes, or that end the quoting. */
const CMD_UNSAFE = /["%!^&|<>\r\n]/
// CSI sequences, OSC sequences, and other two-byte escapes.
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g

/** The claude binary: `POD_BOARD_CLAUDE_BIN`, else `claude` (found on PATH). */
export function claudeBin(env: Env): string {
  return envValue(env, 'POD_BOARD_CLAUDE_BIN') ?? 'claude'
}

/** The board's env minus the API key variables, matched in any case. */
export function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(env)) if (!DROPPED_ENV.has(k.toUpperCase())) out[k] = v
  return out
}

/**
 * What an npm `.cmd` shim runs, read from its text: the last quoted `%dp0%\…` path before `%*`.
 * A native `.exe` runs as is; a script runs with the shim's own `node.exe`, else `node` on
 * PATH, else the board's own node. Anything else → `undefined`.
 */
export function shimTarget(file: string, env: NodeJS.ProcessEnv): { file: string; pre: string[] } | undefined {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  const hits = [...text.matchAll(/"%dp0%\\([^"%\r\n]+)"\s+%\*/gi)]
  const rel = hits.at(-1)?.[1]
  if (rel === undefined) return undefined
  const dir = path.win32.dirname(file)
  const target = path.win32.resolve(dir, rel)
  if (!isFile(target)) return undefined
  if (/\.exe$/i.test(target)) return { file: target, pre: [] }
  if (!/\.[cm]?js$/i.test(target)) return undefined
  const own = path.win32.join(dir, 'node.exe')
  const node = isFile(own) ? own : (resolveBin('node', env, 'win32') ?? process.execPath)
  return { file: node, pre: [target] }
}

/** The tail of the child's stderr log: escape codes removed, at most 500 chars. */
export function stderrTail(text: string): string {
  return text.replace(ANSI, '').trim().slice(-TAIL_CHARS).trim()
}

const failed = (message: string): StartResult => ({ outcome: 'failed', message })

export function createClaudeRunner(o: {
  bin: string
  logDir: string
  env?: NodeJS.ProcessEnv
  windowMs?: number
}): ClaudeRunner {
  const windowMs = o.windowMs ?? RESUME_WINDOW_MS
  const live = new Map<string, number>()
  const track = (session: string, by: number) => {
    const n = (live.get(session) ?? 0) + by
    if (n > 0) live.set(session, n)
    else live.delete(session)
  }

  async function start(r: { session: string; word: ResumeWord; cwd: string }): Promise<StartResult> {
    if (!SESSION.test(r.session)) return failed('bad session id')
    if (!WORDS.includes(r.word)) return failed('bad reply word')
    const env = childEnv(o.env ?? process.env)
    const file = resolveBin(o.bin, env)
    if (!file) return failed('claude not found')
    let isDir = false
    try {
      isDir = statSync(r.cwd).isDirectory()
    } catch {}
    if (!isDir) return failed('repo folder not found')

    const args = ['-p', '--resume', r.session, r.word]
    const isShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(file)
    // npm's shim names what it runs, so that runs directly; only an unknown shim needs cmd.exe.
    const target = isShim ? shimTarget(file, env) : { file, pre: [] }
    const shim = target === undefined
    const logPath = path.join(o.logDir, `${r.session}-${Date.now()}.log`)
    if (shim && (CMD_UNSAFE.test(file) || CMD_UNSAFE.test(logPath))) return failed('unsafe claude path')

    let fd: number
    try {
      mkdirSync(o.logDir, { recursive: true })
      fd = openSync(logPath, 'a')
    } catch (err) {
      return failed(`couldn't open the resume log: ${(err as Error).message}`)
    }

    let child: ChildProcess
    try {
      const opts = { cwd: r.cwd, env, detached: true, windowsHide: true }
      if (shim) {
        // A .cmd shim pod can't read only runs through cmd.exe. Every value in the line is fixed or checked
        // above (session id pattern, the two words, paths with no cmd specials). A detached
        // cmd.exe doesn't hand its std handles on, so the line redirects them itself, and
        // the board must not hold the log open.
        closeSync(fd)
        const line = `""${file}" ${args.join(' ')} <NUL >NUL 2>>"${logPath}""`
        child = spawn(envKey(env, 'COMSPEC') ?? 'cmd.exe', ['/d', '/s', '/c', line], {
          ...opts,
          stdio: 'ignore',
          windowsVerbatimArguments: true,
        })
      } else {
        try {
          child = spawn(target.file, [...target.pre, ...args], { ...opts, stdio: ['ignore', 'ignore', fd] })
        } finally {
          closeSync(fd)
        }
      }
    } catch (err) {
      return failed((err as Error).message)
    }
    track(r.session, 1)
    child.unref()

    return new Promise<StartResult>((resolve) => {
      let settled = false
      let counted = true
      const settle = (res: StartResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(res)
      }
      const untrack = () => {
        if (counted) track(r.session, -1)
        counted = false
      }
      const timer = setTimeout(() => settle({ outcome: 'started' }), windowMs)
      child.once('error', (err) => {
        untrack()
        const code = (err as NodeJS.ErrnoException).code
        settle(failed(code === 'ENOENT' ? 'claude not found' : err.message))
      })
      child.once('exit', (code, signal) => {
        untrack()
        if (settled) return
        if (code === 0) return settle({ outcome: 'started' })
        let tail = ''
        try {
          tail = stderrTail(readFileSync(logPath, 'utf8'))
        } catch {}
        settle(failed(tail || `claude exited with code ${code ?? signal}`))
      })
    })
  }

  return { start, isRunning: (session) => live.has(session) }
}

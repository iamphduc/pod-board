import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { claudeBin, createClaudeRunner, RESUME_WINDOW_MS } from './claude-runner.ts'

const here = dirname(fileURLToPath(import.meta.url))
const FAKE = join(here, '..', 'test', 'fake-claude.mjs')
const WIN = process.platform === 'win32'
const SESSION = '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b'

type Record = { argv: string[]; env: { [k: string]: string }; cwd: string; pid: number }

let tmp: string
let binDir: string
let logDir: string
let repo: string
let recordFile: string
const pids = new Set<number>()

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** An npm-style `.cmd` shim, as `npm install -g` writes it for a JS bin. */
const npmShim = (rel: string) =>
  [
    '@ECHO off',
    'GOTO start',
    ':find_dp0',
    'SET dp0=%~dp0',
    'EXIT /b',
    ':start',
    'SETLOCAL',
    'CALL :find_dp0',
    '',
    'IF EXIST "%dp0%\\node.exe" (',
    '  SET "_prog=%dp0%\\node.exe"',
    ') ELSE (',
    '  SET "_prog=node"',
    '  SET PATHEXT=%PATHEXT:;.JS;=;%',
    ')',
    '',
    `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${rel}" %*`,
    '',
  ].join('\r\n')

/** A shim the runner can't read, so it goes through cmd.exe. */
const plainShim = () => `@ECHO off\r\n"${process.execPath}" "${FAKE}" %*\r\n`

/**
 * Installs the fake in `dir`: on Windows as `claude.cmd`, an npm-style shim (with the
 * extensionless sh twin npm also writes), on POSIX as an executable `claude`.
 */
function installFake(dir: string, shim: 'npm' | 'plain' = 'npm'): void {
  mkdirSync(dir, { recursive: true })
  if (WIN) {
    const pkg = join(dir, 'node_modules', 'fake-claude')
    mkdirSync(pkg, { recursive: true })
    copyFileSync(FAKE, join(pkg, 'cli.mjs'))
    writeFileSync(join(dir, 'claude.cmd'), shim === 'npm' ? npmShim('node_modules\\fake-claude\\cli.mjs') : plainShim())
    writeFileSync(join(dir, 'claude'), '#!/bin/sh\necho not this one\n')
  } else {
    const file = join(dir, 'claude')
    writeFileSync(file, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`)
    chmodSync(file, 0o755)
  }
}

/** The board's env with PATH set to only the fake's folder, plus the fake's settings. */
function envWith(extra: { [k: string]: string } = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) if (k.toUpperCase() !== 'PATH') env[k] = v
  return { ...env, PATH: binDir, FAKE_CLAUDE_RECORD: recordFile, ...extra }
}

const waitFor = async (check: () => boolean, ms = 5000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting')
    await new Promise((r) => setTimeout(r, 25))
  }
}

const readRecord = async (): Promise<Record> => {
  await waitFor(() => existsSync(recordFile))
  const r = JSON.parse(readFileSync(recordFile, 'utf8')) as Record
  pids.add(r.pid)
  return r
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'claude-runner-'))
  binDir = join(tmp, 'bin')
  logDir = join(tmp, 'logs')
  repo = join(tmp, 'repo')
  recordFile = join(tmp, 'record.json')
  mkdirSync(repo)
  installFake(binDir)
})

afterEach(async () => {
  if (existsSync(recordFile)) await readRecord()
  for (const pid of pids) if (alive(pid)) process.kill(pid)
  await waitFor(() => [...pids].every((p) => !alive(p)))
  pids.clear()
  rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

describe('createClaudeRunner', () => {
  test('passes only the resume arguments', async () => {
    const runner = createClaudeRunner({ bin: 'claude', logDir, env: envWith(), windowMs: 3000 })
    const res = await runner.start({ session: SESSION, word: 'continue', cwd: repo })
    expect(res).toEqual({ outcome: 'started' })
    expect((await readRecord()).argv).toEqual(['-p', '--resume', SESSION, 'continue'])

    rmSync(recordFile)
    await runner.start({ session: SESSION, word: 'go', cwd: repo })
    const argv = (await readRecord()).argv
    expect(argv).toEqual(['-p', '--resume', SESSION, 'go'])
    expect(argv).not.toContain('--bare')
  })

  test('strips api keys from the env', async () => {
    const env = envWith({
      ANTHROPIC_API_KEY: 'sk-1',
      anthropic_auth_token: 'tok-2',
      Anthropic_Api_Key: 'sk-3',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:1',
      POD_BOARD_SMOKE: 'kept',
    })
    const runner = createClaudeRunner({ bin: 'claude', logDir, env, windowMs: 3000 })
    expect(await runner.start({ session: SESSION, word: 'continue', cwd: repo })).toEqual({ outcome: 'started' })
    const names = Object.keys((await readRecord()).env).map((k) => k.toUpperCase())
    expect(names).not.toContain('ANTHROPIC_API_KEY')
    expect(names).not.toContain('ANTHROPIC_AUTH_TOKEN')
    const seen = (await readRecord()).env
    expect(seen.POD_BOARD_SMOKE).toBe('kept')
    expect(seen.ANTHROPIC_BASE_URL).toBe('http://127.0.0.1:1')
    expect(env.ANTHROPIC_API_KEY).toBe('sk-1') // the board's own env is left alone
  })

  test('refuses an unsafe session id', async () => {
    const runner = createClaudeRunner({ bin: 'claude', logDir, env: envWith(), windowMs: 3000 })
    const bad = ['', 'a'.repeat(65), 'abc def', 'abc;calc', '../x', 'abc"&calc', '--bare', '-p', 'é']
    for (const session of bad) {
      expect(await runner.start({ session, word: 'continue', cwd: repo })).toEqual({
        outcome: 'failed',
        message: 'bad session id',
      })
      expect(runner.isRunning(session)).toBe(false)
    }
    // a word outside continue/go never reaches claude either
    const word = 'try' as 'continue'
    expect((await runner.start({ session: SESSION, word, cwd: repo })).outcome).toBe('failed')
    expect(existsSync(recordFile)).toBe(false)
    expect(existsSync(logDir) && readdirSync(logDir).length > 0).toBe(false)
  })

  test('reports claude not found', async () => {
    const empty = join(tmp, 'empty')
    mkdirSync(empty)
    const env = { ...envWith(), PATH: empty }
    const byName = createClaudeRunner({ bin: 'claude', logDir, env, windowMs: 3000 })
    expect(await byName.start({ session: SESSION, word: 'continue', cwd: repo })).toEqual({
      outcome: 'failed',
      message: 'claude not found',
    })
    const byPath = createClaudeRunner({ bin: join(empty, 'nope', 'claude'), logDir, env, windowMs: 3000 })
    expect(await byPath.start({ session: SESSION, word: 'continue', cwd: repo })).toEqual({
      outcome: 'failed',
      message: 'claude not found',
    })
    expect(byName.isRunning(SESSION)).toBe(false)
  })

  test('started when still running', async () => {
    const done = join(tmp, 'done')
    const env = envWith({ FAKE_CLAUDE_MODE: 'wait:2500', FAKE_CLAUDE_DONE: done })
    const runner = createClaudeRunner({ bin: 'claude', logDir, env, windowMs: 600 })
    const t0 = Date.now()
    const res = await runner.start({ session: SESSION, word: 'continue', cwd: repo })
    expect(res).toEqual({ outcome: 'started' })
    expect(Date.now() - t0).toBeGreaterThanOrEqual(550)
    await readRecord()
    expect(runner.isRunning(SESSION)).toBe(true)
    expect(runner.isRunning('another-session')).toBe(false)
    await waitFor(() => existsSync(done))
    await waitFor(() => !runner.isRunning(SESSION))
  })

  test('isRunning stays true while any child for the session lives', async () => {
    const runner = createClaudeRunner({ bin: 'claude', logDir, windowMs: 300, env: envWith({ FAKE_CLAUDE_MODE: 'wait:2500' }) })
    expect(await runner.start({ session: SESSION, word: 'continue', cwd: repo })).toEqual({ outcome: 'started' })
    await readRecord()
    const quick = createClaudeRunner({ bin: 'claude', logDir, windowMs: 3000, env: envWith() })
    await quick.start({ session: SESSION, word: 'continue', cwd: repo })
    expect(quick.isRunning(SESSION)).toBe(false)
    expect(runner.isRunning(SESSION)).toBe(true)
  })

  test('started on a quick clean exit', async () => {
    const runner = createClaudeRunner({ bin: 'claude', logDir, env: envWith(), windowMs: 5000 })
    const t0 = Date.now()
    expect(await runner.start({ session: SESSION, word: 'continue', cwd: repo })).toEqual({ outcome: 'started' })
    expect(Date.now() - t0).toBeLessThan(4500) // decided at exit, not at the window's end
    expect(runner.isRunning(SESSION)).toBe(false)
  })

  test('failed with the stderr tail', async () => {
    const long = 'x'.repeat(600) + 'END'
    const cases: [string, string, string][] = [
      ['exit:2', '\u001b[31mError:\u001b[0m session not found\n', 'Error: session not found'],
      ['exit:1', long, long.slice(-500)],
      ['exit:3', '', 'claude exited with code 3'],
      ['exit:4', ' \n\u001b[0m\n', 'claude exited with code 4'],
    ]
    for (const [mode, stderr, message] of cases) {
      const env = envWith({ FAKE_CLAUDE_MODE: mode, FAKE_CLAUDE_STDERR: stderr })
      const runner = createClaudeRunner({ bin: 'claude', logDir, env, windowMs: 5000 })
      expect(await runner.start({ session: SESSION, word: 'continue', cwd: repo })).toEqual({ outcome: 'failed', message })
      expect(runner.isRunning(SESSION)).toBe(false)
    }
    // stderr went to files under logDir
    expect(readdirSync(logDir).length).toBeGreaterThan(0)
  })

  test('runs detached in the repo folder', async () => {
    // A separate board process starts the run and then exits; the run lives on.
    const done = join(tmp, 'done')
    const host = join(tmp, 'host.mts')
    const runnerUrl = pathToFileURL(join(here, 'claude-runner.ts')).href
    writeFileSync(
      host,
      [
        `import { createClaudeRunner } from ${JSON.stringify(runnerUrl)}`,
        `const env = JSON.parse(process.env.HOST_ENV ?? '{}')`,
        `const runner = createClaudeRunner({ bin: 'claude', logDir: ${JSON.stringify(logDir)}, env, windowMs: 400 })`,
        `const res = await runner.start({ session: ${JSON.stringify(SESSION)}, word: 'continue', cwd: ${JSON.stringify(repo)} })`,
        `console.log(JSON.stringify(res))`,
        `process.exit(0)`,
      ].join('\n'),
    )
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href
    const env = envWith({ FAKE_CLAUDE_MODE: 'wait:2000', FAKE_CLAUDE_DONE: done })
    const out = spawnSync(process.execPath, ['--import', tsx, host], {
      env: { ...process.env, HOST_ENV: JSON.stringify(env) },
      encoding: 'utf8',
      timeout: 20_000,
    })
    expect(out.stderr).toBe('')
    expect(JSON.parse(out.stdout.trim())).toEqual({ outcome: 'started' })
    const record = await readRecord()
    expect(record.cwd.toLowerCase()).toBe(repo.toLowerCase())
    expect(alive(record.pid)).toBe(true) // the host is gone, the run isn't
    await waitFor(() => existsSync(done))
  })

  test.skipIf(!WIN)('runs a cmd shim on windows', async () => {
    // npm installs claude as a .cmd shim next to an extensionless sh script Windows can't run.
    const runner = createClaudeRunner({ bin: 'claude', logDir, env: envWith(), windowMs: 3000 })
    expect(await runner.start({ session: SESSION, word: 'continue', cwd: repo })).toEqual({ outcome: 'started' })
    expect((await readRecord()).argv).toEqual(['-p', '--resume', SESSION, 'continue'])

    // a shim the runner can't read goes through cmd.exe, with the same arguments
    const plain = join(tmp, 'plain')
    installFake(plain, 'plain')
    rmSync(recordFile)
    const byPath = createClaudeRunner({ bin: join(plain, 'claude.cmd'), logDir, env: envWith(), windowMs: 3000 })
    expect(await byPath.start({ session: SESSION, word: 'go', cwd: repo })).toEqual({ outcome: 'started' })
    expect((await readRecord()).argv).toEqual(['-p', '--resume', SESSION, 'go'])

    // and one whose path cmd.exe would read as commands is refused, not run
    const odd = join(tmp, 'a&calc')
    installFake(odd, 'plain')
    rmSync(recordFile)
    const unsafe = createClaudeRunner({ bin: join(odd, 'claude.cmd'), logDir, env: envWith(), windowMs: 3000 })
    expect(await unsafe.start({ session: SESSION, word: 'go', cwd: repo })).toEqual({ outcome: 'failed', message: 'unsafe claude path' })
    expect(existsSync(recordFile)).toBe(false)
  })
})

describe('claudeBin', () => {
  test('picks the claude binary', () => {
    expect(claudeBin({})).toBe('claude')
    expect(claudeBin({ POD_BOARD_CLAUDE_BIN: '' })).toBe('claude')
    expect(claudeBin({ POD_BOARD_CLAUDE_BIN: 'C:\\tools\\claude.exe' })).toBe('C:\\tools\\claude.exe')
    expect(RESUME_WINDOW_MS).toBe(10_000)
  })
})

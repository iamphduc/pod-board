import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const MAIN = join(here, 'main.ts')
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href
const WIN = process.platform === 'win32'
/** Cold tsx start-up on Windows takes a few seconds; leave plenty of room. */
const BOOT_MS = 30_000

/**
 * Removes `path`, trying again on EPERM, EBUSY, and ENOTEMPTY. On Windows a killed child's
 * handles (its working folder, its log) close a moment after `kill(pid, 0)` already says it's
 * gone, and Node's own `maxRetries` doesn't retry that EPERM.
 */
const removeWithRetry = async (path: string, opts: { recursive?: boolean } = {}) => {
  for (let tries = 1; ; tries++) {
    try {
      rmSync(path, { ...opts, force: true })
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      if (tries >= 40 || !['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(code)) throw err
      await new Promise((r) => setTimeout(r, 50))
    }
  }
}

/** Asks the OS for a free port on 127.0.0.1. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

/** Resolves with the child's exit code, at once if it already exited. */
const exitOf = (c: ChildProcess): Promise<number | null> =>
  c.exitCode !== null || c.signalCode !== null
    ? Promise.resolve(c.exitCode)
    : new Promise((resolve) => c.once('exit', (code) => resolve(code)))

let tmp: string
let child: ChildProcess | undefined

/** Starts main.ts on temp folders and resolves once it logs its listening line. */
const boot = async (): Promise<{ child: ChildProcess; api: number; out: () => string }> => {
  const api = await freePort()
  const web = await freePort()
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith('POD_BOARD_')) delete env[k]
  Object.assign(env, {
    POD_BOARD_API_PORT: String(api),
    POD_BOARD_WEB_PORT: String(web),
    POD_BOARD_CONFIG_DIR: join(tmp, 'cfg'),
    POD_BOARD_PORTS_DIR: join(tmp, 'ports'),
    POD_BOARD_CLAUDE_DIR: join(tmp, 'claude'),
    POD_BOARD_CLAUDE_BIN: join(tmp, 'missing', 'claude'),
  })
  const c = spawn(process.execPath, ['--import', TSX, MAIN], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child = c // so teardown kills it even if boot fails
  let text = ''
  const out = () => text
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no listening line in ${BOOT_MS} ms:\n${text}`)),
      BOOT_MS,
    )
    const onData = (d: unknown) => {
      text += String(d)
      if (text.includes(`pod-board API listening on http://127.0.0.1:${api}`)) {
        clearTimeout(timer)
        resolve()
      }
    }
    c.stdout!.on('data', onData)
    c.stderr!.on('data', onData)
    c.once('exit', () => {
      clearTimeout(timer)
      reject(new Error(`exited before listening:\n${text}`))
    })
  })
  return { child: c, api, out }
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'pod-board-main-'))
})

afterEach(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill()
    await exitOf(child)
  }
  child = undefined
  await removeWithRetry(tmp, { recursive: true })
})

describe('main.ts', () => {
  test('boots with temp folders, writes the token, and serves the board', async () => {
    const b = await boot()
    child = b.child
    const base = `http://127.0.0.1:${b.api}`

    const health = await fetch(`${base}/api/health`)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ ok: true })

    const board = await fetch(`${base}/api/board`)
    expect(board.status).toBe(200)
    const json = (await board.json()) as { repos: unknown[]; generatedAt: unknown }
    expect(json.repos).toEqual([])
    expect(typeof json.generatedAt).toBe('number')

    const file = join(tmp, 'cfg', 'session-token')
    expect(existsSync(file)).toBe(true)
    expect(readFileSync(file).toString().trim()).toHaveLength(43)
  }, 60_000)

  test('guards the action routes', async () => {
    const b = await boot()
    child = b.child
    const url = `http://127.0.0.1:${b.api}/api/actions/merge-preview`
    const headers = { Origin: `http://127.0.0.1:${b.api}`, 'Content-Type': 'application/json' }
    const body = JSON.stringify({ repoId: 'x', number: 1 })

    const noToken = await fetch(url, { method: 'POST', headers, body })
    expect(noToken.status).toBe(403)
    expect(await noToken.json()).toEqual({ error: 'bad token' })

    const token = readFileSync(join(tmp, 'cfg', 'session-token')).toString().trim()
    const ok = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'X-Pod-Board-Token': token },
      body,
    })
    expect(ok.status).toBe(404)
    expect(await ok.json()).toEqual({ error: 'not waiting on you' })
  }, 60_000)

  test.skipIf(WIN)('exits 0 on SIGTERM', async () => {
    const b = await boot()
    child = b.child
    b.child.kill('SIGTERM')
    expect(await exitOf(b.child)).toBe(0)
  }, 60_000)
})

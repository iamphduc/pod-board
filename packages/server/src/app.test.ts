import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentTimeline, Board } from '@pod-board/model'
import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createApp, type AppDeps, type BoardSource } from './app.ts'
import { createBoardService } from './board-service.ts'
import type { GhReader } from './gh.ts'
import { normalizeRepoPath } from './guard.ts'
import { addRepo } from './repos-config.ts'
import { createBoardWatcher, type BoardWatcher } from './watcher.ts'

const API = 3060
const WEB = 3061
const HOST = { host: `127.0.0.1:${API}` }
const POST_HEADERS = { ...HOST, origin: `http://127.0.0.1:${WEB}`, 'content-type': 'application/json' }
const platform = process.platform

const BOARD: Board = { generatedAt: 1, gh: 'unknown', repos: [] }

/** A board source that holds one board and lets the test push new ones. */
function fakeSource(board: Board = BOARD) {
  const subs = new Set<(b: Board) => void>()
  let current = board
  const source: BoardSource = {
    board: () => current,
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    rebuild: async () => {},
  }
  const push = (b: Board) => {
    current = b
    for (const fn of subs) fn(b)
  }
  return { source, push, subs }
}

const TIMELINE: AgentTimeline = {
  agentId: 'a1',
  events: [{ at: 5, tool: 'Read', summary: 'Read src/a.ts', result: 'ok' }],
  total: 1,
  tests: { testFiles: 0, runs: 0, failedRuns: 0 },
}

type TimelineFn = AppDeps['timeline']
const noTimeline: TimelineFn = async () => undefined

function fakeApp(opts: { pingMs?: number; source?: BoardSource; timeline?: TimelineFn } = {}): Hono {
  return createApp({
    ports: [API, WEB],
    source: opts.source ?? fakeSource().source,
    addRepo: async () => ({ error: 'not a directory' }),
    timeline: opts.timeline ?? noTimeline,
    ...(opts.pingMs === undefined ? {} : { pingMs: opts.pingMs }),
  })
}

/** Reads SSE text from a response until `until` matches the text so far. */
async function readUntil(res: Response, until: (text: string) => boolean, ms = 5000): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const deadline = Date.now() + ms
  try {
    while (!until(text)) {
      const left = deadline - Date.now()
      if (left <= 0) throw new Error(`stream did not match within ${ms} ms; got: ${text}`)
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`stream did not match within ${ms} ms; got: ${text}`)), left)),
      ])
      if (chunk.done) break
      text += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    await reader.cancel()
  }
  return text
}

/** The Boards in the `board` events of an SSE text. */
function boardEvents(text: string): Board[] {
  return text
    .split('\n\n')
    .filter((block) => /^event: board$/m.test(block))
    .map((block) => JSON.parse(block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n')) as Board)
}

describe('board and events routes', () => {
  test('GET /api/board returns the board', async () => {
    const board: Board = { generatedAt: 5, gh: 'ok', ghCheckedAt: 4, repos: [] }
    const res = await fakeApp({ source: fakeSource(board).source }).request('/api/board', { headers: HOST })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(await res.json()).toEqual(board)
  })

  test('GET /api/events sends the board first, then each new board', async () => {
    const { source, push, subs } = fakeSource({ generatedAt: 5, gh: 'ok', repos: [] })
    const res = await fakeApp({ source }).request('/api/events', { headers: HOST })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/)
    setTimeout(() => push({ generatedAt: 6, gh: 'missing', repos: [] }), 50)
    const text = await readUntil(res, (t) => boardEvents(t).length >= 2)
    expect(text.startsWith('event: board\n')).toBe(true)
    expect(boardEvents(text)).toEqual([
      { generatedAt: 5, gh: 'ok', repos: [] },
      { generatedAt: 6, gh: 'missing', repos: [] },
    ])
    // A client that leaves stops getting boards.
    await expect.poll(() => subs.size).toBe(0)
  })

  test('a ping comment is sent', async () => {
    const res = await fakeApp({ pingMs: 30 }).request('/api/events', { headers: HOST })
    const text = await readUntil(res, (t) => t.includes(': ping\n'))
    expect(text).toMatch(/^: ping$/m)
  })
})

describe('add repo route', () => {
  let root: string
  let configFile: string
  let watcher: BoardWatcher
  let app: Hono

  const gh: GhReader = { status: () => 'unknown', checkedAt: () => undefined, get: () => undefined, refresh: async () => false }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pod-board-a1-app-'))
    configFile = join(root, 'config', 'config.json')
    const portsDir = join(root, 'ports')
    const claudeDir = join(root, 'claude')
    const service = createBoardService({ configFile, portsDir, claudeDir, transcriptDays: 30, platform, gh })
    watcher = createBoardWatcher({ service, configFile, portsDir, claudeDir })
    await watcher.start()
    app = createApp({ ports: [API, WEB], source: watcher, addRepo: (p) => addRepo(configFile, p, platform), timeline: noTimeline })
  })

  afterEach(async () => {
    await watcher.close()
    await rm(root, { recursive: true, force: true })
  })

  const post = (body: string, headers: Record<string, string> = POST_HEADERS) =>
    app.request('/api/repos', { method: 'POST', headers, body })

  test('201 with the normalized path, and a board event follows', async () => {
    const repo = join(root, 'repo-one')
    await mkdir(repo)
    const events = await app.request('/api/events', { headers: HOST })
    const res = await post(JSON.stringify({ path: repo + '/' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ path: normalizeRepoPath(repo, platform) })
    const text = await readUntil(events, (t) => boardEvents(t).some((b) => b.repos.length === 1))
    expect(boardEvents(text).at(-1)!.repos[0]!.path).toBe(normalizeRepoPath(repo, platform))
    // The board route has it at once too.
    const board = (await (await app.request('/api/board', { headers: HOST })).json()) as Board
    expect(board.repos.map((r) => r.source)).toEqual(['registered'])
  })

  test('a charset on the JSON content type is fine', async () => {
    const repo = join(root, 'repo-two')
    await mkdir(repo)
    const res = await post(JSON.stringify({ path: repo }), { ...POST_HEADERS, 'content-type': 'application/json; charset=utf-8' })
    expect(res.status).toBe(201)
  })

  test('415 for another content type, or none', async () => {
    const body = JSON.stringify({ path: root })
    const res = await post(body, { ...POST_HEADERS, 'content-type': 'text/plain' })
    expect(res.status).toBe(415)
    const { 'content-type': _, ...noType } = POST_HEADERS
    expect((await app.request('/api/repos', { method: 'POST', headers: noType, body })).status).toBe(415)
  })

  test('400 for bad JSON, no string path, relative, and missing', async () => {
    for (const body of ['{ nope', '[]', 'null', '{}', '{"path": 5}']) {
      const res = await post(body)
      expect(res.status, body).toBe(400)
      expect(await res.json(), body).toEqual({ error: 'bad request' })
    }
    const relative = await post(JSON.stringify({ path: 'some/repo' }))
    expect(relative.status).toBe(400)
    expect(await relative.json()).toEqual({ error: 'not absolute' })
    const missing = await post(JSON.stringify({ path: join(root, 'nope') }))
    expect(missing.status).toBe(400)
    expect(await missing.json()).toEqual({ error: 'not a directory' })
  })

  test('409 for a repo already registered', async () => {
    const repo = join(root, 'repo-three')
    await mkdir(repo)
    expect((await post(JSON.stringify({ path: repo }))).status).toBe(201)
    const again = await post(JSON.stringify({ path: repo }))
    expect(again.status).toBe(409)
    expect(await again.json()).toEqual({ error: 'already registered' })
  })

  test('500 when the config file is unreadable', async () => {
    const repo = join(root, 'repo-four')
    await mkdir(repo)
    await mkdir(join(root, 'config'), { recursive: true })
    await writeFile(configFile, '{ corrupt')
    const res = await post(JSON.stringify({ path: repo }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'config unreadable' })
  })

  test('500 when the config file cannot be written', async () => {
    const res = await createApp({
      ports: [API, WEB],
      source: watcher,
      addRepo: () => Promise.reject(new Error('EACCES')),
      timeline: noTimeline,
    }).request('/api/repos', { method: 'POST', headers: POST_HEADERS, body: JSON.stringify({ path: root }) })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'config unwritable' })
  })
})

describe('timeline route', () => {
  const asked: [string, string][] = []
  const timeline: TimelineFn = async (repoId, agentId) => {
    asked.push([repoId, agentId])
    return repoId === 'r1' && agentId === 'a1' ? TIMELINE : undefined
  }
  const get = (path: string, headers: Record<string, string> = HOST) => fakeApp({ timeline }).request(path, { headers })

  test('200 with the timeline of a board agent', async () => {
    const res = await get('/api/agents/r1/a1/timeline')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(await res.json()).toEqual(TIMELINE)
  })

  test('404 for an unknown repo or agent, a bad id, or a gone transcript', async () => {
    asked.length = 0
    for (const path of ['/api/agents/nope/a1/timeline', '/api/agents/r1/nope/timeline', '/api/agents/r1/..%2Fx/timeline', `/api/agents/r1/${'x'.repeat(65)}/timeline`]) {
      const res = await get(path)
      expect(res.status, path).toBe(404)
      expect(await res.json(), path).toEqual({ error: 'not found' })
    }
    // A bad id never reaches the source.
    expect(asked).toEqual([
      ['nope', 'a1'],
      ['r1', 'nope'],
    ])
  })

  test('refuses a foreign Host', async () => {
    const res = await get('/api/agents/r1/a1/timeline', { host: `evil.example:${API}` })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden host' })
  })
})

describe('guard on every route', () => {
  const routes: [string, string][] = [
    ['GET', '/api/health'],
    ['GET', '/api/board'],
    ['GET', '/api/events'],
    ['POST', '/api/repos'],
    ['GET', '/api/agents/r1/a1/timeline'],
    ['GET', '/api/nope'],
  ]

  test('every route refuses a foreign Host', async () => {
    const app = fakeApp()
    for (const [method, path] of routes) {
      const res = await app.request(path, {
        method,
        headers: { ...POST_HEADERS, host: `evil.example:${API}` },
        ...(method === 'POST' ? { body: '{}' } : {}),
      })
      expect(res.status, `${method} ${path}`).toBe(403)
      expect(await res.json()).toEqual({ error: 'forbidden host' })
      expect([...res.headers.keys()].filter((k) => k.startsWith('access-control-'))).toEqual([])
    }
  })

  test('POST refuses a foreign or missing Origin', async () => {
    const app = fakeApp()
    for (const origin of ['http://evil.example', undefined]) {
      const { origin: _, ...headers } = POST_HEADERS
      const res = await app.request('/api/repos', {
        method: 'POST',
        headers: origin === undefined ? headers : { ...headers, origin },
        body: JSON.stringify({ path: '/x' }),
      })
      expect(res.status, String(origin)).toBe(403)
      expect(await res.json()).toEqual({ error: 'forbidden origin' })
    }
  })

  test('GET /api/health returns ok', async () => {
    const res = await fakeApp().request('/api/health', { headers: HOST })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(await res.json()).toEqual({ ok: true })
  })

  test('unknown route returns 404', async () => {
    const app = fakeApp()
    expect((await app.request('/api/nope', { headers: HOST })).status).toBe(404)
    expect((await app.request('/', { headers: HOST })).status).toBe(404)
    // Only GET answers on the health route.
    expect((await app.request('/api/health', { method: 'POST', headers: POST_HEADERS })).status).toBe(404)
  })
})

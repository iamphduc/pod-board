import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'
import { actionGuard, ignoresCase, normalizeRepoPath, repoId, requestGuard, sameRepoPath } from './guard.ts'

function guarded(): Hono {
  const app = new Hono()
  app.use('*', requestGuard({ ports: [3040, 3041] }))
  app.get('/api/x', (c) => c.json({ ok: true }))
  app.post('/api/x', (c) => c.json({ ok: true }, 201))
  return app
}

const send = (app: Hono, headers: Record<string, string>, method = 'GET') =>
  app.request('http://127.0.0.1:3040/api/x', { method, headers })

function noCors(res: Response): void {
  const cors = [...res.headers.keys()].filter((k) => k.toLowerCase().startsWith('access-control-'))
  expect(cors).toEqual([])
}

describe('request guard', () => {
  test('allows 127.0.0.1 and localhost on the API and web ports', async () => {
    const app = guarded()
    for (const host of ['127.0.0.1:3040', '127.0.0.1:3041', 'localhost:3040', 'localhost:3041']) {
      const res = await send(app, { host })
      expect(res.status, host).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      noCors(res)
    }
    expect((await send(app, { host: 'localhost:3040' }, 'HEAD')).status).toBe(200)
  })

  test('refuses a foreign name, an unlisted port, no port, and a missing Host', async () => {
    const app = guarded()
    const bad = [
      'evil.example:3040',
      '127.0.0.1.evil.example:3040',
      'localhost.evil:3040',
      '127.0.0.1:3000',
      'localhost:30400',
      '127.0.0.1',
      'localhost',
      '0.0.0.0:3040',
      '[::1]:3040',
      '',
    ]
    for (const host of bad) {
      const res = await send(app, { host })
      expect(res.status, JSON.stringify(host)).toBe(403)
      expect(await res.json()).toEqual({ error: 'forbidden host' })
      noCors(res)
    }
    // No Host header at all.
    const req = new Request('http://127.0.0.1:3040/api/x')
    req.headers.delete('host')
    const res = await app.fetch(req)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden host' })
  })

  test('POST needs an Origin on the same loopback ports', async () => {
    const app = guarded()
    for (const origin of ['http://127.0.0.1:3041', 'http://localhost:3040']) {
      const res = await send(app, { host: '127.0.0.1:3040', origin }, 'POST')
      expect(res.status, origin).toBe(201)
      noCors(res)
    }
    const bad = [
      'http://evil.example',
      'http://127.0.0.1:3000',
      'https://127.0.0.1:3040',
      'http://127.0.0.1:3040/',
      'http://localhost',
      'null',
      '',
    ]
    for (const origin of bad) {
      const res = await send(app, { host: '127.0.0.1:3040', origin }, 'POST')
      expect(res.status, JSON.stringify(origin)).toBe(403)
      expect(await res.json()).toEqual({ error: 'forbidden origin' })
      noCors(res)
    }
    const missing = await send(app, { host: '127.0.0.1:3040' }, 'POST')
    expect(missing.status).toBe(403)
    expect(await missing.json()).toEqual({ error: 'forbidden origin' })
  })

  test('every method but GET and HEAD needs the Origin, a CORS preflight included', async () => {
    const app = guarded()
    for (const method of ['PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const res = await send(
        app,
        { host: '127.0.0.1:3040', origin: 'http://evil.example', 'access-control-request-method': 'POST' },
        method,
      )
      expect(res.status, method).toBe(403)
      noCors(res)
    }
  })

  test('the Host check comes first, even with a good Origin', async () => {
    const res = await send(guarded(), { host: 'evil.example:3040', origin: 'http://127.0.0.1:3040' }, 'POST')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden host' })
  })
})

const TOKEN = 'k'.repeat(43)
const GOOD = { host: '127.0.0.1:3040', origin: 'http://127.0.0.1:3041', 'content-type': 'application/json', 'x-pod-board-token': TOKEN }

/** The action guard alone, in front of a handler that counts its calls. */
function actionGuarded() {
  let reached = 0
  const app = new Hono()
  app.use('*', actionGuard({ ports: [3040, 3041], token: TOKEN }))
  app.all('/api/actions/x', (c) => {
    reached++
    return c.json({ ok: true })
  })
  return { app, reached: () => reached }
}

const act = (app: Hono, headers: Record<string, string>, method = 'POST', body: string | undefined = '{}') =>
  app.request('http://127.0.0.1:3040/api/actions/x', { method, headers, ...(method === 'GET' || method === 'HEAD' ? {} : { body }) })

describe('action guard', () => {
  test('lets a good request through, with no CORS headers', async () => {
    const { app, reached } = actionGuarded()
    const res = await act(app, GOOD)
    expect(res.status).toBe(200)
    expect(reached()).toBe(1)
    noCors(res)
  })

  test('checks Host, Origin, method, content type, token, then body, in that order', async () => {
    const { app, reached } = actionGuarded()
    const { 'x-pod-board-token': _, ...noToken } = GOOD
    const cases: [string, Record<string, string>, string, string | undefined, number, string][] = [
      ['foreign host, everything else bad', { host: 'evil.example:3040', origin: 'http://evil.example', 'content-type': 'text/plain' }, 'GET', undefined, 403, 'forbidden host'],
      ['bad origin, bad type, no token, bad body', { ...noToken, origin: 'http://evil.example', 'content-type': 'text/plain' }, 'POST', '[]', 403, 'forbidden origin'],
      ['GET, no token', { host: GOOD.host }, 'GET', undefined, 405, 'method not allowed'],
      ['PUT, bad type, no token', { ...noToken, 'content-type': 'text/plain' }, 'PUT', '[]', 405, 'method not allowed'],
      ['bad type, no token, bad body', { ...noToken, 'content-type': 'text/plain' }, 'POST', '[]', 415, 'unsupported media type'],
      ['no token, bad body', noToken, 'POST', '[]', 403, 'bad token'],
      ['bad body', GOOD, 'POST', '[]', 400, 'bad request'],
    ]
    for (const [name, headers, method, body, status, error] of cases) {
      const res = await act(app, headers, method, body)
      expect(res.status, name).toBe(status)
      expect(await res.json(), name).toEqual({ error })
      noCors(res)
    }
    expect(reached()).toBe(0)
  })

  test('HEAD is not allowed either', async () => {
    const { app, reached } = actionGuarded()
    expect((await act(app, { host: GOOD.host }, 'HEAD')).status).toBe(405)
    expect(reached()).toBe(0)
  })

  test('the media type ignores case and parameters, and nothing else passes', async () => {
    const { app } = actionGuarded()
    for (const type of ['application/json', 'application/json; charset=utf-8', 'Application/JSON']) {
      expect((await act(app, { ...GOOD, 'content-type': type })).status, type).toBe(200)
    }
    const { 'content-type': _, ...noType } = GOOD
    expect((await act(app, noType)).status).toBe(415)
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonx', 'application/json-patch+json']) {
      expect((await act(app, { ...GOOD, 'content-type': type })).status, type).toBe(415)
    }
  })

  test('the token must match exactly', async () => {
    const { app } = actionGuarded()
    for (const token of ['', 'k'.repeat(42), 'k'.repeat(44), 'j' + 'k'.repeat(42), ` ${TOKEN}`, TOKEN.toUpperCase() === TOKEN ? 'x' : TOKEN.toUpperCase()]) {
      const res = await act(app, { ...GOOD, 'x-pod-board-token': token })
      expect(res.status, JSON.stringify(token)).toBe(403)
      expect(await res.json()).toEqual({ error: 'bad token' })
    }
  })

  test('the body must be a JSON object', async () => {
    const { app } = actionGuarded()
    for (const body of ['', '{ nope', '[]', 'null', '5', '"x"', 'true']) {
      const res = await act(app, GOOD, 'POST', body)
      expect(res.status, body).toBe(400)
      expect(await res.json()).toEqual({ error: 'bad request' })
    }
    expect((await act(app, GOOD, 'POST', '{"a":1}')).status).toBe(200)
  })

  test('the handler can still read the body', async () => {
    const app = new Hono()
    app.use('*', actionGuard({ ports: [3040, 3041], token: TOKEN }))
    app.post('/api/actions/x', async (c) => c.json(await c.req.json()))
    const res = await act(app, GOOD, 'POST', '{"number":7}')
    expect(await res.json()).toEqual({ number: 7 })
  })
})

describe('repo identity', () => {
  test('drops trailing separators and uses \\ on win32', () => {
    expect(normalizeRepoPath('E:/Projects/pod-board/', 'win32')).toBe('E:\\Projects\\pod-board')
    expect(normalizeRepoPath('E:\\Projects/pod-board\\\\', 'win32')).toBe('E:\\Projects\\pod-board')
    expect(normalizeRepoPath('E:/Projects/./x/../pod-board', 'win32')).toBe('E:\\Projects\\pod-board')
    expect(normalizeRepoPath('E:/', 'win32')).toBe('E:\\')
  })

  test('drops trailing slashes on POSIX and keeps the root', () => {
    expect(normalizeRepoPath('/home/me/repo/', 'linux')).toBe('/home/me/repo')
    expect(normalizeRepoPath('/home/me//repo///', 'darwin')).toBe('/home/me/repo')
    expect(normalizeRepoPath('/', 'linux')).toBe('/')
  })

  test('repoId maps every non-alphanumeric character to - and lowercases where case is ignored', () => {
    expect(repoId('E:\\Projects\\Pod-Board', 'win32', true)).toBe('e--projects-pod-board')
    expect(repoId('e:/projects/pod-board/', 'win32', true)).toBe('e--projects-pod-board')
    expect(repoId('/home/Me/my repo', 'linux', false)).toBe('-home-Me-my-repo')
    expect(repoId('/home/Me/my repo/', 'linux', false)).toBe('-home-Me-my-repo')
  })

  test('case follows the file system, not the OS name', () => {
    // A default macOS volume ignores case.
    expect(sameRepoPath('/Users/me/Repo-B', '/Users/me/repo-b/', 'darwin', true)).toBe(true)
    expect(repoId('/Users/me/Repo-B', 'darwin', true)).toBe(repoId('/users/me/repo-b', 'darwin', true))
    // A case-sensitive folder on Windows (fsutil, WSL) keeps it.
    expect(sameRepoPath('E:\\A\\B', 'e:/a/b', 'win32', false)).toBe(false)
    expect(repoId('E:\\A\\B', 'win32', false)).not.toBe(repoId('e:/a/b', 'win32', false))
    // Separators and trailing slashes never matter.
    expect(sameRepoPath('E:\\A\\B', 'E:/A/B/', 'win32', false)).toBe(true)
    expect(sameRepoPath('/A/B', '/a/b', 'linux', false)).toBe(false)
    expect(repoId('E:\\A\\B', 'win32', true)).toBe(repoId('e:/a/b', 'win32', true))
    expect(repoId('/A/B', 'linux', false)).not.toBe(repoId('/a/b', 'linux', false))
  })
})

describe('ignoresCase probe', () => {
  test('matches what the real file system does with another case', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pod-board-case-'))
    try {
      const dir = join(root, 'Probe-Dir')
      await mkdir(dir)
      // Independent check: does the other-case name reach the same folder?
      const truth = existsSync(join(root, 'pROBE-dIR'))
      expect(await ignoresCase(dir)).toBe(truth)
      // A name with no letters probes the nearest parent that has some.
      const digits = join(dir, '123')
      await mkdir(digits)
      expect(await ignoresCase(digits)).toBe(truth)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('two folders that differ only in case are a case-sensitive file system', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pod-board-case-'))
    try {
      await mkdir(join(root, 'twin'))
      if (existsSync(join(root, 'TWIN'))) return // this file system ignores case: no twins possible
      await mkdir(join(root, 'TWIN'))
      expect(await ignoresCase(join(root, 'twin'))).toBe(false)
      expect(await ignoresCase(join(root, 'TWIN'))).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a missing folder falls back to the OS default and never throws', async () => {
    const gone = join(tmpdir(), 'pod-board-case-gone-' + Date.now(), 'Nope')
    expect(await ignoresCase(gone)).toBe(process.platform === 'win32' || process.platform === 'darwin')
  })
})

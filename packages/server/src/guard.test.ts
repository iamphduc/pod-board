import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'
import { normalizeRepoPath, repoId, requestGuard } from './guard.ts'

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

  test('repoId maps every non-alphanumeric character to - and lowercases on win32', () => {
    expect(repoId('E:\\Projects\\Pod-Board', 'win32')).toBe('e--projects-pod-board')
    expect(repoId('e:/projects/pod-board/', 'win32')).toBe('e--projects-pod-board')
    expect(repoId('/home/Me/my repo', 'linux')).toBe('-home-Me-my-repo')
    expect(repoId('/home/Me/my repo/', 'linux')).toBe('-home-Me-my-repo')
  })

  test('case only matters off win32', () => {
    expect(repoId('E:\\A\\B', 'win32')).toBe(repoId('e:/a/b', 'win32'))
    expect(repoId('/A/B', 'linux')).not.toBe(repoId('/a/b', 'linux'))
  })
})

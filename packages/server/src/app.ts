import type { Board } from '@pod-board/model'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { requestGuard } from './guard.ts'
import type { AddRepoError } from './repos-config.ts'

export const PING_MS = 15_000

/** Where the routes get the Board. The board watcher is one. */
export type BoardSource = {
  board(): Board
  subscribe(fn: (b: Board) => void): () => void
  rebuild(): Promise<void>
}

export type AppDeps = {
  /** The API and web ports: the only ones the request guard lets in. */
  ports: readonly number[]
  source: BoardSource
  addRepo: (path: string) => Promise<{ path: string } | { error: AddRepoError }>
  pingMs?: number
}

const ADD_REPO_STATUS = { 'not absolute': 400, 'not a directory': 400, 'already registered': 409, 'config unreadable': 500 } as const

/** The HTTP app. Routes live under /api; the web dev server proxies to it. Every route sits behind the request guard. */
export function createApp(deps: AppDeps): Hono {
  const pingMs = deps.pingMs ?? PING_MS
  const app = new Hono()
  app.use('*', requestGuard({ ports: deps.ports }))

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.get('/api/board', (c) => c.json(deps.source.board()))

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      // Boards are written in order, one at a time; a client that left gets no more.
      let queue: Promise<void> = Promise.resolve()
      const send = (b: Board) => {
        queue = queue.then(() => stream.writeSSE({ event: 'board', data: JSON.stringify(b) })).catch(() => {})
      }
      send(deps.source.board())
      const unsubscribe = deps.source.subscribe(send)
      const ping = setInterval(() => {
        queue = queue.then(() => stream.write(': ping\n\n')).then(
          () => {},
          () => {},
        )
      }, pingMs)
      await new Promise<void>((resolve) => {
        const stop = () => {
          clearInterval(ping)
          unsubscribe()
          resolve()
        }
        if (stream.aborted) stop()
        else stream.onAbort(stop)
      })
    }),
  )

  app.post('/api/repos', async (c) => {
    const type = (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (type !== 'application/json') return c.json({ error: 'unsupported media type' }, 415)
    let body: unknown
    try {
      body = JSON.parse(await c.req.text())
    } catch {
      return c.json({ error: 'bad request' }, 400)
    }
    const repoPath = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as { path?: unknown }).path : undefined
    if (typeof repoPath !== 'string') return c.json({ error: 'bad request' }, 400)

    let result: Awaited<ReturnType<AppDeps['addRepo']>>
    try {
      result = await deps.addRepo(repoPath)
    } catch {
      return c.json({ error: 'config unwritable' }, 500)
    }
    if ('error' in result) return c.json({ error: result.error }, ADD_REPO_STATUS[result.error])
    // The new repo is on the board, and sent to every client, before the 201.
    await deps.source.rebuild()
    return c.json({ path: result.path }, 201)
  })

  return app
}

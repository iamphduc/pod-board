// The answer route, mounted at /api/actions beside the merge routes, behind the action guard:
// appends your answer to a queue entry waiting on you. The repo comes from the current Board by
// id, and the entry by its whole line. The rules and why are in pod-docs/feature-details/actions.md.

import { cleanAnswer, isAnswerable, type AnswerResult, type Board, type NewActionEntry, type QueueItem } from '@pod-board/model'
import { Hono } from 'hono'
import { nodeQueueFs, writeAnswer, type QueueFs } from './queue-writer.ts'

export type AnswerRouteDeps = {
  /** The current Board. */
  board(): Board
  /** Rebuilds the Board and sends it to every client (the watcher's `rebuild`). */
  rebuild(): Promise<void>
  log: { append(entry: NewActionEntry): Promise<boolean> }
  fs?: QueueFs
}

/** The log's target: the entry's header, never its body or the answer. */
export const answerTarget = (item: Pick<QueueItem, 'date' | 'type' | 'route'>) =>
  [item.date, item.type, item.route.trim()].filter((part) => part !== undefined && part !== '').join(' · ')

export function createAnswerRoutes(deps: AnswerRouteDeps): Hono {
  const fs = deps.fs ?? nodeQueueFs
  // Repo ids with an answer writing now.
  const inFlight = new Set<string>()
  const app = new Hono()

  app.post('/answer', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    const { repoId, line, text } = body
    if (typeof repoId !== 'string' || typeof line !== 'string' || typeof text !== 'string') return c.json({ error: 'bad request' }, 400)
    const clean = cleanAnswer(text)
    if (!clean.ok) return c.json({ error: clean.error }, 400)

    const repo = deps.board().repos.find((r) => r.id === repoId)
    const item = repo?.model.queue.find((e) => e.line === line && isAnswerable(e))
    if (!repo || !item) return c.json({ error: 'not waiting on you' }, 404)
    if (inFlight.has(repoId)) return c.json({ error: 'answer in progress' }, 409)

    inFlight.add(repoId)
    try {
      const result = await settle(() => writeAnswer({ repoPath: repo.path, line, text: clean.text }, fs))
      const { outcome, message } = result ?? { outcome: 'failed' as const, message: "Couldn't write the queue (unknown)." }
      const entry: NewActionEntry = { action: 'answer', repoId, repo: repo.name, target: answerTarget(item), result: outcome }
      if (message !== undefined) entry.message = message
      const logged = await settle(() => deps.log.append(entry))
      // The Board carries the answer and the new log entry before the response.
      await settle(deps.rebuild)
      const res: AnswerResult = { outcome, logged: logged === true }
      if (message !== undefined) res.message = message
      return c.json(res)
    } finally {
      inFlight.delete(repoId)
    }
  })

  return app
}

/** Runs `fn`; a throw is `undefined`, so the response still goes out. */
async function settle<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch {
    return undefined
  }
}

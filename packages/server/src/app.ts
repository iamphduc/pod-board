import { Hono } from 'hono'

/** The HTTP app. Routes live under /api; the web dev server proxies to it. */
export function createApp(): Hono {
  const app = new Hono()
  app.get('/api/health', (c) => c.json({ ok: true }))
  return app
}

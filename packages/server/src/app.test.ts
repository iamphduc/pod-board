import { describe, expect, test } from 'vitest'
import { createApp } from './app.ts'

describe('app', () => {
  test('GET /api/health returns ok', async () => {
    const res = await createApp().request('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(await res.json()).toEqual({ ok: true })
  })

  test('unknown route returns 404', async () => {
    const app = createApp()
    expect((await app.request('/api/nope')).status).toBe(404)
    expect((await app.request('/')).status).toBe(404)
    // Only GET answers on the health route.
    expect((await app.request('/api/health', { method: 'POST' })).status).toBe(404)
  })
})

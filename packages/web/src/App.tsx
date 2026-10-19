import { useEffect, useState } from 'react'

type Health = { state: 'checking' } | { state: 'ok' } | { state: 'down'; reason: string }

function label(health: Health): string {
  if (health.state === 'checking') return 'checking…'
  if (health.state === 'ok') return 'ok'
  return `down (${health.reason})`
}

export function App() {
  const [health, setHealth] = useState<Health>({ state: 'checking' })

  useEffect(() => {
    let live = true
    fetch('/api/health')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body: unknown = await res.json()
        if (typeof body !== 'object' || body === null || (body as { ok?: unknown }).ok !== true) {
          throw new Error('unexpected response')
        }
        if (live) setHealth({ state: 'ok' })
      })
      .catch((err: unknown) => {
        if (live) setHealth({ state: 'down', reason: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      live = false
    }
  }, [])

  return (
    <main>
      <h1>Pod Board</h1>
      <p>
        API health: <output data-testid="health">{label(health)}</output>
      </p>
    </main>
  )
}

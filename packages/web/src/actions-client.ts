// Sends one action to the API with the page's session token. The Vite dev
// server puts the token in a <meta name="pod-board-token"> tag; the API checks
// it on every /api/actions/ route. Every failure comes back as words a person
// can act on, never as a throw.

export type ActionReply<T> = { ok: true; data: T } | { ok: false; status: number; message: string }

export type ActionDeps = {
  fetch?: typeof fetch
  /** The session token; by default the page's token meta, read on each call. */
  token?: () => string | null | undefined
}

export const NEED_RELOAD = 'Actions need a page reload.'
export const RESTARTED = 'The board restarted. Reload the page.'
export const UNREACHABLE = "Can't reach the board."

const pageToken = () => document.querySelector('meta[name="pod-board-token"]')?.getAttribute('content')

/**
 * POST `/api/actions/<path>` with `body` as JSON. `path` is the action's name
 * under /api/actions, such as `merge-preview` (no leading slash).
 */
export async function postAction<T>(path: string, body: object, deps: ActionDeps = {}): Promise<ActionReply<T>> {
  const token = (deps.token ?? pageToken)()
  if (!token) return { ok: false, status: 0, message: NEED_RELOAD }
  let res: Response
  try {
    res = await (deps.fetch ?? fetch)(`/api/actions/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pod-Board-Token': token },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, status: 0, message: UNREACHABLE }
  }
  let data: unknown
  let parsed = true
  try {
    data = await res.json()
  } catch {
    parsed = false
  }
  if (res.ok && parsed) return { ok: true, data: data as T }
  const error = parsed && typeof data === 'object' && data !== null ? (data as { error?: unknown }).error : undefined
  if (res.status === 403 && error === 'bad token') return { ok: false, status: 403, message: RESTARTED }
  const message = typeof error === 'string' && error.trim() !== '' ? error : `HTTP ${res.status}`
  return { ok: false, status: res.status, message }
}

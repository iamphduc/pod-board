import path from 'node:path'
import type { MiddlewareHandler } from 'hono'

/**
 * Refuses requests that don't come from the board's own pages. The server
 * binds 127.0.0.1, but a web page on any site can still make the browser send
 * requests there; a foreign `Host` (DNS rebinding) or a foreign `Origin` (a
 * cross-site POST) gets a 403. GET and HEAD skip the Origin check because
 * browsers leave Origin off same-origin GETs. Nothing here sets CORS headers,
 * so no other origin can read a response.
 */
export function requestGuard({ ports }: { ports: readonly number[] }): MiddlewareHandler {
  const hosts = new Set(ports.flatMap((p) => [`127.0.0.1:${p}`, `localhost:${p}`]))
  const origins = new Set([...hosts].map((h) => `http://${h}`))
  return async (c, next) => {
    const host = c.req.header('host')
    if (host === undefined || !hosts.has(host)) return c.json({ error: 'forbidden host' }, 403)
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const origin = c.req.header('origin')
      if (origin === undefined || !origins.has(origin)) return c.json({ error: 'forbidden origin' }, 403)
    }
    await next()
  }
}

const pathFor = (platform: NodeJS.Platform) => (platform === 'win32' ? path.win32 : path.posix)

/**
 * A repo path in one canonical form: resolved, no trailing separator (the
 * root keeps its own), and `\` on win32. Compare two with `sameRepoPath`.
 */
export function normalizeRepoPath(p: string, platform: NodeJS.Platform): string {
  // `resolve` drops `.`, `..`, doubled and trailing separators, and on win32
  // turns `/` into `\`.
  return pathFor(platform).resolve(p)
}

/** Whether two paths name the same repo: case-insensitive on win32. */
export function sameRepoPath(a: string, b: string, platform: NodeJS.Platform): boolean {
  const x = normalizeRepoPath(a, platform)
  const y = normalizeRepoPath(b, platform)
  return platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

/** A URL-safe id for a repo: its normalized path with each non-alphanumeric character as `-`. */
export function repoId(p: string, platform: NodeJS.Platform): string {
  const id = normalizeRepoPath(p, platform).replace(/[^A-Za-z0-9]/g, '-')
  return platform === 'win32' ? id.toLowerCase() : id
}

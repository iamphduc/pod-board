import { stat } from 'node:fs/promises'
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

/** Guards every route under /api/actions/. Stub. */
export function actionGuard(_opts: { ports: readonly number[]; token: string }): MiddlewareHandler {
  return async (_c, next) => {
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

/**
 * Whether two paths name the same repo. `ignoresCase` is the file system's
 * rule for the folder (see `ignoresCase()`), not the OS: a default macOS
 * volume ignores case and a Windows folder can be made case-sensitive.
 */
export function sameRepoPath(a: string, b: string, platform: NodeJS.Platform, ignoresCase: boolean): boolean {
  const x = normalizeRepoPath(a, platform)
  const y = normalizeRepoPath(b, platform)
  return ignoresCase ? x.toLowerCase() === y.toLowerCase() : x === y
}

/**
 * A URL-safe id for a repo: its normalized path with each non-alphanumeric
 * character as `-`, lowercased when its file system ignores case.
 */
export function repoId(p: string, platform: NodeJS.Platform, ignoresCase: boolean): string {
  const id = normalizeRepoPath(p, platform).replace(/[^A-Za-z0-9]/g, '-')
  return ignoresCase ? id.toLowerCase() : id
}

/**
 * Whether the file system holding an existing folder ignores case. It flips
 * the case of the last path part with an ASCII letter and checks that the
 * flipped path reaches the same folder. A path it can't probe (missing,
 * unreadable, no letters) gets the OS default: win32 and macOS volumes
 * ignore case unless set up otherwise.
 */
export async function ignoresCase(dir: string): Promise<boolean> {
  const fallback = process.platform === 'win32' || process.platform === 'darwin'
  const full = path.resolve(dir)
  const { root } = path.parse(full)
  const parts = full.slice(root.length).split(path.sep)
  const i = parts.findLastIndex((part) => /[A-Za-z]/.test(part))
  if (i < 0) return fallback
  const flipped = [...parts]
  flipped[i] = parts[i]!.replace(/[A-Za-z]/g, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
  let original: { dev: bigint; ino: bigint }
  try {
    original = await stat(full, { bigint: true })
  } catch {
    return fallback
  }
  try {
    const other = await stat(root + flipped.join(path.sep), { bigint: true })
    return other.dev === original.dev && other.ino === original.ino
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    return code === 'ENOENT' || code === 'ENOTDIR' ? false : fallback
  }
}

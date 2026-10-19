import type { MiddlewareHandler } from 'hono'

export function requestGuard(_opts: { ports: number[] }): MiddlewareHandler {
  return async (_c, next) => {
    await next()
  }
}

export function normalizeRepoPath(p: string, _platform: NodeJS.Platform): string {
  return p
}

export function repoId(p: string, _platform: NodeJS.Platform): string {
  return p
}

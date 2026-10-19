export type Env = Record<string, string | undefined>

export type ListenConfig = { hostname: '127.0.0.1'; port: number }

export const DEFAULT_API_PORT = 3000

/**
 * Reads a TCP port from `env[name]`. Unset or empty → `fallback`. Anything
 * other than a plain integer from 1 to 65535 throws an error naming the
 * variable, so a typo fails at start instead of binding somewhere odd.
 */
export function portFromEnv(env: Env, name: string, fallback: number): number {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const port = /^[0-9]+$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535, got ${JSON.stringify(raw)}`)
  }
  return port
}

/** Where the API server listens. Always loopback: the board reads local files. */
export function listenConfig(env: Env): ListenConfig {
  return { hostname: '127.0.0.1', port: portFromEnv(env, 'POD_BOARD_API_PORT', DEFAULT_API_PORT) }
}

/** Where the board keeps its own config file. Not built yet. */
export function configPath(_env: Env, _platform: NodeJS.Platform, _home: string): string {
  return ''
}

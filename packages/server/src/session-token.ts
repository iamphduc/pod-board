export const TOKEN_FILE = 'session-token'
export const TOKEN_META = 'pod-board-token'

export type TokenMetaPlugin = { name: string; apply: 'serve'; transformIndexHtml: (html: string) => string }

export function createSessionToken(): string {
  return ''
}

export async function writeSessionToken(_dir: string, _token: string): Promise<void> {}

export function readSessionToken(_dir: string): string | undefined {
  return undefined
}

export function injectTokenMeta(html: string, _token?: string): string {
  return html
}

export function tokenMetaPlugin(_dir: string): TokenMetaPlugin {
  return { name: 'pod-board-token', apply: 'build' as 'serve', transformIndexHtml: (html) => html }
}

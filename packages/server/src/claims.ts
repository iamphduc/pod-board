import type { Env } from './config.ts'

export type Claim = { portBase: number; repoPath: string; plan: string }

export function parseClaim(_fileName: string, _text: string): Claim | undefined {
  return { portBase: 0, repoPath: '', plan: '' }
}

export function portsDir(_env: Env, _tmp: string): string {
  return ''
}

export async function readClaims(_dir: string): Promise<Claim[]> {
  return [{ portBase: 0, repoPath: '', plan: '' }]
}

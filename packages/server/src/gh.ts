// Contract types: same shape as `PrStatus` and `GhStatus` in `@pod-board/model` (M1).
export type PrStatus = {
  number: number
  state: 'open' | 'merged' | 'closed'
  checks: 'pass' | 'fail' | 'pending' | 'none'
  url?: string
  checkedAt: number
}
export type GhStatus = 'ok' | 'missing' | 'logged-out' | 'unknown'

export type ExecResult = { status: 'ok' | 'failed' | 'not-found'; stdout: string }
export type GhExec = (args: string[], cwd: string) => Promise<ExecResult>

export type GhReader = {
  status(): GhStatus
  checkedAt(): number | undefined
  get(repoPath: string, n: number): PrStatus | undefined
  refresh(repoPath: string, numbers: number[]): Promise<boolean>
}

export function createGhReader(_opts: { exec?: GhExec; now?: () => number } = {}): GhReader {
  return {
    status: () => 'unknown',
    checkedAt: () => undefined,
    get: () => undefined,
    refresh: async () => false,
  }
}

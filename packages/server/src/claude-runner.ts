import type { ReplyWord } from '@pod-board/model'
import type { Env } from './config.ts'

export type ResumeWord = Exclude<ReplyWord, 'try'>
export type StartResult = { outcome: 'started' | 'failed'; message?: string }
export type ClaudeRunner = {
  start(r: { session: string; word: ResumeWord; cwd: string }): Promise<StartResult>
  isRunning(session: string): boolean
}

export const RESUME_WINDOW_MS = 10_000

export function claudeBin(_env: Env): string {
  return ''
}

export function createClaudeRunner(_o: {
  bin: string
  logDir: string
  env?: NodeJS.ProcessEnv
  windowMs?: number
}): ClaudeRunner {
  return {
    start: async () => ({ outcome: 'failed', message: 'not built' }),
    isRunning: () => false,
  }
}

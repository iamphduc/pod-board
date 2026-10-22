// Stub: filled in by the feat commit.
import type { Board, BoardRepo } from './board.ts'
import type { RunReply } from './replies.ts'

export type AutoToggle = { repoId: string; run: string; lastKey?: string }
export type AutoSend = { repoId: string; run: string; session: string; key: string }

export function sendableFrom(_replies: RunReply[], _word: 'continue' | 'go'): RunReply | undefined {
  return undefined
}
export function sendableReply(_repo: BoardRepo, _run: string, _word: 'continue' | 'go', _now: number): RunReply | undefined {
  return undefined
}
export function autoSends(_board: Board, _toggles: AutoToggle[], _now: number, _idle: (repo: BoardRepo, session: string) => boolean): AutoSend[] {
  return []
}

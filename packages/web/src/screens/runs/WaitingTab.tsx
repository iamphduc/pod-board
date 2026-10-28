import type { BoardRepo, RunSummary } from '@pod-board/model'
import type { NextItem } from './next-step.ts'

export function WaitingTab(_props: { repo: BoardRepo; run: RunSummary; items: NextItem[] }) {
  return null
}

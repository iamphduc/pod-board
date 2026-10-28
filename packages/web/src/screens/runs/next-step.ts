// The Next step card and the Waiting tab: the selected run's most urgent item and its one action,
// then everything else that waits on you. Picks from the model's rules only (the queue entries,
// waitingPrs, the reply panel). Pure; the card and the tab only render these.

import type { BoardRepo, RunSummary } from '@pod-board/model'
import type { WaitingRow } from './queue-view.ts'
import type { ReplyPanelView } from './reply-view.ts'

export type NextStatus = 'blocked' | 'needs-you' | 'ready' | 'running' | 'idle'
export type NextAction =
  | { kind: 'answer'; repoId: string; line: string }
  | { kind: 'merge'; repoId: string; number: number }
  | { kind: 'reply'; panel: ReplyPanelView }
  | { kind: 'none' }
export type NextItem = {
  key: string
  tier: 'blocked' | 'merge' | 'reply' | 'pending' | 'info' | 'nothing'
  status: NextStatus
  title: string
  detail?: string
  entry?: WaitingRow
  action: NextAction
}
export type NextSteps = { card: NextItem; rest: NextItem[] }

export function nextSteps(_run: RunSummary | undefined, _repo: BoardRepo | undefined, _now: number): NextSteps | undefined {
  return undefined
}

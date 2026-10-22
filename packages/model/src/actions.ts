// Board actions: the shapes the merge routes send and the action log keeps. Types only;
// times are epoch ms. The shapes are the sprint's shared contract (pod-docs/sprints/merge-actions.md).

import type { PrStatus } from './board.ts'

/** A fresh read of a waiting PR, shown before you confirm a merge. */
export type MergePreview = {
  number: number
  url: string
  title: string
  headSha: string
  state: PrStatus['state']
  checks: PrStatus['checks']
  mergeable: 'mergeable' | 'conflicting' | 'unknown'
  mergeState: string
}

export type MergeOutcome = 'merged' | 'queued' | 'auto-merge' | 'stale' | 'failed' | 'unconfirmed'

/** `merged` only ever comes from re-reading the PR after the merge call. */
export type MergeResult = { outcome: MergeOutcome; number: number; message?: string; headSha?: string; logged: boolean }

/** One logged action. `target` is `PR #N`. Later sprints widen `action` and `result`. */
export type ActionEntry = { at: number; action: 'merge'; repoId: string; repo: string; target: string; result: MergeOutcome; message?: string }

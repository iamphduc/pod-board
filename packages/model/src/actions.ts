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

export type AnswerOutcome = 'answered' | 'changed' | 'failed'

/** What the answer route sends back. */
export type AnswerResult = { outcome: AnswerOutcome; message?: string; logged: boolean }

/**
 * One logged action. A merge's `target` is `PR #N`; an answer's is the queue entry's
 * `<date> · <TYPE> · <from → to>`, never the answer text or the body.
 */
export type ActionEntry = { at: number; repoId: string; repo: string; target: string; message?: string } & (
  | { action: 'merge'; result: MergeOutcome }
  | { action: 'answer'; result: AnswerOutcome }
)

/** An entry before the log stamps its time. Omit spreads over the union, so `action` and `result` stay paired. */
export type NewActionEntry = ActionEntry extends infer E ? (E extends ActionEntry ? Omit<E, 'at'> : never) : never

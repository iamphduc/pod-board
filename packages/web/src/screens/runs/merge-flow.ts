// Stub: the merge flow is built in the next commit.
import type { MergePreview, MergeResult } from '@pod-board/model'
import type { ActionReply } from '../../actions-client.ts'
import type { Chip, ChipClass } from './view.ts'

export type MergeTarget = { repoId: string; number: number }
export type Post = <T>(path: string, body: object) => Promise<ActionReply<T>>
export type MergeState = { kind: 'idle' | 'loading' | 'confirm' | 'merging' | 'result' | 'error'; seq: number; target?: MergeTarget; preview?: MergePreview; result?: MergeResult; message?: string }
export type ConfirmView = { heading: string; status?: string; title?: string; checks?: Chip; mergeability?: string; sha?: string; result?: { words: string; tone: ChipClass; note?: string }; error?: string; showMerge: boolean; canMerge: boolean; blockReason?: string; checkAgain: boolean; tryAgain: boolean; closeLabel: string; cancelDisabled: boolean }
export type MergeFlow = { state(): MergeState; open(t: MergeTarget): void; merge(): void; cancel(): void; retry(): void; key(k: string): void }

export const confirmView = (_s: MergeState): ConfirmView | undefined => undefined
export function createMergeFlow(_onChange: (s: MergeState) => void, _post: Post): MergeFlow {
  const s: MergeState = { kind: 'idle', seq: 0 }
  return { state: () => s, open() {}, merge() {}, cancel() {}, retry() {}, key() {} }
}

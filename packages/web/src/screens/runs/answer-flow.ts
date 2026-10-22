// Stub for the test-first commit; the real flow follows.
import type { AnswerResult } from '@pod-board/model'
import type { ActionReply } from '../../actions-client.ts'
import type { Chip } from './view.ts'

export type AnswerTarget = { repoId: string; line: string }
export type Post = <T>(path: string, body: object) => Promise<ActionReply<T>>

export type AnswerState =
  | { kind: 'idle'; seq: number }
  | { kind: 'editing'; seq: number; target: AnswerTarget; text: string; error?: string }
  | { kind: 'saving'; seq: number; target: AnswerTarget; text: string }
  | { kind: 'result'; seq: number; target: AnswerTarget; text: string; result: AnswerResult }
  | { kind: 'error'; seq: number; target: AnswerTarget; text: string; message: string }

export const INITIAL: AnswerState = { kind: 'idle', seq: 0 }

export type AnswerFlow = {
  state(): AnswerState
  open(target: AnswerTarget): void
  type(text: string): void
  save(): void
  cancel(): void
  key(key: string): void
}

export function createAnswerFlow(_onChange: (s: AnswerState) => void, _post?: Post): AnswerFlow {
  const state = INITIAL
  return { state: () => state, open: () => {}, type: () => {}, save: () => {}, cancel: () => {}, key: () => {} }
}

export type FormView = {
  showText: boolean
  text: string
  canSave: boolean
  status?: string
  error?: string
  result?: { words: string; chip: Chip; note?: string }
  note: string
  closeLabel: 'Cancel' | 'Close'
  cancelDisabled: boolean
}

export function formView(_s: AnswerState): FormView | undefined {
  return undefined
}

export type AnswerEvent =
  | { type: 'open'; target: AnswerTarget }
  | { type: 'type'; text: string }
  | { type: 'save' }
  | { type: 'saved'; seq: number; reply: ActionReply<AnswerResult> }
  | { type: 'cancel' }
  | { type: 'key'; key: string }

export function reduce(s: AnswerState, _e: AnswerEvent): AnswerState {
  return s
}

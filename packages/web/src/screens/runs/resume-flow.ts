// Skeleton: the auto-continue switch and the Continue and Go buttons. Filled in after the tests.

import type { Board, ResumeResult, RunSummary } from '@pod-board/model'
import type { ActionReply } from '../../actions-client.ts'
import type { Chip } from './view.ts'

export type RunTarget = { repoId: string; run: string }
export type Post = <T>(path: string, body: object) => Promise<ActionReply<T>>

export const RESUME_FAILED = ''
export const NOT_LOGGED = ''

export function switchView(_run: RunSummary | undefined, _board: Board | undefined): { on: boolean } | undefined {
  return undefined
}

export type ToggleState = { kind: 'idle'; seq: number } | { kind: 'saving' | 'saved' | 'error'; seq: number; on: boolean; message?: string }
export type ToggleView = { on: boolean; disabled: boolean; error?: string }

export function toggleView(_boardOn: boolean, _s: ToggleState): ToggleView {
  return { on: false, disabled: false }
}

export function createToggleFlow(_t: RunTarget, _onChange: (s: ToggleState) => void, _post: Post) {
  return { state: (): ToggleState => ({ kind: 'idle', seq: 0 }), press: () => {}, board: (_on: boolean) => {} }
}

export type ResumeWord = 'continue' | 'go'
export type ResumeState = { kind: 'idle'; seq: number } | { kind: 'sending' | 'result' | 'error'; seq: number; word: ResumeWord; result?: ResumeResult }
export type ResumeView = { busy: boolean; word?: ResumeWord; status?: string; result?: { chip: Chip; words: string; note?: string }; error?: string }

export function startedText(_resume: string | undefined): string {
  return ''
}

export function resumeView(_s: ResumeState, _resume: string | undefined): ResumeView {
  return { busy: true }
}

export function createResumeFlow(_t: RunTarget, _onChange: (s: ResumeState) => void, _post: Post) {
  return { state: (): ResumeState => ({ kind: 'idle', seq: 0 }), press: (_w: ResumeWord) => {}, close: () => {} }
}

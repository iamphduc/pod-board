import type { Board } from '@pod-board/model'
export type StreamState = 'connecting' | 'live' | 'lost'
export type StreamSource = { addEventListener(type: string, fn: (ev: { data?: unknown }) => void): void; close(): void }
export function createBoardStream(_open: () => StreamSource, _onBoard: (b: Board) => void, _onState: (s: StreamState) => void) {
  return { stop() {} }
}

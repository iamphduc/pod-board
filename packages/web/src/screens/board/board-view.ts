// Stub so the tests fail on assertions, not imports. Replaced in the feat commit.
import type { AgentRun, BoardRepo, LogRow, SliceModel } from '@pod-board/model'
import type { Chip } from '../runs/view.ts'
export type CardState = 'needs-you' | 'running' | 'waiting' | 'blocked' | 'merged'
export type Card = { code: string; title: string; state: CardState; meta: string; critical: boolean; slice: SliceModel; row: LogRow }
export type Column = { wave: number; status: string; cards: Card[] }
export type Edge = { from: string; to: string; critical: boolean }
export type WaveBoard = { sprint?: string; caption: string; columns: Column[]; edges: Edge[]; counts: Record<CardState, number> }
export type FilterState = { key: string | undefined; on: readonly CardState[] }
export const buildWaveBoard = (_r: BoardRepo, _p: string, _n: number): WaveBoard | undefined => ({
  caption: '',
  columns: [],
  edges: [],
  counts: { 'needs-you': 0, running: 0, waiting: 0, blocked: 0, merged: 0 },
})
export const boardSlices = (_r: BoardRepo | undefined, _p: string, _n: number): string[] => ['?']
export const engineerFor = (_r: BoardRepo, _p: string, _s: string, _c: string): AgentRun | undefined => ({ id: 'x' }) as AgentRun
export const cardChip = (_s: CardState): Chip => ({ cls: 's-idle', label: '' })
export const filterState = {
  ORDER: [] as CardState[],
  forSprint: (_f: FilterState | undefined, key: string): FilterState => ({ key, on: [] }),
  toggle: (f: FilterState, _s: CardState): FilterState => f,
  isOn: (_f: FilterState, _s: CardState) => true,
  isDimmed: (_f: FilterState, _c: Card) => true,
}

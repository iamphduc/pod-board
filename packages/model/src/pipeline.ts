import type { BoardRepo } from './board.ts'

export type StepState = 'done' | 'live' | 'wait' | 'you' | 'blocked' | 'unknown'
export type Step = { key: string; label: string; state: StepState; detail: string }
export type Stage = { key: string; caption: string; steps: Step[] }
export type LogRow = { code: string; title: string; model?: string; confidence?: string; minutes?: number; tokens?: number; live: boolean }
export type LogGroup = { sprint: string; wave: number; label: string; status: string; rows: LogRow[] }
export type Pipeline = { stages: Stage[]; log: LogGroup[] }

export function buildPipeline(_repo: BoardRepo, _planSlug: string, _now: number): Pipeline | undefined {
  return { stages: [], log: [] }
}

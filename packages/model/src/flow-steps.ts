import type { BoardRepo } from './board.ts'
import type { Stage, StepState } from './pipeline.ts'

export type FlowColumnKey = 'think' | 'you' | 'check' | 'ship'
export type FlowReading = { state: StepState | 'skipped'; detail: string }
export type FlowStepDef = { id: string; column: FlowColumnKey; label: string; read: (ctx: unknown) => FlowReading | undefined }

export const FLOW_STEPS: FlowStepDef[] = []

/** Not built yet. */
export function buildFlow(_repo: BoardRepo, _plan: string, _now: number, _steps: FlowStepDef[] = FLOW_STEPS): Stage[] | undefined {
  return undefined
}

/** Not built yet. */
export function stagingBranches(_repo: Pick<BoardRepo, 'model' | 'prs' | 'claims'>): string[] {
  return []
}

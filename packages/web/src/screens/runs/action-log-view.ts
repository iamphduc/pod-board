// Stub: the action log rows are built in the next commit.
import type { ActionEntry, MergeOutcome } from '@pod-board/model'
import type { Chip } from './view.ts'

export const ACTION_LOG_CAP = 0
export const NO_ACTIONS = ''
export type ActionLogRow = { key: string; time: string; repo: string; target: string; chip: Chip }
export const outcomeChip = (r: MergeOutcome): Chip => ({ cls: 's-idle', label: r })
export const actionLogRows = (_e: ActionEntry[] | undefined, _now: number): ActionLogRow[] => []

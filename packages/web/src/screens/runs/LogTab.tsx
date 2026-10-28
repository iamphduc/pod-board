import type { ActionEntry, BoardRepo, FixPipeline, Pipeline, RunSummary } from '@pod-board/model'

type Props = { repo: BoardRepo; run: RunSummary; pipeline?: Pipeline; fixPipeline?: FixPipeline; agent?: string; now: number; actions: ActionEntry[] }

export function LogTab(_props: Props) {
  return null
}

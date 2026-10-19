export type Dispatch = {
  type: string
  description: string
  startedAt?: number
  sprint?: string
  slice?: string
  branch?: string
  /** A reviewer's plan slug and round, from its dispatch. */
  plan?: string
  round?: number
}

export type TreeKind = 'plan' | 'sprint' | 'wave' | 'slice' | 'agent' | 'halt' | 'hint' | 'concern' | 'review' | 'round'

export type TreeLine = {
  depth: number
  kind: TreeKind
  text: string
  status: string
  note?: string
  sprint?: string
  detail?: string
  /** A sprint's blocked slices, shown in red on its folded row. */
  blockedCount?: number
  /** The rest of the row above, drawn under it without a branch of its own. */
  isContinued?: boolean
}

/** A turn's token usage, as the transcript records it. Stands in for `ModelUsage` from 'claude-code'. */
export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

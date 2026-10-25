// The rule behind the render error boundary: after a render error, show the
// notice until the reset key (the Board's `generatedAt`) changes, then try again.

import type { Chip } from './screens/runs/view.ts'

export type BoundaryState = { failed: boolean; key: unknown }

export const RENDER_FAILED: { chip: Chip; text: string } = {
  chip: { cls: 's-bad', label: 'render failed' },
  text: "Couldn't show this board. It tries again when the board next changes; details are in the browser console.",
}

/** The state for the next render: a failure holds until the key moves on. */
export function nextBoundaryState(state: BoundaryState, key: unknown): BoundaryState {
  if (state.failed && key === state.key) return state
  return { failed: false, key }
}

// Where the wave board's dependency lines go: a curve from the right edge of one
// card to the left edge of the next, each at its card's middle, in the board's
// own coordinates. Pure, so the SVG drawing in BoardScreen is only glue.

export type Box = { left: number; top: number; right: number; bottom: number }

/** At most one decimal, with no trailing `.0`. */
const n = (v: number) => String(Math.round(v * 10) / 10)

/** `M x1 y1 C m y1 m y2 x2 y2`, relative to `origin`'s top left. */
export function edgePath(from: Box, to: Box, origin: Box): string {
  const x1 = from.right - origin.left
  const y1 = (from.top + from.bottom) / 2 - origin.top
  const x2 = to.left - origin.left
  const y2 = (to.top + to.bottom) / 2 - origin.top
  const m = (x1 + x2) / 2
  return `M${n(x1)} ${n(y1)} C${n(m)} ${n(y1)} ${n(m)} ${n(y2)} ${n(x2)} ${n(y2)}`
}

// Where the connector lines go, on the wave board and in screen 1's run flow: a
// curve from the right edge of one card to the left edge of the next, each at its
// card's middle; a straight line from the middle of a card's bottom edge to the
// next card's top edge; and a small arrowhead. In the drawing box's own
// coordinates. Pure, so the SVG drawing is only glue.

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

/** `M x y1 L x y2`: from the middle of `from`'s bottom edge straight down to `to`'s top edge, relative to `origin`. */
export function downPath(from: Box, to: Box, origin: Box): string {
  const x = (from.left + from.right) / 2 - origin.left
  return `M${n(x)} ${n(from.bottom - origin.top)} L${n(x)} ${n(to.top - origin.top)}`
}

/** An open chevron, 5 deep and 8 wide, with its tip on (`x`, `y`), pointing `dir`. */
export function headPath(x: number, y: number, dir: 'right' | 'left' | 'down'): string {
  if (dir === 'right') return `M${n(x - 5)} ${n(y - 4)} L${n(x)} ${n(y)} L${n(x - 5)} ${n(y + 4)}`
  if (dir === 'left') return `M${n(x + 5)} ${n(y - 4)} L${n(x)} ${n(y)} L${n(x + 5)} ${n(y + 4)}`
  return `M${n(x - 4)} ${n(y - 5)} L${n(x)} ${n(y)} L${n(x + 4)} ${n(y - 5)}`
}

/** Corner radius of the step routes. */
const CORNER = 6

/**
 * An orthogonal "smooth step" route from (x1, y1) to (x2, y2): horizontal out, one turn in the middle
 * between them, vertical, a second turn, horizontal in, with rounded corners (6 px, less on a small
 * step or a narrow gap). A straight line when both share a mid-line (within half a pixel).
 */
function step(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y2 - y1) < 0.5) return `M${n(x1)} ${n(y1)} L${n(x2)} ${n(y2)}`
  const m = (x1 + x2) / 2
  const dx = Math.sign(x2 - x1) || 1
  const dy = Math.sign(y2 - y1)
  const r = Math.min(CORNER, Math.abs(y2 - y1) / 2, Math.abs(x2 - x1) / 2)
  return [
    `M${n(x1)} ${n(y1)}`,
    `L${n(m - dx * r)} ${n(y1)}`,
    `Q${n(m)} ${n(y1)} ${n(m)} ${n(y1 + dy * r)}`,
    `L${n(m)} ${n(y2 - dy * r)}`,
    `Q${n(m)} ${n(y2)} ${n(m + dx * r)} ${n(y2)}`,
    `L${n(x2)} ${n(y2)}`,
  ].join(' ')
}

/** Across to a later column: from `from`'s right edge to `to`'s left edge, each at its mid-line, by a step route. */
export function stepPath(from: Box, to: Box, origin: Box): string {
  return step(from.right - origin.left, (from.top + from.bottom) / 2 - origin.top, to.left - origin.left, (to.top + to.bottom) / 2 - origin.top)
}

/**
 * Back to an earlier column, by the same step route through the gap: from two thirds down `from`'s left
 * edge to a third down `to`'s right edge, so it never runs along a line that meets either card at its
 * mid-line. Relative to `origin`.
 */
export function backPath(from: Box, to: Box, origin: Box): string {
  const x1 = from.left - origin.left
  const y1 = from.top + ((from.bottom - from.top) * 2) / 3 - origin.top
  const x2 = to.right - origin.left
  const y2 = to.top + (to.bottom - to.top) / 3 - origin.top
  return step(x1, y1, x2, y2)
}

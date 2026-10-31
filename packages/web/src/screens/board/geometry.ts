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

/**
 * Back to an earlier column: from `from`'s left edge (at its middle) to `to`'s right edge a third of the
 * way down, so it doesn't meet a line leaving `to`'s right edge at its middle. Relative to `origin`.
 */
export function backPath(from: Box, to: Box, origin: Box): string {
  const x1 = from.left - origin.left
  const y1 = (from.top + from.bottom) / 2 - origin.top
  const x2 = to.right - origin.left
  const y2 = to.top + (to.bottom - to.top) / 3 - origin.top
  const m = (x1 + x2) / 2
  return `M${n(x1)} ${n(y1)} C${n(m)} ${n(y1)} ${n(m)} ${n(y2)} ${n(x2)} ${n(y2)}`
}

/** Not built yet. */
export function stepPath(_from: Box, _to: Box, _origin: Box): string {
  return ''
}

/**
 * The app's icons: 16 px SVGs drawn in currentColor, 1.5 px strokes, hidden from
 * assistive tech (the button's label or aria-label names the action). Use these,
 * never a text glyph such as `+`, `⋯`, `✓`, `→` or `↑`.
 */
import type { ReactNode } from 'react'

export type IconName = 'plus' | 'more' | 'check' | 'chevron-right' | 'chevron-down' | 'arrow-up' | 'folder' | 'close'

/** Stroked shapes, drawn on a 16 × 16 grid. */
const STROKED: Record<Exclude<IconName, 'more'>, ReactNode> = {
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  check: <path d="M3.5 8.5l3 3 6-7" />,
  'chevron-right': <path d="M6 3.5L10.5 8 6 12.5" />,
  'chevron-down': <path d="M3.5 6L8 10.5 12.5 6" />,
  'arrow-up': <path d="M8 13V3.5M3.5 8L8 3.5 12.5 8" />,
  folder: <path d="M2 4.5c0-.6.4-1 1-1h3.2l1.5 1.5H13c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1v-7.5z" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
}

export const ICON_NAMES: readonly IconName[] = [...(Object.keys(STROKED) as IconName[]), 'more']

export function Icon({ name }: { name: IconName }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false } as const
  if (name === 'more') {
    // Three filled dots read better than stroked rings at this size.
    return (
      <svg {...common} fill="currentColor">
        <circle cx="3" cy="8" r="1.25" />
        <circle cx="8" cy="8" r="1.25" />
        <circle cx="13" cy="8" r="1.25" />
      </svg>
    )
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {STROKED[name]}
    </svg>
  )
}

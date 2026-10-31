# pod-board

## Layout

- Center the main content column in the space beside the sidebar: give it a max-width and `margin-inline: auto`, so the empty space splits evenly on both sides. Never let a capped column hug the left edge with a large empty area on the right.
- Pick the cap by content type: screen 1 uses one shared column as wide as the run flow (about 1120 px max), with text inside cards capped near 72ch; the wave board may use the full width.
- On narrow screens (≤ 820 px), the sidebar stacks above the main column instead of squeezing beside it.
- Sidebar run items are separate cards with a small gap, not one bordered box with divider rows.

## Buttons with icons

- Balance a button on its ink, not its boxes. An icon has empty space inside its box, so measure the visible space on both sides and make it equal.
- Give the icon side less padding than the text side (about 2–4 px less) in a left-aligned button; in a centered button, center the icon and label as one group on their ink.
- Match the icon to the label: 16 px icons with 14 px labels, and a stroke weight close to the label's stem (1.5–2 px at 16 px).
- Keep the visible gap between icon and label at about 6–8 px, counting the icon's own empty space.
- Never use text glyphs (`+`, `⋯`, `↑`) as icons; use SVG icons from the shared set.
- Size inline controls such as breadcrumbs to their text; never give them a fixed min-width that leaves uneven gaps.

## Spacing

- Use a 4/8 px scale for every gap, padding, and margin.
- Keep inside space at or below outside space: rows in a group sit closer than the groups do.
- In a padded box, make horizontal padding larger than vertical (about 12 px by 16 px). Line height already adds vertical air.
- Put status values in a fixed-width, left-aligned column, so their dots line up on one rail.
- Show attributes such as confidence or model as tags or inline text after the title, never in the status column.

# pod-board

## Layout

- Center the main content column in the space beside the sidebar: give it a max-width and `margin-inline: auto`, so the empty space splits evenly on both sides. Never let a capped column hug the left edge with a large empty area on the right.
- Pick the cap by content type: screen 1 uses one shared column as wide as the run flow (about 1120 px max), with text inside cards capped near 72ch; the wave board may use the full width.
- On narrow screens (≤ 820 px), the sidebar stacks above the main column instead of squeezing beside it.
- Sidebar run items are separate cards with a small gap, not one bordered box with divider rows.
- The sidebar is resizable on wider screens (200–400 px, 260 by default, kept per browser); the main column stays centred in the space left, and the page never scrolls sideways. The handle is off where the sidebar stacks.

## Buttons with icons

- Balance a button on its ink, not its boxes. An icon has empty space inside its box, so measure the visible space on both sides and make it equal.
- Give the icon side less padding than the text side (about 2–4 px less) in a left-aligned button; in a centered button, center the icon and label as one group on their ink.
- Match the icon to the label: 16 px icons with 14 px labels, and a stroke weight close to the label's stem (1.5–2 px at 16 px).
- Keep the visible gap between icon and label at about 6–8 px, counting the icon's own empty space.
- Never use text glyphs (`+`, `⋯`, `↑`) as icons; use SVG icons from the shared set.
- Size inline controls such as breadcrumbs to their text; never give them a fixed min-width that leaves uneven gaps.

## Spacing

- Use multiples of 4 px for gaps, padding, and margins; 2 px is allowed only for cell padding inside tight rows.
- Keep inside space at or below outside space: rows in a group sit closer than the groups do.
- In a padded box, make horizontal padding larger than vertical (about 12 px by 16 px). Line height already adds vertical air.
- Put status values in a fixed-width, left-aligned column, so their dots line up on one rail. The column holds the status only (dot and word), so it never wraps.
- Show attributes and figures (confidence, model, minutes, tokens) as tags or inline text after the title, never in the status column.

## UI checks with the mock repo

- `E:\Projects\pod-trial-mock` is a local, fake pod project for browser checks: each plan in its `pod-docs/` shows one flow state (`three-sprints`, `all-done`, `no-sprints`). Edit or add plans freely; it has no remote.
- Run any branch against it, not against the real repos (PowerShell, from the branch's checkout; change the ports to your own):

  ```
  $env:POD_BOARD_CONFIG_DIR='E:\Projects\pod-trial-mock\.board\config'; $env:POD_BOARD_PORTS_DIR='E:\Projects\pod-trial-mock\.board\ports'; $env:POD_BOARD_CLAUDE_DIR='E:\Projects\pod-trial-mock\.board\claude'; $env:POD_BOARD_API_PORT='3200'; $env:POD_BOARD_WEB_PORT='3201'; pnpm dev
  ```

- The mock has no agents and no GitHub PRs, so live engineers, minutes, and PR states don't show there. For those, use fixture copies with fake transcripts in a temp folder.

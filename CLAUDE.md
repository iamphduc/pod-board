# pod-board

## Layout

- Center the main content column in the space beside the sidebar: give it a max-width and `margin-inline: auto`, so the empty space splits evenly on both sides. Never let a capped column hug the left edge with a large empty area on the right.
- Pick the cap by content type: text, forms and cards stay narrow (screen 1 uses 720 px); wide data views (the wave board) may use the full width.
- On narrow screens (≤ 820 px), the sidebar stacks above the main column instead of squeezing beside it.
- Sidebar run items are separate cards with a small gap, not one bordered box with divider rows.

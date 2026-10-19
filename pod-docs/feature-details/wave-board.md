# Wave board

Screen 2. `buildWaveBoard(repo, planSlug, now)` in `packages/web/src/screens/board/board-view.ts` turns one plan into the wave board: one column per wave of the shown sprint, one card per slice, the dependency edges between cards, the critical path, and the counts behind the filter chips. `BoardScreen.tsx` renders it and draws the lines; `geometry.ts` places each line. The logic is pure and tested; the component is glue.

## Routes

The board lives at `#/<repoId>/<plan>/board`, and `#/<repoId>/<plan>/board/<code>` opens slice `<code>` on it (screen 3 adds the engineer view below the board). `parseHash`, `resolveSelection`, and `hashFor` in `packages/web/src/selection.ts` own the rules:

- Segments are URI-encoded. `#/<repoId>/board` is plan `board`'s pipeline, not a board.
- A run with no plan never gets the board view.
- A hash naming no run → the first run's pipeline, even when it asked for a board.
- A `<code>` that isn't on the shown board → the board with no slice open. App passes `slicesOf` (the shown board's codes from `boardSlices`) so this check uses the same board the screen shows.
- The corrected hash replaces the one in the URL, as on screen 1.

The main bar of a run with a plan has two tabs, `Pipeline` and `Wave board`. They're plain links to the two hashes; the current one has `aria-current="page"`.

## Shown sprint

The plan's `currentSprint`, else the last sprint with a doc. No such sprint, or one whose doc has no slices → no columns, and the screen says `Sprint <s> isn't drafted yet.` (or `No sprint with a doc yet.`). Caption: `Sprint i of n · <sprint>`.

**Why the last sprint with a doc:** a finished plan still has a board worth looking at until its run leaves the list.

## Columns and cards

A column's status is the pipeline's slice log status for that wave (`merged PR #N`, `PR #N open`, `running`, `blocked`, `planned`), and each card's `row` is that log's row. The board reuses `buildPipeline`'s log rather than recomputing it, so the two screens never disagree.

**Card state**, first match wins (same order as the pipeline's wave step):

1. `blocked`: `isBlockedSlice`.
2. `needs-you`: a `needsYou` queue item of the plan names the slice, with `sprint:` this sprint or none.
3. `merged`: `isSliceDone`.
4. `running`: status `pushed`, or a running agent whose role is this slice of this sprint.
5. `waiting`.

Each state has a chip and a card edge (`k-you`, `k-run`, `k-bad`, `k-ok`; waiting keeps the default edge), so a state is never shown as text alone.

**Card meta**, unknown parts left out:

| State | Meta |
|-------|------|
| merged | `model · confidence · m min` |
| running | `model · m min` |
| needs-you | `<TYPE>: <body>` of the latest such entry |
| blocked | `<TYPE>: <body>` of the latest pending `BLOCKED` entry naming it, else `status <status>` |
| waiting | `needs <codes>` from Depends on, as written, else the model |

Entry lines are cut to 60 characters, the last one `…`. The body is shown as written, Markdown marks included.

## Edges and the critical path

- **Edges.** One per (dependency, slice) where the dependency is a slice of this board in an earlier wave. Duplicates, the slice itself, a slice of the same or a later wave, and codes not on the board give no edge. `needs …` on a waiting card still lists every code as written.
- **Critical path.** The longest chain along edges, by slice count. A tie goes to the chain whose slices come first in board order (wave, then table order), compared slice by slice from the first. No edges → no critical slices. Its cards get `critical` and its edges draw in `--accent`, thicker, on top of the others.

**Why the accent, not the preview's yellow:** the plan's Look says the critical path is highlighted in the accent, and yellow already means "needs you".

**Why slice count:** the board has no reliable time per slice before it runs; the number of waves a chain forces is what decides when the sprint can finish.

## Lines

`edgePath(from, to, origin)` gives `M x1 y1 C m y1 m y2 x2 y2`: from the right edge of the dependency's card to the left edge of the slice's card, each at its card's middle, relative to the board's top left, with `m` the midpoint and at most one decimal. The SVG sits under the cards and redraws when the board changes, on resize (window and the board's own size), and once `document.fonts.ready` resolves, since a late web font moves the cards.

## Filters and keys

- Chips in the preview's order: needs you, running, waiting, blocked, merged, each with its count over all cards. They're buttons with `aria-pressed`.
- No chip on → every card plain. Otherwise cards whose state isn't on dim in place; lines stay. Counts never change with the filter.
- The set clears when the shown board (repo, plan, sprint) changes (`filterState.forSprint`).
- Cards are focusable buttons: click, Enter, or Space opens `#/…/board/<code>`. Escape anywhere on the board closes the open slice.
- At narrow widths the board keeps its column widths and scrolls sideways inside its own frame; the page itself never scrolls sideways.

## `engineerFor`

Among agents whose `type` ends in `engineer` and whose `roleOf` is this slice of this sprint, the one with the latest `startedAt` (missing counts as oldest; on a tie, the first in the Board's list). None → `undefined`. Screen 3 uses it.

## Watch out

- An entry with a `slice:` but no `sprint:` or `plan:` joins no plan's queue (the run model's rule), so it never makes a card `needs-you`.
- A finished wave with a pending `→ human` note reads `needs-you` on its card, as on the pipeline: `you` beats `done`.

## History

- 2026-10-19: added in sprint board-engineer (slice W1).

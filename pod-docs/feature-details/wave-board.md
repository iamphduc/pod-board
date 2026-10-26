# Wave board

## What it is

Screen 2, at `#/<repoId>/<plan>/board`: one column per wave of the shown sprint, one card per slice with a state chip and edge, grey dependency lines with the critical path in the accent, and filter chips with counts. `#/…/board/<code>` opens a slice and adds the engineer view below (see `engineer-view.md`). Logic lives in `packages/web/src/screens/board/board-view.ts`, line placement in `geometry.ts`, routes in `selection.ts`.

## How it works

- **Shown sprint:** the plan's current sprint, else the last sprint with a doc. No such sprint or no slices → `Sprint <s> isn't drafted yet.` (or `No sprint with a doc yet.`).
- **Columns** take their status from the pipeline's slice log for that wave, and each card's row is that log's row.
- **Card state**, first match: `blocked` → `merged` → `needs-you` (a queue item for the human naming the slice, or its wave's PR waiting on you, see `waitingPrs` in `runs-and-pipeline.md`) → `running` (status `pushed`, or a running engineer for the slice) → `waiting`. Meta: model, confidence, minutes; or the latest entry's text cut to 60 characters, else `PR #N · you merge` (`PR #N · autopilot stopped` on a halted autopilot run, whose wave PR waits on you only then); or `needs <codes>`.
- **Edges:** one per dependency on a slice of this board in an earlier wave. **Critical path:** the longest chain by slice count; a tie goes to the chain whose slices come first in board order.
- **Lines** are SVG curves from the right edge of one card to the left edge of the next, redrawn on board change, resize, and once fonts load.
- **Filters:** chips are toggle buttons; with any on, other cards dim in place, lines stay, and counts never change. The set clears when the shown sprint changes.
- **Keys:** cards are buttons; click, Enter, or Space opens the slice; Escape closes it. At narrow widths the board scrolls sideways inside its frame.
- **Routes:** a hash naming no run → the first run's pipeline; a code not on the board → the board with no slice; the corrected hash replaces the URL.

## Why it's this way

- **Reuse the pipeline's log** rather than recompute: screens 1 and 2 can't disagree.
- **Critical path in the accent**, not the preview's yellow: the plan's Look says accent, and yellow already means "needs you".
- **Slice count, not time:** there's no reliable time per slice before it runs; the number of waves a chain forces decides when the sprint can finish.
- **Last sprint with a doc** when none is current, not an empty screen: a finished plan's board is still worth looking at until its run leaves the list.
- **`merged` beats `needs-you`** on a done card, as on the pipeline. See [decisions.md](../decisions.md#2026-10-19--you-only-on-unfinished-waves).

## Watch out

- An entry with a `slice:` but no `sprint:` or `plan:` joins no plan's queue, so it never makes a card `needs-you`.
- A done slice with a pending `→ human` note reads `merged`; the run still reads `needs you`.
- A card reads `running` from a running engineer only when that engineer's dispatch fields were read (see `engineer-view.md`); otherwise it reads `waiting` while work happens.
- `#/<repoId>/board` is plan `board`'s pipeline, not a board.
- Depends-on values are kept as written: older boards name slices by word, and a dependency may sit in an earlier sprint, so `needs …` can list codes that draw no line.
- Slice codes like `W1` make branch names that differ from wave heads only by case; see [known-issues/branch-names-differ-only-by-case.md](../known-issues/branch-names-differ-only-by-case.md).

## History

- 2026-10-19: added in sprint board-engineer (slice W1).
- 2026-10-19: a done card reads `merged` even with a pending ask for the human (decision "`you` only on unfinished waves", sprint board-engineer wave 2 fix).
- 2026-10-19 · board-read · plan complete; checked in review at 1280 and 375 px (critical path H1 → M1 → T1 on chess-web) · [report](../reports/board-read.html)
- 2026-10-20 · board-read · final review passed at round 5; filter, keys, 375 px, and live card update checked again · [report](../reports/board-read.html)
- 2026-10-21 · merge-actions P1 · the cards of a wave whose PR waits on you read `needs you`, with `PR #N · you merge`.
- 2026-10-26 · fix-autopilot-view · fixed: an autopilot wave's cards read `needs you · PR #N · you merge`; now they read `running` while autopilot merges, and `needs you · PR #N · autopilot stopped` after a halt. Card minutes leave out idle gaps over 10 minutes.

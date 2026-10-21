# Sprint: Board interaction

_From plan: pod-docs/plans/board-feel.md · Slug: board-interaction · Status: archived · Generated: 2026-10-06_

<!-- autopilot-run: started=2026-10-06T11:36:12Z sprints=0 waves=2 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | L1 | Look: `--board-*` tokens, focus ring and icon-button style | board-interaction-L1 | https://github.com/iamphduc/chess-web/pull/52 | done | high | — |
| 1 | R1 | Rules: click-to-move reducer, flip state and orientation math | board-interaction-R1 | https://github.com/iamphduc/chess-web/pull/52 | done | medium | — |
| 1 | T1 | Touch-drag check: HTML5 backend and `react-dnd-multi-backend` at 375 px | board-interaction-T1 | https://github.com/iamphduc/chess-web/pull/52 | done | medium | — |
| 2 | H1 | Highlights (Look A), click and drag wiring, tap-to-move | board-interaction-H1 | https://github.com/iamphduc/chess-web/pull/53 | done | high | L1, R1 |
| 2 | F1 | Flip board UI, player swap, promotion picker, reduced motion | board-interaction-F1 | https://github.com/iamphduc/chess-web/pull/53 | done | medium | L1, R1 |

## Shared contract

## Per-slice detail

## Sprint summary

- **Slice log:**
  - L1: high · test-first yes · runtime focus ring and icon button at desktop and 375 px · 3 NOTEs · time lost none
  - R1: medium · test-first yes · runtime restructured `movePiece` by drag (new actions had no UI yet) · 3 NOTEs + 1 PENDING (solved) · time lost none
  - T1: medium · test-first n/a (research slice) · runtime HTML5 vs `rdndmb-html5-to-touch` under CDP touch at 375 px · 4 NOTEs · time lost none. **Verdict: touch drag fits** — the next sprint needs `react-dnd-multi-backend` + `rdndmb-html5-to-touch` 9.0.0, the `DndProvider options={HTML5toTouch}` swap in `src/index.tsx`, a touch drag preview (`Preview` from `react-dnd-multi-backend`), and select-on-drag-start (`pickUp`, now shipped). Details and the CDP touch script: `pod-docs/research/touch-drag.md`.
  - H1: high · test-first yes · runtime click, drag (page-JS `DataTransfer` and real mouse), full game by taps at 375 px · 5 NOTEs · time lost none
  - F1: medium · test-first yes · runtime flip, moves/promotion/mate flipped, clocks mid-game, 375 px, reduced motion · 5 NOTEs · time lost none
  - Wave fix: none (the picker overhang is the older formula, deferred as PENDING)
  - Stalls: none. Machine: the wave 2 check's dev server was stopped once by Claude Code's low-memory guard and restarted at the human's go-ahead.

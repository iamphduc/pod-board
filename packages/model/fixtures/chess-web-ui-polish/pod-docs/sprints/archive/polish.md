# Sprint: polish

_From plan: pod-docs/plans/ui-polish.md · Slug: polish · Status: active · Generated: 2026-10-20_
<!-- autopilot-run: started=2026-10-20T06:21:43Z sprints=1 waves=3 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | L1 | Look: body text 600, Quicksand 600 file, game-over scrim token | polish-L1 | #88 | merged | medium | — |
| 1 | S1 | Scroll jump: a move never scrolls the page | polish-S1 | #88 | merged | medium | — |
| 1 | E1 | Game end: resign action and how the game ended | polish-E1 | #88 | merged | medium | — |
| 2 | R1 | Resign button with a 3 s Confirm in the Moves card foot | polish-R1 | #89 | merged | medium | L1, E1 |
| 2 | G1 | Game-over card over a dimmed board | polish-G1 | #89 | merged | medium | L1, E1 |
| 3 | P1 | Calmer player cards: color discs, fixed clocks, no out-of-book note | polish-P1 | #90 | merged | medium | L1 |
| 3 | V1 | Review sidebar: key moment, summary, Moves | polish-V1 | #90 | merged | medium | L1 |

## Shared contract

| State | Foot |
|---|---|
| vs Liem, in progress | New game, Resign, Flip board, Sound |
| vs Liem, over | Review game (when `canOpenReview`), New game, Flip board, Sound |
| Two players, clocks not started, not over | Play, New game, Flip board, Sound |
| Two players, clocks running | New game, Resign, Flip board, Sound |
| Two players, over | New game, Flip board, Sound |

## Per-slice detail

## Sprint summary

- **Slice log:**
  - L1: opus · high · test-first yes · runtime body 600 and the 600 font file at 1400/375 · 3 NOTEs · time lost none
  - S1: opus · medium · test-first yes · runtime scrollY before/after moves in every mode at 1400/375, cause proven with scroll-call logs · 1 PENDING (scroll anchoring, fixed in the wave fix) + 5 NOTEs · time lost none
  - E1: opus · medium · test-first yes · runtime fool's mate and a book reply (resign has no UI yet) · 3 NOTEs · time lost none
  - Wave 1 fix: opus · medium · `body { overflow-anchor: none }` · runtime scrollY 231 → 231 at 375 px
  - R1: opus · medium · test-first yes · runtime every foot state at 1400/992/375, resign in both modes · 5 NOTEs · time lost none (one gate-1 exception: `board-review.test.tsx` added to its files)
  - G1: opus · medium · test-first yes · runtime mate, time and New game from the card at 1400/375 · 3 PENDINGs (import cycle queued; stray log outside the repo; features row, updated by the orchestrator) + 4 NOTEs · time lost none
  - P1: opus · medium · test-first yes · runtime both modes, 22 clock ticks, resign and mate with no running clock, 375 px · 1 PENDING (one-line fix in an unowned test helper) + 4 NOTEs · time lost none
  - V1: opus · medium · test-first yes · runtime full review at 1400/992/375 · 3 PENDINGs (docs outside its files, updated by the orchestrator) + 5 NOTEs · time lost one 90 s eval timeout
  - Stalls: none

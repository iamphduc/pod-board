# Sprint: Play Liem on the board

_From plan: pod-docs/plans/play-like-liem.md · Slug: liem-opponent · Status: archived · Generated: 2026-10-09_
<!-- autopilot-run: started=2026-10-10T11:05:00+07:00 sprints=0 waves=1 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | L1 | Look: Liem tokens, self-hosted Quicksand, base control styles | liem-opponent-L1 | merged | done | medium | — |
| 1 | G1 | Board rules for vs-Liem: human color lock, his move, new game | liem-opponent-G1 | merged | done | medium | — |
| 1 | P1 | Lazy books, `Opponent.newGame`, and the opponent loader | liem-opponent-P1 | merged | done | medium | — |
| 1 | C1 | Match state, his turn, and the opponent controller | liem-opponent-C1 | merged | done | medium | — |
| 1 | D1 | GPL-3.0 LICENSE and README credits | liem-opponent-D1 | merged | done | medium | — |
| 2 | U1 | Mode tabs, setup card, and the start/new-game actions | liem-opponent-U1 | merged | done | medium | L1, G1, C1 |
| 2 | U2 | Book note and his card's badge | liem-opponent-U2 | merged | done | medium | L1, G1, C1 |
| 2 | U3 | vs-Liem board layout, opponent wiring, lazy-bundle check, preview smoke | liem-opponent-U3 | merged | done | medium | G1, P1, C1, U1, U2 |

## Shared contract

## Per-slice detail

## Sprint summary

- **Slice log:**
  - L1, G1, P1, C1, D1: opus · medium · test-first yes · runtime wave 1 check (he played 1.Nf3 from book as White, input lock, 2.Nc3 from the engine, two-player mate, Quicksand self-hosted, 375 px) · NOTEs passed to wave 2 · time lost none
  - U1: opus · medium · test-first yes · runtime harness on 3060 (Black flips, tabs, steps, Full) · 7 NOTEs · time lost none
  - U2: opus · medium · test-first yes · runtime harness on 3070 (all note states, badge, 375 px) · 8 NOTEs · time lost none
  - U3: opus · medium · test-first yes · runtime preview on 3080 (all 7 steps both colors, out of book, castling, mate, New game mid-think, two-player recipe, 375 px, lazy load) · 5 NOTEs · time lost about 10 min on browser scripts
  - Wave fix 1 (test-only `match` guard): opus · high · asked for by the human.
  - Wave fix 2 (green `#047A4F`, setup card fits the 312 px board): opus · medium · asked for by the human; the orchestrator widened its breakpoint from 599 to 767 px after measuring 600–767 px.
  - Orchestrator live check: en passant against him, both promotions, the failed state and Try again.
  - Stalls: none (U3 ran about 35 minutes and stayed active).
  - Halts: wave 1 at gate 6 (GPL door, human merged #61); wave 2 at gate 3 (auto mode blocked `gh pr merge`; the human tested, asked for U3 and the fixes, then had #62 merged).

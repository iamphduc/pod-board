# Sprint: Liem's book and move choice

_From plan: pod-docs/plans/play-like-liem.md · Slug: liem-book · Status: archived · Generated: 2026-10-09_
<!-- autopilot-run: started=2026-10-09T17:30:00+07:00 sprints=1 waves=2 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | K1 | Position codec and book format | liem-book-K1 | #59 | merged | medium | — |
| 1 | S1 | Stockfish lite UCI engine behind `MoveEngine` | liem-book-S1 | #59 | merged | medium | — |
| 2 | I1 | Import script, live run, committed books and player entry | liem-book-I1 | #60 | merged | medium | K1 |
| 2 | M1 | His move choice: book, fallback, engine, legality check | liem-book-M1 | #60 | merged | medium | K1, S1 |

## Shared contract

## Per-slice detail

## Sprint summary

- **Slice log:**
  - K1: opus · medium · test-first yes · runtime `position.ts` driven in the dev-server page · 4 NOTEs · time lost none
  - S1: opus · medium · test-first yes · runtime real Stockfish Web Worker in the dev page (start move, mate, promotion, abort, dispose) · 6 NOTEs · time lost one hand-back round for a file outside its ownership
  - I1: opus · medium · test-first yes · runtime live `npm run book:import` against Chess.com and the Lichess FIDE page, then preview smoke · 5 NOTEs · time lost none (import took about 4 min live)
  - M1: opus · medium · test-first yes · runtime real Stockfish in Node through `createOpponent`, 6 plies · 7 NOTEs · time lost none
  - Wave fixes: none. Stalls: none.
  - Wave 2 check: the real opponent with the committed books and the real WASM played 14 legal plies on a 3+2 clock (all book) and on a 90+30 clock (book, then engine).

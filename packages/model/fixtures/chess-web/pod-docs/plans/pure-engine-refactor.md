# Plan: Pure Engine Refactor & Test Suite

_Generated: 2026-06-04 · Status: done · Grilled-with: grill-me_

<!-- autopilot-run: started=2026-06-04T19:01:08Z sprints=6 waves=15 · COMPLETE 2026-06-05 -->

## Goal

## Why

## Scope

## Sprint sequence

| Sprint | Goal | Status | Depends on |
|--------|------|--------|------------|
| engine-foundation | Establish the `GameState` value and a tracer-bullet vertical slice (`legalMoves` + `applyMove` for one quiet move) proving the engine seam end-to-end; stand up the test harness | done | — |
| move-generation | Stateless move generation for all pieces (sliding, knight, pawn), test-first, including the bounds-bug regression | done | engine-foundation |
| king-safety-endgame | Enemy-attack mapping, legal-move filtering for king safety, and checkmate-vs-stalemate detection | done | move-generation |
| special-moves | Castling (rights threaded through `GameState`), en passant (target in `GameState`), promotion (counter quarantined in `GameState`) | done | king-safety-endgame |
| external-anchors | Perft node-count tests (depth 2–3 from start + one tactical position) and a recorded short game replayed move-for-move | done | special-moves |
| cutover-cleanup | Flip `BoardSlice` to the new engine, add thin reducer-wiring tests, smoke-test the running app, delete old singleton state, verify `reset` clears across games | done | external-anchors |

## Key decisions

## Known risks

## Open questions

## Verification

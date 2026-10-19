# Sprint: Move Generation

_From plan: pod-docs/plans/pure-engine-refactor.md · Slug: move-generation · Status: archived · Generated: 2026-06-04_

## Status board

| Wave | Slice | Title | Difficulty | Agent | Branch | PR | Status | Depends on |
|------|-------|-------|------------|-------|--------|----|--------|------------|
| 1 | geometry | Shared piece classification + board-geometry helpers (kind/color, `inBounds`, ray/offset walkers) | 3 | engineer-senior | move-generation-geometry | merged | done | — |
| 2 | sliding | Stateless sliding-piece generator (bishop / rook / queen) with blocker stops | 3 | engineer-senior | move-generation-sliding | merged | done | geometry |
| 2 | knight | Stateless knight generator (eight L-offsets, own-piece blocking) | 2 | engineer-junior | move-generation-knight | merged | done | geometry |
| 2 | king-step | Stateless king single-step generator (eight neighbours; NO castling) | 2 | engineer-junior | move-generation-king-step | merged | done | geometry |
| 2 | pawn | Stateless pawn generator (single/double push, diagonal captures; NO en-passant/promotion) | 3 | engineer-senior | move-generation-pawn | merged | done | geometry |
| 3 | dispatch | Generalize `legalMoves` to a per-kind dispatcher + named bounds-bug regression test | 3 | engineer-senior | move-generation-dispatch | merged | done | sliding, knight, king-step, pawn |

## Per-slice detail

## Field semantics

## Operational notes (carried from engine-foundation)

## Sprint summary

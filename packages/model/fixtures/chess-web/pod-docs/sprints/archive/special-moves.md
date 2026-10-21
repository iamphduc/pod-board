# Sprint: Special Moves

_From plan: pod-docs/plans/pure-engine-refactor.md · Slug: special-moves · Status: archived · Generated: 2026-06-04_

## Status board

| Wave | Slice | Title | Difficulty | Agent | Branch | PR | Status | Depends on |
|------|-------|-------|------------|-------|--------|----|--------|------------|
| 1 | engine-core | Extend `Move` with `promotion`; teach `applyMove` castling/en-passant/promotion bookkeeping + rights maintenance; promotion-id allocator | 5 | engineer-senior | special-moves-engine-core | merged | done | — |
| 2 | castling | Generate rights-/path-/check-gated two-square castling moves in `king.ts` | 4 | engineer-senior | special-moves-castling | merged | done | engine-core |
| 2 | pawn-special | En-passant capture (consume `state.enPassant`) + four-way promotion move generation in `pawn.ts` | 4 | engineer-senior | special-moves-pawn-special | merged | done | engine-core |

## Per-slice detail

## Field semantics

## Why this slicing (two waves, W2 width 2)

## Operational notes (carried from prior sprints)

## Sprint summary

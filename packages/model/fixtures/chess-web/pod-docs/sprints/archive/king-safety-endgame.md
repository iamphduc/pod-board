# Sprint: King Safety & Endgame

_From plan: pod-docs/plans/pure-engine-refactor.md · Slug: king-safety-endgame · Status: archived · Generated: 2026-06-04_

## Status board

| Wave | Slice | Title | Difficulty | Agent | Branch | PR | Status | Depends on |
|------|-------|-------|------------|-------|--------|----|--------|------------|
| 1 | attack-map | Enemy-attack mapping (`isSquareAttacked`), king location + `isInCheck` | 4 | engineer-senior | king-safety-endgame-attack-map | merged | done | — |
| 2 | legal-filter | Filter pseudo-legal moves that leave the mover's own king in check | 4 | engineer-senior | king-safety-endgame-legal-filter | merged | done | attack-map |
| 3 | game-status | Checkmate vs stalemate (and ongoing) detection over all legal moves | 3 | engineer-senior | king-safety-endgame-game-status | merged | done | legal-filter |

## Per-slice detail

## Field semantics

## Why this is three sequential waves (not wider)

## Operational notes (carried from engine-foundation / move-generation)

## Sprint summary

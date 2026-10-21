# Sprint: Cutover & Cleanup

_From plan: pod-docs/plans/pure-engine-refactor.md · Slug: cutover-cleanup · Status: archived · Generated: 2026-06-04_

## Status board

| Wave | Slice | Title | Difficulty | Agent | Branch | PR | Status | Depends on |
|------|-------|-------|------------|-------|--------|----|--------|------------|
| 1 | cutover | Wire `BoardSlice` to the pure engine via a `GameState`↔UI adapter; thin reducer-wiring tests incl. reset-clears-across-games | 5 | engineer-senior | cutover-cleanup-cutover | merged | done | — |
| 2 | cleanup | Delete the legacy singleton engine + the mutable game-state on `pieces/*`; reconcile the promotion-id single-source | 4 | engineer-senior | cutover-cleanup-cleanup | merged | done | cutover |

## Per-slice detail

## Adapter & design notes (for the engineers and the orchestrator)

## Operational constraints

## Sprint summary

# Sprint: Vite switch

_From plan: pod-docs/plans/vite-migration.md · Slug: vite-switch · Status: archived · Generated: 2026-10-04_

<!-- autopilot-run: started=2026-10-04T06:58:18Z sprints=1 waves=3 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | A1 | Replace the `require()` avatar lookup with a static, tested map | vite-switch-A1 | #33 | merged | high | — |
| 2 | V1 | Swap CRA for Vite 8 + Vitest 5 in one `vite.config.ts`; plain `npm install` | vite-switch-V1 | #34 | merged | medium | A1 |
| 3 | D1 | Update `pod-docs/codebase-structure.md` (+ decisions entry) for Vite and the post-cutover engine | vite-switch-D1 | #35 | merged | medium | V1 |

## Shared contract

## Per-slice detail

## Sprint summary

- **Slice log:**
  - A1: high · test-first yes · runtime dev server, both avatars load, Play, no console errors · 0 NOTEs · time lost none
  - V1: medium · test-first partly — one test commit also carried file moves (staging slip, no force-push); the svg-mock test was already green and was proven by mutation · runtime production preview + dev under `/chess-web/`, full playthrough (castle, en passant, promotion, checkmate, reset across two games) · 6 NOTEs (incl. an SVG data-URL inlining regression found and fixed in-slice) · time lost none
  - D1: medium · test-first yes · runtime preview + dev from the new recipe, 32 pieces, e2–e4 drag · 3 NOTEs · time lost none
  - Wave fixes: none. Stalls: none. Orchestrator wave checks: wave 1 dev server on :3001 (port 3000 held by an unrelated app); wave 2 production preview on :3001 with e2–e4 dragged via the browser tool; wave 3 build + tests. Two known issues recorded: `pod-docs/known-issues/windows-server-teardown.md`, `pod-docs/known-issues/browser-smoke-drag.md`.

# Sprint: CI and Pages deploy

_From plan: pod-docs/plans/vite-migration.md · Slug: ci-deploy · Status: archived · Generated: 2026-10-04_

<!-- autopilot-run: started=2026-10-04T23:33:17Z sprints=1 waves=1 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | C1 | GitHub Actions workflow (verify, secrets, Pages deploy); remove `gh-pages`; package becomes ESM | ci-deploy-C1 | #36 | merged | high | — |
| 2 | D1 | Document the CI and deploy; decisions entry; fix the stale `engineAdapter.ts` header | ci-deploy-D1 | #37 | merged | medium | C1 |

## Shared contract

## Per-slice detail

## Sprint summary

- **Slice log:**
  - C1: high · test-first yes · runtime clean `npm ci` + build + preview at `/chess-web/`; real GitHub Actions run on PR #36 (`verify` pass, `secrets` pass, `deploy` skipped) · 4 NOTEs · time lost: first engineer stalled (10 min no output during a mutation check) and was re-dispatched once into the same worktree; the re-dispatch found the leftover mutation in the workflow's deploy `if`, restored it, and kept a real test fix (`f743836`)
  - D1: medium · test-first yes (one test green from the start, proven by a deliberate doc break) · runtime `npm ci` + build + preview at `/chess-web/`, 32 pieces, no console messages · 2 NOTEs · time lost ~5 min (regex escaping in a test)
  - Wave fixes: none. Stalls: 1 (C1, re-dispatched once). CI on both wave PRs: `verify` + `secrets` pass, `deploy` skipped.

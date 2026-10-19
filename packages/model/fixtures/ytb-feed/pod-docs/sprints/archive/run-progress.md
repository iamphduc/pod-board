# Sprint: Run progress

<!-- autopilot-run: started=2026-10-16T00:00:00+07:00 sprints=1 waves=2 -->

_From plan: pod-docs/plans/feed-ux-rework.md · Slug: run-progress · Status: archived · Generated: 2026-10-16_

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | S1 | Run storage: added columns, progress, stop flag, run queries | run-progress-S1 | #9 | merged | medium | — |
| 1 | T1 | Theme tokens: mint and danger button | run-progress-T1 | #9 | merged | medium | — |
| 2 | P1 | Pipeline writes progress and honors Stop; CLI and fake delay | run-progress-P1 | #10 | merged | medium | S1 |
| 2 | W1 | Run page: live progress card, Stop run, result sentence, problems, Recent runs | run-progress-W1 | #10 | merged | medium | S1, T1 |

## Shared contract

| Method, path | Result |
|---|---|
| GET `/status` | Run page. Running (not stale): progress card + Stop run, polling script, and `<noscript><meta http-equiv="refresh" content="5; url=/status"></noscript>`; no bare meta refresh. Otherwise: result card, Run now, Recent runs. |
| GET `/runs/{run_id}/progress` | `200` HTML fragment: the progress card, root element `id="progress-card"` with `data-run-state` = `running`, or `done` for any run that isn't running or is stale. Unknown or non-integer ID → `404`. |
| POST `/runs/{run_id}/stop` | `request_stop`, then `303` to `/status`. Unknown or non-integer ID → `404`. A finished run → `303`, no change. Covered by the existing Host and Origin guard. |
| POST `/run` | Unchanged. |

## Per-slice detail

## Sprint summary

- **Slice log:**
  - S1: opus · medium · test-first partly: `test_old_build_compatible` guards a non-change and can't fail first · runtime: old and new builds on one file, both ways · 6 NOTEs · time lost none
  - T1: sonnet · medium · test-first yes · runtime: `/look` at 1000 and 375 px · 0 NOTEs · time lost none
  - P1: opus · medium · test-first partly: `test_late_stop_is_success` was a regression guard · runtime: a slowed CLI run and a web run stopped from a second process · 8 NOTEs · time lost none
  - W1: opus · medium · test-first yes · runtime: seeded progress and stop in the browser at 1280 and 375 px; JavaScript-off not driven · 3 PENDINGs re-judged to NOTEs, 5 NOTEs · time lost none
  - W2-fix (wave 2 fix): opus · medium · fixed the partly done step showing as "waiting" and a result sentence whose numbers didn't add up · time lost about 4 min on browser batch quoting
  - Orchestrator change before wave 1: the drafted v2 table rebuild (a one-way door) became additive columns, so `SCHEMA_VERSION` stays 1.
  - No stalls.

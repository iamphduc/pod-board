# Plan: YouTube daily digest

_Generated: 2026-10-13 · Status: archived · Grilled-with: grilling (fast)_

## Goal

## Why

## Scope

## Sprint sequence

| Sprint | Goal | Status | Depends on |
|--------|------|--------|------------|
| digest-pipeline | Bootstrap (skeleton, pytest, smoke recipe, CI), then the headless pipeline: channel store, RSS discovery since the last run, transcripts, Haiku summaries saved to SQLite, and a `run` CLI command | done | — |
| feed-web-app | Local FastAPI app in look C: tonight's feed with the 24-hour ruler, past days, channel management, mark read, Run now, and run status | done | digest-pipeline |
| nightly-autopilot | Task Scheduler install and catch-up, held livestreams, long-transcript chunking, clear error states for failed feeds, transcripts and API keys | done | feed-web-app |

## Look

## Key decisions

## Known risks

## Open questions

## Verification

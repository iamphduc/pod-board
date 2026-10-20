# Sprint: feed-web-app

_From plan: pod-docs/plans/youtube-daily-digest.md · Slug: feed-web-app · Status: archived · Generated: 2026-10-13_

<!-- autopilot-run: started=2026-10-13T22:30:00+07:00 sprints=2 waves=5 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | L1 | Look: web shell, design tokens, fonts, base controls, `ytb-feed web` | feed-web-app-L1 | merged | done | medium | — |
| 2 | F1 | Feed pages: tonight, past days, 24-hour ruler, mark read | feed-web-app-F1 | merged | done | medium | L1 |
| 2 | M1 | Channels page: list with status, add, remove | feed-web-app-M1 | merged | done | medium | L1 |
| 2 | R1 | Run now (background, run lock) and run status page | feed-web-app-R1 | merged | done | medium | L1 |

## Shared contract

| Method, path | Owner | Result |
|---|---|---|
| GET `/` | F1 | Today's feed (the local date of `now()` in `tz`) |
| GET `/day/{YYYY-MM-DD}` | F1 | That day's feed. A malformed or impossible date → `404`. Today or a future date → `303` to `/` |
| POST `/videos/{video_id}/read` form `read=1\|0`, `next` | F1 | Sets or clears read, then `303` to `next`. An unknown ID → `404` |
| POST `/day/{YYYY-MM-DD}/read-all` | F1 | Marks that day's visible unread videos read, then `303` back to the day |
| GET `/channels` · POST `/channels` form `channel` · POST `/channels/{channel_id}/remove` | M1 | List · add · remove |
| GET `/status` · POST `/run` | R1 | Last run · start a run |
| GET `/look` | L1 | Style reference page for the tokens and base controls |
| GET `/static/...` | L1 | `theme.css`, fonts, page stylesheets |

## Per-slice detail

## Sprint summary

- **Slice log:**
  - L1: opus · medium · test-first yes · runtime: `/look` in agent-browser at 1280 and 375, plus the guard, port and font checks with curl · time lost: about 5 min on agent-browser hangs (now a known issue)
  - F1: opus · medium · test-first yes · runtime: mark read, past days and mark all read in the browser · time lost: none
  - M1: opus · medium · test-first yes · runtime: add, error and remove in the browser at 1280 and 375 · time lost: none
  - R1: opus · medium · test-first yes · runtime: Run now, running, 409 and failed states in the browser, plus the CLI lock shared with the web app · time lost: none
  - **Wave fixes:**
    - w2: overlapping ruler dots now stack (opus · high)
  - **Stalls:** none

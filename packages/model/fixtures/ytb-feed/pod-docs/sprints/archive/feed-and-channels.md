# Sprint: Feed and channels

<!-- autopilot-run: started=2026-10-16T00:00:00+07:00 sprints=2 waves=4 -->

_From plan: pod-docs/plans/feed-ux-rework.md · Slug: feed-and-channels · Status: archived · Generated: 2026-10-16_

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | D1 | Data: first-read rule, one-channel runs, unread and channel queries | feed-and-channels-D1 | #11 | merged | high | — |
| 2 | F1 | Feed: unread strip, read on open, reworked card | feed-and-channels-F1 | #12 | merged | medium | D1 |
| 2 | C1 | Channels: compact rows, filter, sort, Remove confirm, latest video on add | feed-and-channels-C1 | #12 | merged | medium | D1 |

## Shared contract

| Method, path | Owner | Result |
|---|---|---|
| GET `/videos/{video_id}/open` | F1 | Unknown ID, or a stored URL that isn't `http(s)://` → `404`. Otherwise `set_read(…, True, now)`, then `303` to the stored URL. If the write fails (any `sqlite3.Error`), it logs to stderr and still sends `303` to the stored URL. If even the lookup fails, it sends `303` to `https://www.youtube.com/watch?v=<url-quoted id>`. |
| POST `/unread/read-all` | F1 | Form `before` = UTC ISO start of Today as the page was rendered. Missing or not a timezone-aware ISO time → `400`. Marks visible unread videos with `published_at < min(before, start of today now)` read, then `303` to `/`. Origin guard applies. |
| GET `/channels?q=&sort=` | C1 | Compact list. `q` filters, and `sort` is `name` (default) or `upload`. |
| GET `/channels/{channel_id}/remove` | C1 | Confirm page for an active channel. Unknown or removed → `404` with the existing "isn't on your list" message. |
| POST `/channels/{channel_id}/remove` | C1 | Unchanged. |
| POST `/channels` | C1 | Unchanged errors (`400`, typed value kept). Success → see Latest video on add. |

## Per-slice detail

## Sprint summary

- **Slice log:**
  - D1: opus · high · test-first yes · runtime: `@quiet` first read and a 52-channel CLI loop · 5 NOTEs · time lost: the 50-channel loop took about 3 min (about 3.5 s per CLI start)
  - F1: opus · medium · test-first yes (`test_open_not_found` was green before the route existed, and became a real check after) · runtime: strip, Mark all read, read on open (303), fold and unfold at 1280 and 375 px · 1 PENDING re-judged, 6 NOTEs · time lost none
  - C1: opus · medium · test-first partly: a runner test went red on a `TypeError` · runtime: 50 channels, filter and sort, dialog and no-JavaScript confirm page, one-channel run on add · 2 PENDINGs re-judged, 5 NOTEs · time lost none
  - No wave fix and no stalls.

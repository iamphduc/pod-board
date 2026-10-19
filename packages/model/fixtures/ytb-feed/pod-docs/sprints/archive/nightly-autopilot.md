# Sprint: nightly-autopilot

_From plan: pod-docs/plans/youtube-daily-digest.md · Slug: nightly-autopilot · Status: archived · Generated: 2026-10-13_

<!-- autopilot-run: started=2026-10-13T22:30:00+07:00 sprints=3 waves=6 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | P2 | Pipeline: Data API uploads with RSS fallback, held re-check, `too_long` retry | nightly-autopilot-P2 | merged | done | medium | — |
| 1 | C2 | Chunked summaries for transcripts over 100k tokens | nightly-autopilot-C2 | merged | done | medium | — |
| 1 | K1 | Config run time and time zone, `ytb-feed schedule` for Task Scheduler | nightly-autopilot-K1 | merged | done | medium | — |
| 1 | E1 | Clear error states in the app: reason and fix for runs, channels, videos | nightly-autopilot-E1 | merged | done | medium | — |

## Shared contract

| Status | Change |
|---|---|
| `too_long` | Now means "over the chunking cap" (see C2). It is retried like `transcript_unavailable`: `attempts` goes up by 1 each time a video ends a run `too_long`, and the video is retried while `attempts < 3`. Older `too_long` rows (with `attempts` 0) are retried by this rule. |
| `held` | Re-checked on later runs. A `held` video of an active channel with `published_at >= run.started_at − 14 days` has its ID sent in the same `fetch_details` call as the new IDs. The result is applied in classification order: `live` or `upcoming` keeps it `held` (it isn't saved again or counted); a known duration ≤ 180 s makes it `skipped_short`; otherwise it goes on to transcript → summary. A video missing from the response, with no key, or after a `DetailsError` stays `held`. Older held videos are never re-checked. |

## Per-slice detail

## Sprint summary

- **Slice log:**
  - P2: opus · medium · test-first yes · runtime: fake runs with and without a key, and Run now in the browser · time lost: none
  - C2: opus · medium · test-first yes · runtime: FakeClaude with 1.5M and 3M characters, and a fake CLI run · time lost: about 3 min on a heredoc, plus one BLOCKED resolved inline
  - K1: opus · medium · test-first yes · runtime: `schedule install --dry-run`, the XML loaded into Task Scheduler's parser in memory, `pythonw` runs, and web time zones · time lost: none
  - E1: opus · medium · test-first yes · runtime: failed and warning states in the browser at 1280 and 375 · time lost: none
  - **Wave fixes:** none
  - **Stalls:** none

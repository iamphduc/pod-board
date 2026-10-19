# Sprint: digest-pipeline

_From plan: pod-docs/plans/youtube-daily-digest.md · Slug: digest-pipeline · Status: archived · Generated: 2026-10-13_

<!-- autopilot-run: started=2026-10-13T22:30:00+07:00 sprints=1 waves=3 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | B1 | Bootstrap: Python package, pytest, config, shared types, CI | digest-pipeline-B1 | merged | done | medium | — |
| 2 | S1 | SQLite store: channels, videos, runs, run lock | digest-pipeline-S1 | merged | done | high | B1 |
| 2 | Y1 | YouTube adapters: UULF RSS feeds, channel resolver, video details | digest-pipeline-Y1 | merged | done | medium | B1 |
| 2 | T1 | Transcript fetcher with error mapping | digest-pipeline-T1 | merged | done | high | B1 |
| 2 | C1 | Claude summarizer: prompt, parser, reading time | digest-pipeline-C1 | merged | done | medium | B1 |
| 3 | P1 | Pipeline run + `ytb-feed` CLI (`run`, `channels`, `status`, `videos`, `--fake`) | digest-pipeline-P1 | merged | done | medium | S1, Y1, T1, C1 |

## Shared contract

| Status | Meaning | Retried next run? |
|---|---|---|
| `summarized` | summary, key ideas, reading time stored | no |
| `no_transcript` | captions disabled or none exist (title + link only) | no |
| `transcript_unavailable` | transient transcript failure | yes, while `attempts < 3` |
| `summary_failed` | Claude error or unparseable output | yes, while `attempts < 3` |
| `too_long` | transcript over 100,000 estimated tokens (chunking comes in nightly-autopilot) | no |
| `skipped_short` | duration ≤ 180 s | no |
| `held` | live or upcoming stream (re-check comes in nightly-autopilot) | no (this sprint) |

## Per-slice detail

## Sprint summary

- **Slice log:**
  - B1: opus · medium · test-first yes · runtime: CLI `--version`, bad arguments, `load_settings` · 0 PENDING kept · time lost: none (CI secrets job 403, fixed by the w1 wave fix)
  - S1: opus · high · test-first yes · runtime: two processes contending for the run lock on a real DB file · time lost: none
  - Y1: opus · medium · test-first yes · runtime: live resolver and feed calls; `UULF` feeds 404ed · time lost: none
  - T1: opus · high · test-first yes · runtime: live transcripts from the home PC · time lost: none
  - C1: opus · medium · test-first yes · runtime: the real SDK against a local fake Messages API · time lost: none
  - P1: opus · medium · test-first yes · runtime: every CLI command with `--fake` on a temp DB · time lost: none
  - **Wave fixes:**
    - w1: the gitleaks job lacked `pull-requests: read`
    - w2: switched to the plain `channel_id` feed, dropped `/shorts/` entries, and retried feed 404s (bursts are still open in the queue)
    - w3: CLI output is now UTF-8 on Windows
  - **Stalls:** none

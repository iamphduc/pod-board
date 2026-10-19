# Sprint: Human moves after his book

_From plan: pod-docs/plans/human-style-strength.md · Slug: human-moves · Status: done · Generated: 2026-10-11_
<!-- autopilot-run: started=2026-10-12T06:48:42Z sprints=0 waves=3 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | H1 | Move chooser, material check and step table | human-moves-H1 | #65 | done | medium | — |
| 1 | L1 | Look: neutral "Stockfish" pill style | human-moves-L1 | #65 | done | high | — |
| 2 | E1 | MultiPV engine output, wired into the opponent | human-moves-E1 | #66 | done | medium | H1 |
| 2 | U1 | Stockfish disclosure, "about" labels, README | human-moves-U1 | #66 | done | medium | L1 |
| 3 | K1 | Calibration script, first table values, play check | human-moves-K1 | #67 | done | medium | H1, E1 |

## Shared contract

## Per-slice detail

## Sprint summary

- **Slice log:**
  - H1: opus · medium · test-first yes · runtime unit tests on real `GameState`s (nothing called it yet) · 4 NOTEs · time lost none
  - L1: opus · high · test-first yes · runtime pill injected in the dev page, computed styles read · 2 NOTEs · time lost none
  - E1: opus · medium · test-first partly (the engine tests went red on a TypeError, not an assertion) · runtime preview at 1400 and Full, worker traffic logged · 8 NOTEs · time lost none
  - U1: opus · medium · test-first partly (one guard test was never red) · runtime preview at 1400 and 375 px, in and out of book · 4 NOTEs · time lost none
  - W2-fix: opus · medium · test-first yes · runtime preview at 375, 1000 and 1400 px in every card state · 2 NOTEs · time lost about 10 min measuring the 136 px column
  - K1: opus · medium · test-first yes · runtime four calibration runs (about 46 min) and preview at every step on desktop and 375 px · 4 NOTEs · time lost the long runs; one quiet stretch of about 10 min during a run (not a stall)

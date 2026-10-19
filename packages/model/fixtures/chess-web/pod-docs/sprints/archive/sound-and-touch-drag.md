# Sprint: Sound and touch drag

_From plan: pod-docs/plans/board-feel.md · Slug: sound-and-touch-drag · Status: archived · Generated: 2026-10-06_

<!-- autopilot-run: started=2026-10-06T11:36:12Z sprints=1 waves=3 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | S1 | Move sounds, Sound toggle, and the plan's closing docs | sound-and-touch-drag-S1 | https://github.com/iamphduc/chess-web/pull/54 | done | medium | — |
| 1 | T1 | Touch drag through `react-dnd-multi-backend` | sound-and-touch-drag-T1 | https://github.com/iamphduc/chess-web/pull/54 | done | medium | — |

## Shared contract

## Per-slice detail

## Sprint summary

- **Slice log:**
  - S1: medium · test-first yes · runtime every move kind's `data-last-sound` after a real click, mute across a reload, 375 px row · 5 NOTEs · time lost ~5 min (installing `ffmpeg-static` was denied; the `.ogg` files were converted to `.wav` in the browser)
  - T1: medium · test-first yes · runtime CDP touch drag, tap, scroll and swipe, flipped drag, 800 px preview size, desktop mouse drag · 3 NOTEs · time lost none
  - Wave fix: none
  - Stalls: none

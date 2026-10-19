# Plan: Pod Board, phase 1 — see every run

_Generated: 2026-10-18 · Status: active · Grilled-with: grilling (fast)_

Port base: 3000

<!-- autopilot-run: started=2026-10-19T03:31:01-07:00 sprints=1 waves=0 -->

## Goal
Build a local, read-only web app that shows every pod run across your repos: each run's stage, the current wave's slices, what needs you, and each engineer's live activity. This is phase 1 of [docs/master-plan.md](../../docs/master-plan.md); approvals come in phase 2 (plan `board-actions`).

## Why
- Today a pod run lives in one chat. With several repos running, there's no single place to see what's running, what's blocked, and what's waiting on you.
- pod already writes everything the board needs (`pod-docs/`, Claude Code transcripts, GitHub PRs), so this phase needs no pod change except one small item (see Key decisions).

**Success criteria:**
- With three repos running pod, one browser tab shows each run's stage, the current wave's slices, what needs you, and each engineer's live activity, within 5 seconds of pod writing it.
- The board never breaks a run: it only reads files and calls read-only `gh` commands.
- It works on Windows, macOS, and Linux.

**Constraints:**
- pod must keep working without the board, and the board never writes into a repo.
- Transcripts can contain secrets, so the board never shows raw tool output, file contents, or the assistant's text.

## Scope
**In scope:**
- A pnpm workspace with three packages: `model` (parsers and run model, no I/O), `server`, and `web`.
- The pod-flow parsers copied into `model` with their tests, then extended.
- Run discovery from registered repos (added with "Add repo" in the UI) plus the `<temp>/pod-ports/` claim files.
- File watching, a transcript reader, a cached `gh` reader, and live updates over server-sent events.
- Screen 1: the runs list and the pipeline (rounds, time, cost, per-slice log).
- Screen 2: the wave board, with dependency lines, the critical path, and status filters and counts.
- Screen 3: the engineer view, with branch, files owned, test progress, and a live tool timeline of tool names and short summaries only.
- Empty and error states: a repo on an unsupported docs version, `gh` not logged in, no runs.
- Both themes, layouts that work at 375 px, and a PWA manifest so Chrome or Edge can install it as an app window.
- GitHub Actions CI.

**Out of scope:**
- Any action: merging PRs, answering the queue, copy-the-reply (phase 2, plan `board-actions`).
- The event log mod (layer 2); it's added later, if real use shows Markdown and transcripts are too slow or ambiguous.
- Running or wrapping the `claude` CLI: stepping into an engineer (phase 3) and runs without a chat (phase 4). The server is structured so a process runner can be added later without a rewrite.
- Publishing to npm (planned for phase 2), a desktop wrapper (Tauri or Electron), hosting, multiple users, and editing plans or sprint docs.
- A shared parser package between pod-flow and the board.

This plan is the first of several in a row; see the phases in [docs/master-plan.md](../../docs/master-plan.md).

## Sprint sequence

| Sprint | Goal | Status | Depends on |
|--------|------|--------|------------|
| bootstrap-model | pnpm workspace, CI on three OSes, the pod-flow parsers copied and tested on scrubbed real-run fixtures, the run model (repo → plan → sprints → waves → slices, queue entries, PRs), and the docs-version check | done | — |
| server-runs | Run discovery (registered repos plus claim files), file watcher, transcript reader, cached `gh` reader, server-sent events, and screen 1 (runs list and pipeline) in both themes at 375 px, with the PWA manifest | done | bootstrap-model |
| board-engineer | Screen 2 (wave board with dependency lines, critical path, filters) and screen 3 (engineer view with tool summaries only), plus the empty and error states | done | server-runs |

Status values: `planned` / `active` / `done`. The orchestrator only flips its row's Status — it does not rewrite Goal/Depends-on retroactively.

The `Depends on` column is the **only** cross-sprint dependency signal. Wave ordering and per-slice deps live inside the sprint doc and are opaque from here.

## Look
The approved design in [docs/design/preview.html](../../docs/design/preview.html) ([published preview](https://claude.ai/artifact/H2xCmKqGwKRvvUyqCnx6P8)). The human said: "this is what I want." Build to it; don't propose new directions.
- **Thesis:** a quiet control room. Neutral slate surfaces, one cobalt accent, and state shown by colored chips and card edges, so what needs you stands out at a glance.
- **Palette (light / dark):**
  - bg `#f4f5f8` / `#0f121a` (page background)
  - panel `#ffffff` / `#171b26`, panel-2 `#eef0f5` / `#1e2331`, line `#d9dde7` / `#2c3344`
  - fg `#161a26` / `#e8eaf1` (text), muted `#5d6478` / `#9aa1b4`
  - accent `#2f55d4` / `#7e9bff` (soft `#e4e9fb` / `#232c4d`)
  - ok `#1d8a55` / `#4fc58a` (soft `#dff3e8` / `#173326`), needs you `#b26a00` / `#f0ae47` (soft `#fbefd9` / `#3a2c14`), blocked `#c2373a` / `#f07a7c` (soft `#f9e1e1` / `#3d1d20`), idle `#7a8194` / `#8b92a6` (soft `#eceef3` / `#232836`)
- **Type:** Bricolage Grotesque (display), Instrument Sans (body), JetBrains Mono (codes, numbers, logs), all self-hosted. Body text 16 px. Dense labels (chips, slice codes, timeline rows) keep the preview's smaller sizes, and nothing goes below 12 px.
- **Layout:** screen 1 has the runs list beside the main view (the pipeline); screen 2 is the wave board; screen 3 is the engineer view with a live timeline. At 375 px the runs list stacks above the main view, and the wave board scrolls sideways inside its own frame.
- **Signature detail:** the wave board's dependency lines, with the critical path highlighted in the accent.
- **Rules out:** default browser controls, state shown only as text (each state also gets a chip or card edge), a single theme, generic dashboard templates.
- **Draft:** `docs/design/preview.html` (approved design; no A/B/C draft).

## Key decisions
- **Phase 1 is read-only.** Merging and queue answers wait for phase 2, so the board can't break a run while it's tested on real repos, and the security work for actions gets done properly in its own plan.
- **Markdown and transcripts first; the event log mod comes later.** The fallback path has to exist anyway, and pod-flow already maps sessions to slices from transcripts (`parseDispatch`). This changes the master plan's phase 0 order.
- **Discovery: registered repos plus the `<temp>/pod-ports/` claim files.** Claim files show live runs right away; a full scan of `~/.claude/projects/` is rejected as slow and as touching unrelated projects.
- **Engineer view shows tool names and short summaries only** (for example "Edit `src/x.ts`" or "Bash: `pnpm test` (exit 0)"), never raw output, file contents, or assistant text, because transcripts can hold secrets and masking is never complete.
- **Copy the pod-flow parsers** from `claude-pod/pod-flow/hooks/model.ts` (and `model.test.ts`) into `model`, with a note saying where they came from. A shared package is decided after the formats are tested against real repos.
- **CI in the bootstrap:** typecheck, tests, and build on Windows, macOS, and Linux, plus a secret scan on every PR. Cross-OS is a success criterion, and file watching and paths are where Windows breaks.
- **A local web app, not a desktop app.** A Node server on `127.0.0.1`, opened in the browser, with a PWA manifest for an app window. A Tauri wrapper can come later (tray icon, notifications) without a rewrite.
- **Public repo; scrubbed fixtures.** Test fixtures come from real runs (`chess-web`, `speak-out`, `ytb-feed`, `skyscraper-view`), trimmed to Markdown structure, tool names, and timestamps, with no transcript text.
- **Not published to npm in phase 1.** It runs with `pnpm dev`; `npx pod-board` comes in phase 2.
- **pod-side prerequisite:** before this plan runs, `claude-pod` records `go` and the session id in the plan doc, so the board can show "waiting for go" from disk. The queue answer format waits for phase 2.
- **Security, even read-only:** bind to `127.0.0.1` only and check the `Host` header against DNS rebinding.
- **Config:** registered repos live in `~/.config/pod-board/config.json` (or the OS equivalent), never inside `~/.claude`. (default)
- Name stays "Pod Board". (default)
- TypeScript everywhere, Node 22 or later, pnpm workspace. (default)
- Server: Hono; file watching: chokidar; live updates: server-sent events. (default)
- Web: React + Vite; no database, with state rebuilt from files on start and kept in memory. (default)
- Tests: Vitest for `model` (fixture-driven) and `server`; browser checks with agent-browser. (default)
- The board supports pod docs version 2 and shows "update pod" for any other version. (default)

## Known risks
- **pod's file formats change:** the docs-version check, tolerant parsers (a missing field shows as unknown, never as a crash), and real-run fixtures.
- **Claude Code transcript formats are internal:** read only stable fields (timestamps, tool names, usage), and fail soft.
- **File watching differs across OSes**, especially Windows paths and long worktree paths: the three-OS CI matrix, and chokidar with polling as a fallback.
- **`gh` rate limits and latency:** cache per PR, refresh on file change or every 30 seconds at most, and show the last-checked time.
- **Feature absorption:** Claude Code may add its own multi-agent views. Phase 1 stays pod-specific (waves, the queue, the paper trail).

## Open questions
- Phase 3 route (engineer sessions via `/pod:create-wave-prompts` or Claude Code workflows) and phone notifications are left to after phases 1–2; see the master plan.

## Verification
- With the board running against the four existing pod repos plus one live `/pod:code` run, every number on screen traces to a file or a `gh` call.
- A change pod writes (a slice status, a queue entry, a transcript line) shows on screen within 5 seconds.
- The board writes nothing inside any registered repo: `git status` stays unchanged in each repo after a session.
- The engineer view shows no raw tool output, file contents, or assistant text, checked against a transcript that contains a planted fake secret.
- The server refuses connections not on `127.0.0.1` and requests with a foreign `Host` header.
- CI passes on Windows, macOS, and Linux.
- Both themes and the 375 px layouts match `docs/design/preview.html`.
- Empty and error states render for a repo on an unsupported docs version, `gh` logged out, and no runs.

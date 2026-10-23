# Plan: Pod Board, phase 1 — see every run

_Generated: 2026-10-18 · Status: archived · Grilled-with: grilling (fast)_

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

## Queue log

- `[2026-10-18 · PENDING · engineer → human · plan: board-read · sprint: bootstrap-model · slice: F1]` before the repo goes public: `packages/model/fixtures/speak-out/docs/handoff-queue.md` is about 300 KB, with 233 full queue lines of speak-out's internal notes (some about auth and security). It passes every scrub rule, but the board only needs it to prove "unsupported", so check it or cut it to a sample. **Resolution:** 2026-10-19 — human chose to cut it to a sample; done in the board-engineer wave 2 fix ([decision](decisions.md#2026-10-19--cut-the-speak-out-fixture-to-a-sample))
- `[2026-10-18 · PENDING · engineer → human · plan: board-read · sprint: bootstrap-model · slice: R1]` `currentWave` follows the contract (lowest wave with a slice not `isDone`), so a `done` (archived) sprint with a `skipped` or `blocked` slice still shows a current wave, which would look wrong on the board. No fixture has this today. Option: leave `currentWave` out when the sprint is `done`. Value in use: the contract as written; the next sprint-planner should settle it before screen 1 shows it. **Resolution:** 2026-10-18 — settled in sprint server-runs: the contract leaves `currentWave` out for a `done` sprint (slice M1)
- `[2026-10-18 · PENDING · sprint-planner → human · plan: board-read · sprint: server-runs · slice: L1]` look: the approved light theme fails 4.5:1 contrast for chip text on its soft fills (idle ~3.4:1, needs-you ~3.7:1, ok ~3.8:1, blocked ~4.3:1; dark passes). Value in use: every Look color kept for dots, edges, and fills, plus `--*-ink` tokens for state text: in light the same hue made the smallest amount darker that passes, in dark equal to the base color. Light chip text looks a bit darker than the preview. Side-by-side draft: `pod-docs/design-drafts/chip-contrast.html` (A as built vs B as the preview draws it). Override: change L1's ink rule and its contrast test. **Resolution:** 2026-10-19 — human chose A, the darker ink tokens as built ([decision](decisions.md#2026-10-19--light-chip-text-darker-ink-tokens))
- `[2026-10-18 · PENDING · engineer → human · plan: board-read · sprint: server-runs · slice: P1]` a rule the spec left open: in the run state, `you` beats `done`, so a merged wave with a pending `→ human` queue entry still shows `you`, and its plan shows `needs-you` (today: server-runs wave 1 shows `you` for the chip-contrast entry). Value in use: as planned (`you` wins, so nothing waiting on you is hidden). Alternative: `you` only on unfinished waves, with the plan still `needs-you`. **Resolution:** 2026-10-19 — human chose B, `you` only on unfinished waves; built in the board-engineer wave 2 fix ([decision](decisions.md#2026-10-19--you-only-on-unfinished-waves))
- `[2026-10-18 · PENDING · engineer → human · plan: board-read · sprint: server-runs · slice: A1]` when the board's own `config.json` can't be read, it keeps the last repo list it read (or none) and never overwrites the file, but nothing on screen says the file is broken: the Board contract has no board-level error field. Value in use: silent. Suggest a `configError` on the Board and a banner on screen 1 (fix next). **Resolution:** 2026-10-19 — settled in sprint board-engineer: the contract adds a board-level `configError` and a screen-1 banner (slice X1)
- `[2026-10-19 · PENDING · orchestrator → human · plan: board-read · sprint: board-engineer]` now: `packages/server/src/watcher.test.ts › changes reach clients within 5 seconds (polling)` is still flaky after the server-runs wave 3 fix (#7): it failed once on `verify (ubuntu-latest)` for PR #10 (`expected 2 to be 1`) and passed on re-run. A reproduced test bug, so it gets fixed before the final plan PR (wave 2's wave fix, or the plan fix pass). **Resolution:** 2026-10-19 — fixed: #11 made poll bursts give one rebuild, and #14 capped the rebuild wait and made the real-file test wait out start-up rebuilds; CI passed on all three OSes three times on each
- `[2026-10-19 · BLOCKED · orchestrator → human · plan: board-read · sprint: board-engineer]` gate 3 (auto-merge-fail): wave PR #12 (https://github.com/iamphduc/pod-board/pull/12) fails `verify (ubuntu-latest)` — `watcher.test.ts › changes reach clients within 5 seconds (polling)` → `no matching board event within 5000 ms` — on code this wave's own fix (#11) changed, and the wave fix is spent. Measured on the wave head with a temp repo: steady edits starve updates. Poll mode (`POD_BOARD_POLL=1`, quiet window 800 ms), a status flip every 300 ms for 10 s → 0 board events during the writes; native mode (quiet window 300 ms), a flip every 150 ms for 10 s → 0 events, then one 0.3 s after the writes stop. A single edit arrives in about 1.6 s (poll). An active engineer's transcript changes this often, so the board can freeze while work is happening. Proposed fix: keep the quiet window that groups quick edits, but cap it so a rebuild runs no later than about 1.5–2 s after the first event of a burst, even while events keep coming; prove it with fake timers (events every 400 ms for 6 s in poll mode still rebuild within the cap; a quick burst still gives exactly one rebuild) and keep the real-file test's count and 5 s bound. Options: (A, recommended) approve one more fix engineer on `board-engineer-w2`, then autopilot rechecks #12, merges, and goes on to plan complete; (B) re-run CI and merge, leaving the bug for the final review — it is a reproduced bug, so the final PR would end at "review still failing" (gate 2). Reply in chat; the `board-engineer-w2` worktree, PR #12, and E1/X1 (`pushed`) are kept as they are. **Resolution:** 2026-10-19 — human chose A: one more fix engineer on `board-engineer-w2` ([decision](decisions.md#2026-10-19--fix-live-update-starvation-before-the-final-review))
- `[2026-10-19 · PENDING · reviewer → human · plan: board-read]` now: `AgentRun.description` (the dispatcher's Task description) is served in `/api/board`, though no page shows it. Hardening: drop it from the Board JSON. **Resolution:** 2026-10-19 — taken into the gate 2 fix pass on the human's go-ahead
- `[2026-10-19 · PENDING · reviewer → human · plan: board-read · sprint: server-runs]` before hosting: `board-service.ts` `agentsOf` re-parses every transcript in full on each rebuild (67 MB of transcripts with writes every 300 ms gave up to 1.8 s lag and about 400 MB of API memory). Hardening: cache the parsed run by size and mtime. (Sorted at plan complete, 2026-10-19: Before hosting.) **Resolution:** 2026-10-21 — fixed by #24 (the transcript cache)
- `[2026-10-19 · PENDING · reviewer → human · plan: board-read]` someday: upstream `claude-pod` `parseDispatch` has the same `plan slug` gap as the board's copy; report it upstream. **Resolution:** 2026-10-19 — obsolete: superseded by the round 2 FIX on PR #15 (the loose `plan slug` match reads prose), recorded in the gate 2 entry
- `[2026-10-19 · PENDING · reviewer → human · plan: board-read]` someday: the `Web shell` row in `pod-docs/features.md` still describes the bootstrap page, whose text no longer exists. **Resolution:** 2026-10-19 — fixed: the orchestrator rewrote the row for screen 1
- `[2026-10-19 · PENDING · orchestrator → human · plan: board-read]` plan board-read complete — final PR https://github.com/iamphduc/pod-board/pull/15, review pass at round 5 (after five plan fixes, #16–#20), 6 open entries sorted in the hand-back (Before hosting 1, Someday 5) and 1 default recorded. **Resolution:** 2026-10-21 — final PR merged
- `[2026-10-19 · BLOCKED · orchestrator → human · plan: board-read]` gate 2 (plan-review-fail): PR #15's round 2 review (https://github.com/iamphduc/pod-board/pull/15#issuecomment-6277878634) still has a FIX after the one fix pass. `packages/model/src/dispatch.ts:25` with `pod-flow/model.ts:197-198,204`: `readDispatch` keeps the pod-flow copy's loose `plan slug` match first, and it matches prose, so a reviewer prompt that quotes "`plan slug:` field" reads `plan=field` over its real `- **plan:** board-read` line; reproduced on both round 2 reviewers (the runs list shows `no active plan · idle`, Check `Final review · done · 1 round` while round 2 ran). Fix: a `- **plan:**` list field wins over prose (try it first, or accept `plan slug` only as a list field), with an end-to-end test of that round 2 prompt shape (`plan:'alpha', round:2`, Check `['Final review','live','round 2']`). Not merged; `board-read` and PR #15 are kept. Options: (A, recommended) approve one more fix engineer on `board-read`, then a round 3 review and the merge; (B) merge as is with the bug noted. **Resolution:** 2026-10-19 — human chose A: one more fix, then round 3 ([decision](decisions.md#2026-10-19--one-more-fix-before-the-final-merge))
- `[2026-10-19 · BLOCKED · orchestrator → human · plan: board-read]` gate 2 (plan-review-fail), round 3: PR #15's round 3 review (https://github.com/iamphduc/pod-board/pull/15#issuecomment-6282059365) fixed round 2's bug but found a regression from #17: `packages/model/src/dispatch.ts:15-18,37-39` (`listField`) reads a field only when its name starts a markdown list item, but real pod dispatches also use `sprint slug: X` lines, `- sprint slug: X · slice code: Y · branch name: Z` items, and `**sprint slug:** X` lines. Over 444 real `pod:*` transcripts, 107 read differently from before #17, only 3 intended: 67 engineers lose slice and branch (24 lose sprint too), 9 reviewers and reporters lose a correct plan, 17 reviewers lose `round`, 12 planners lose a prose plan. Live repro: a running ytb-feed engineer shows as `waiting`, `running 0`, and "No engineer has started on this slice yet." Fix: a field counts when its name starts a line, a list item, or a `·`-separated part, with or without `**`; never mid-sentence or inside backticks; the value stops before a trailing dot or a `/` path; tests for each real shape end to end, plus a regression check that compares field reads on all real transcripts before and after. Not merged; `board-read` and PR #15 are kept. **Resolution:** 2026-10-19 — human chose A: one more fix with a corpus check, then round 4 ([decision](decisions.md#2026-10-19--fix-the-dispatch-field-regression-with-a-corpus-check))
- `[2026-10-19 · BLOCKED · orchestrator → human · plan: board-read]` gate 2 (plan-review-fail), round 4: PR #15's round 4 review (https://github.com/iamphduc/pod-board/pull/15#issuecomment-6284211875) confirmed #18 (corpus re-run matches; all feature rows pass) but found one FIX: `packages/model/src/dispatch.ts:59` doesn't treat a Windows drive path as a path, so `Plan: E:/…/plans/x.md` reads `plan: "E"` and, since the first match wins, a planner shows `not drafted` and a reviewer's plan drops out of the runs list. Fix: a value followed by `:` and then `/` or `\` is a path and gives nothing; tests through `readDispatch` and `listRuns`/`isDrafting`. Not merged; `board-read` and PR #15 are kept. **Resolution:** 2026-10-19 — human chose A: one last fix with a corpus check, then round 5 ([decision](decisions.md#2026-10-19--one-last-fix-drive-paths-and-fenced-blocks))
- `[2026-10-19 · PENDING · reviewer → human · plan: board-read]` now (product choice): chess-web's `ui-refresh` orchestrator wrote its own engineer dispatch shape (``Build slice R1 of sprint `refresh` (plan `ui-refresh`)``, `- Slice: R1, branch `refresh-R1``), so all 11 of its engineers read no fields and the run shows `idle`. Not caused by #18 (5d785be read nothing either). pod's `agents/engineer.md` names the fields `sprint slug`, `slice code`, `branch name`. Decide whether the board reads that shape too. **Resolution:** 2026-10-20 — default recorded: the board reads only pod's field names ([decision](decisions.md#2026-10-20--engineer-dispatch-fields-pods-names-only-agent-default--override-anytime)); override anytime
- `[2026-10-19 · PENDING · reviewer → human · plan: board-read]` now: fenced code blocks aren't blanked before reading dispatch fields (only inline backticks are, `dispatch.ts:20`), so a made-up fence with `plan: beta` before the real fields reads `beta`. No real prompt does this (0 of about 960 matches). **Resolution:** 2026-10-19 — taken into the round 4 fix on the human's go-ahead
- `[2026-10-19 · PENDING · orchestrator → human · plan: board-read]` now: `packages/server/src/watcher.test.ts › changes reach clients within 5 seconds` (native mode) failed on `verify (ubuntu-latest)` for PR #19 (`expected 2 to be 1`, run 39380623077 attempt 1) and passed on re-run — after #11 and #14 fixed the poll-mode flake. A reproduced test bug, so it is fixed before the final merge. **Resolution:** 2026-10-20 — fixed in #20: the cause (a CI runner pausing 300 ms or more between the test's writes, so two boards is correct) was reproduced on Linux; the exact count moved to deterministic fake-watch tests; CI passed on all three OSes five times
- `[2026-10-20 · PENDING · orchestrator → human · plan: board-read]` now (bug, found after the merge to pod-staging): a run in its close-out shows as `no active plan · idle`. pod archives the plan (`Status: archived`) before the final merge, and `listRuns` drops archived plans unless a hand-back is pending, which is written only after the reporter finishes. A live claim file (`<temp>/pod-ports/<B>`, `<repo> <plan>`) does not keep the plan listed. Repro: chess-web `ui-polish` (claim 3200, plan archived, sprint `polish` done, a `pod:reporter` writing now) shows idle; `board-read` did the same during its own close-out. Also the reporter reads no plan from its dispatch. Fix: a live claim keeps its plan listed as a run even when archived (shown as closing out, or final PR once the hand-back exists), and read the reporter's plan; tests on chess-web's real files. Human chose option A pending a /compact: fix with /pod:fix off `pod-staging` before merging PR #21. **Resolution:** 2026-10-20 — fixed in https://github.com/iamphduc/pod-board/pull/22
- `[2026-10-20 · PENDING · reviewer → human · plan: board-read]` someday: during the close-out and the final review, the Ship step reads `Final PR · not open yet` (`pipeline.ts` `shipStep`), though pod opens the final PR at plan-complete step 1 and the reporter's dispatch carries its URL. Needs a new data source or different wording. **Resolution:** 2026-10-21 — the board asks `gh` for a PR on head branch `<plan-slug>` while the plan is in its final review or close-out with no hand-back, and Ship shows it: `PR #N · after review` while open, `merged PR #N`, or `PR #N · closed`; the hand-back's PR still wins once it exists (fix-final-pr-early).

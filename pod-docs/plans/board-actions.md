# Plan: Pod Board, phase 2 — approve from the board

_Generated: 2026-10-21 · Status: active · Grilled-with: pod (fast)_

Port base: 3000

<!-- autopilot-run: started=2026-10-21T20:11:07-07:00 sprints=1 waves=2 -->


## Goal
Let the human do pod's hand-offs from the board instead of the chat: merge a PR that waits on them, answer a `PENDING` or resolve a `BLOCKED` queue entry, and send `continue` or `go` to the run. `continue` can be sent automatically per run with a toggle; `go` only by pressing a button. This is phase 2 of [docs/master-plan.md](../../docs/master-plan.md), plus the resume step the master plan had put in phase 4.

## Why
- Approvals need the chat open today. With several repos running, the board already shows what needs you but can't act on it.
- Every action must do exactly what the human would do by hand, so pod picks it up the same way and the board never breaks a run.

**Success criteria:**
- In a scratch repo running `/pod:code`, the human merges a wave PR and answers a `PENDING` from the board, and the next wave starts with that answer in use.
- With the run's Continue toggle on, the run continues after a wave PR merges with no one typing in the chat. With it off, nothing is sent until the human presses Continue.
- `go` is never sent unless the human presses Go.
- No other website can trigger an action: requests without the per-launch token, or with a wrong `Host` or `Origin`, are refused.

**Constraints:**
- pod keeps working without the board. The board writes only one file in a repo: that repo's `pod-docs/handoff-queue.md`, and only an answer line on an existing entry.
- Transcripts can contain secrets: the phase 1 display rules stay (tool names and short summaries only, no prompt text).
- Resuming uses the human's own `claude` login, never an API key or `--bare`.
- Works on Windows, macOS, and Linux.

## Scope
**In scope:**
- **Security for actions:** a per-launch token embedded in the page and sent in a request header (never a cookie or query string), plus `Host` and `Origin` checks on every action. A missing `Origin` on a POST is refused, actions need a JSON content type, and every check fails closed. The 127.0.0.1 binding stays.
- **Merge a PR:** any PR the board shows as waiting on the human (a wave PR, a `/pod:fix` PR, or the final plan PR). A confirm step shows CI status, mergeability, and the head commit, then runs `gh pr merge <url> --merge --match-head-commit <sha>` (merge commit, never squash). Afterwards the board reads the PR again and shows what GitHub reports (`merged`, `queued`, or `auto-merge on`) or gh's error text. It never says merged before GitHub does.
- **Answer the queue:** a form on a `PENDING` or `BLOCKED` entry that writes the human's answer to that entry in pod's answer format (`**Answer (human):**`).
- **Copy-the-reply:** for a run waiting on `continue`, `go`, or `try`, the exact reply with a copy button and the chat to paste it in: the orchestrator session, found from its transcripts (session id, start time, repo) with a `claude --resume <id>` hint. This stays as the fallback when resuming isn't possible.
- **Resume a run:**
  - A **Continue toggle** per run, off by default. On: whenever pod waits only for `continue` (a merged wave PR, a finished sprint), the board resumes the orchestrator session with `continue`. Off: a **Continue** button sends it once.
  - A **Go** button on a plan whose sprints haven't started. It sends `go` only when pressed; the toggle never sends `go`, `try`, or a queue answer.
  - Each resume shows its result: the session started again, or the error.
- **Action log:** every action (including each automatic `continue`), its result, and its time, kept in the board's config folder and shown in the UI.

**Out of scope:**
- Publishing to npm (`decisions.md` 2026-10-21): the board keeps running from the repo.
- Inferring "waiting for `go`" from transcripts, or sending `go` without a button press.
- Starting a new run from the board (`/pod:plan`, `/pod:autopilot`).
- Editing plans, sprint docs, or any other file in a repo.
- Engineer sessions and phone notifications: phase 3.
- Hosting, multiple users, a desktop wrapper.
- The pod-side answer format itself. It's a claude-pod change (see Key decisions), built there, not in this plan.

## Sprint sequence

| Sprint | Goal | Status | Depends on |
|--------|------|--------|------------|
| merge-actions | Action security (token, Host and Origin checks), the action log, and merging any PR that waits on the human, with a confirm step and the real result after | done | — |
| queue-and-replies | Answer a `PENDING` or `BLOCKED` in pod's answer format, and copy-the-reply with the chat to paste it in | planned | merge-actions |
| resume-runs | Resume the orchestrator session from the board: the per-run Continue toggle, the Continue and Go buttons, and their results in the action log. Starts with a spike on headless resume | planned | queue-and-replies |

Status values: `planned` / `active` / `done`. The orchestrator only flips its row's Status — it does not rewrite Goal/Depends-on retroactively.

The `Depends on` column is the **only** cross-sprint dependency signal. Wave ordering and per-slice deps live inside the sprint doc and are opaque from here.

## Look
The approved design from phase 1: [docs/design/preview.html](../../docs/design/preview.html) ([published preview](https://claude.ai/artifact/H2xCmKqGwKRvvUyqCnx6P8)). The human chose to keep it for the new controls; don't propose new directions.
- **Thesis:** a quiet control room. Neutral slate surfaces, one cobalt accent, and state shown by colored chips and card edges, so what needs you stands out at a glance.
- **Palette (light / dark):**
  - bg `#f4f5f8` / `#0f121a` (page background)
  - panel `#ffffff` / `#171b26`, panel-2 `#eef0f5` / `#1e2331`, line `#d9dde7` / `#2c3344`
  - fg `#161a26` / `#e8eaf1` (text), muted `#5d6478` / `#9aa1b4`
  - accent `#2f55d4` / `#7e9bff` (soft `#e4e9fb` / `#232c4d`)
  - ok `#1d8a55` / `#4fc58a` (soft `#dff3e8` / `#173326`), needs you `#b26a00` / `#f0ae47` (soft `#fbefd9` / `#3a2c14`), blocked `#c2373a` / `#f07a7c` (soft `#f9e1e1` / `#3d1d20`), idle `#7a8194` / `#8b92a6` (soft `#eceef3` / `#232836`)
- **Type:** Bricolage Grotesque (display), Instrument Sans (body), JetBrains Mono (codes, numbers, logs), all self-hosted. Body text 16 px; dense labels keep the preview's smaller sizes, never below 12 px.
- **Layout:** as phase 1. The merge confirm and the answer form open in place, next to the PR or entry they act on, not in a page-wide modal. The Continue toggle sits in the run's header next to its state chip, and shows its state in form (a switch with an `auto-continue` label), not only by color. The action log is a quiet list, like Other activity. At 375 px everything stacks, and buttons stay at least 44 px tall.
- **Signature detail:** the wave board's dependency lines, with the critical path in the accent (unchanged).
- **Rules out:** default browser controls, state shown only as text, a single theme, generic dashboard templates, and red or flashy "danger" styling on the merge button (the confirm step carries the weight).
- **Draft:** `docs/design/preview.html` (approved design; no A/B/C draft).

## Key decisions
- **Merge any PR that waits on the human:** wave, fix, and final plan PRs. Each is what the human merges by hand today. (Human's choice.)
- **Show GitHub's real result:** after `gh pr merge`, the board reads the PR again and shows `merged`, `queued`, or `auto-merge on`, or gh's error. `--match-head-commit` merges only the commit the human saw. A repo with a merge queue may only enqueue the PR, and gh 2.92.0 has a reported bug when the queue is set by a ruleset and auto-merge is off ([research](../research/board-actions.md)). (Human's choice.)
- **Action security adds an `Origin` check:** the master plan had a token and a `Host` check. A 2026 advisory for a localhost server with write tools showed that a `Host` check alone isn't enough ([research](../research/board-actions.md)). Chrome's Local Network Access prompt doesn't protect the board's own page and isn't relied on.
- **pod-side prerequisite: the queue answer format.** Before sprint `queue-and-replies` runs, `claude-pod` defines `**Answer (human):**` on a queue entry and makes `/pod:code` and `/pod:autopilot` read it the same as a chat answer (master plan phase 0, item 2). This is built in claude-pod, not here. (Human's choice.) Without it, that sprint halts at its first wave.
- **No npm publishing** ([decisions.md](../decisions.md#2026-10-21--no-npm-publishing)): the repo is private and the board has one user. This changes the master plan's phase 2. (Human's choice.)
- **A Continue toggle per run, off by default** ([decisions.md](../decisions.md#2026-10-21--a-continue-toggle-per-run)): this brings the master plan's phase 4 resume step forward, limited to `continue`. (Human's choice.)
- **`go` only from a button** ([decisions.md](../decisions.md#2026-10-21--go-only-from-a-button)): the board never guesses that a run waits for `go` and never sends it on its own. (Human's choice.)
- **`resume-runs` starts with a spike, and halts if it fails:** confirm that `claude -p --resume <session> "continue"` with the human's own login works on all three platforms, that Anthropic's current rules allow it, and what happens when the same session is also open in a terminal. A failed spike leaves copy-the-reply as the way to continue. (default)
- **The chat to resume comes from transcripts:** pod doesn't record `go` or the session id in the plan doc yet (see `decisions.md` 2026-10-18). The board already maps subagents to their parent session, so it names the orchestrator session itself. It shows the session id and start time, never the prompt text. (default)
- **The board writes only the queue file:** this changes phase 1's "never writes into a repo" rule. The write appends one answer line to an existing entry. It reads the file again just before writing, refuses if the entry changed since it was shown, and writes the file atomically. Path: exactly `<registered repo>/pod-docs/handoff-queue.md`, resolved and checked against the repo root. (default)
- **The token goes in a request header, not a cookie or query string,** and actions need `Content-Type: application/json`. (default)
- **The action log and the toggles live in the board's config folder** (next to `config.json`), so they survive a restart and never reach a repo. The log is one JSON line per action. (default)
- **Look: keep the approved phase 1 look.** (Human's choice.)
- **Merge target:** `pod-staging`, as in `decisions.md` 2026-10-18.

## Known risks
- **Resuming a session that's also open in a terminal:** two processes on one session could split the conversation, and the terminal won't show what the board sent. Mitigation: the spike finds out what Claude Code does; if it's unsafe, the board resumes only when the session isn't running, or the sprint halts and copy-the-reply stays.
- **Anthropic's rules for headless use change:** they changed three times in 2026. Mitigation: the spike checks the current rules first; the board only runs the human's own `claude` binary with their own login.
- **A wrong "waiting for `continue`" read sends `continue` too early:** the run moves on before the human looked. Mitigation: the toggle is off by default, the board sends `continue` only on clear disk signals (a merged wave PR with the hand-back waiting, a finished sprint), never on a guess, and every send is in the action log.
- **pod and the board write the queue at the same time:** a lost write. Mitigation: re-read just before writing, append only to the target entry, refuse when it changed, and write atomically.
- **The pod-side answer format isn't merged when sprint 2 starts:** that sprint can't be verified end to end. Mitigation: it's listed as a prerequisite, and the sprint halts instead of guessing a format.
- **Merge queues and the gh 2.92.0 bug:** the merge may only enqueue, or fail. Mitigation: show the real result or gh's error; never claim merged.
- **A local server that can merge PRs and resume sessions is a target:** mitigated by the 127.0.0.1 binding, the `Host` and `Origin` checks, the header token, JSON-only actions, and failing closed. Tests cover each refusal.

## Open questions
- Does a repo that disallows merge commits make `gh pr merge --merge` fail with a clear error? Not confirmed by research. The board shows gh's error either way.
- Which disk signals mean "waiting only for `continue`" for each pod stop (wave PR merged, sprint complete, plan merged)? The sprint planner maps each to a rule; any stop without a clear signal gets no automatic `continue`.

## Verification
- In a scratch repo running `/pod:code`, merge a wave PR from the board: the PR merges with a merge commit, the action log shows it, and `/pod:code` continues on its next resume.
- In the same run, answer a `PENDING` from the board: the entry gains a `**Answer (human):**` line, and the next wave uses that answer.
- With the run's Continue toggle on, the next wave starts after the merge with no one typing in the chat, and the action log shows the automatic `continue`. With it off, nothing is sent until Continue is pressed.
- The board never sends `go` without a press of Go, with the toggle on or off; a test covers it.
- Copy-the-reply shows the exact reply and the session to paste it in, and copying works.
- A merge on a PR whose head moved after the confirm step is refused (`--match-head-commit`), and the board says why.
- Requests with no token, a wrong token, a wrong `Host`, a wrong or missing `Origin`, or a non-JSON body are refused, with a test for each.
- After a session of actions, `git status` in each registered repo shows only the queue lines the human wrote.
- `pnpm verify` passes, and the phase 1 browser rows in `pod-docs/features.md` still pass.

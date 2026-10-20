# Decisions

_Shared: you and the agents both write here, and agents must follow what it says._

> Stub — authoritative architectural decisions for your project. One entry per decision; agents link here from `handoff-queue.md` Resolution lines.

<!-- ## YYYY-MM-DD — <title>
Context: <why this came up>
Decision: <what was decided>
Consequences: <trade-offs, follow-ups> -->

## 2026-10-18 — merge target: staging
Context: `/pod:autopilot` merges unattended, and the human doesn't want commits on `main` without asking.
Decision: autopilot merges land on `pod-staging`. The human moves them to `main` after looking.
Consequences: the final plan PR targets `pod-staging`; at plan end autopilot opens a `pod-staging` → `main` PR and never merges it.

## 2026-10-18 — browser: agent-browser
Context: preflight browser check.
Decision: `agent-browser` 0.39.0 is installed; agents check pages with it.
Consequences: none.

## 2026-10-18 — run board-read before the pod-side `go` prerequisite
Context: the plan lists a claude-pod change (record `go` and the session id in the plan doc) as a prerequisite. It isn't in claude-pod yet.
Decision: proceed. The board shows "waiting for go" as unknown until pod records it.
Consequences: a follow-up in claude-pod; the parser must tolerate the field being absent.

## 2026-10-18 — repo stays private for now
Context: the plan says "Public repo; scrubbed fixtures". `/pod:init` created `iamphduc/pod-board` as private.
Decision: keep it private until the human checks the fixtures, then make it public.
Consequences: fixtures must still be scrubbed as if public.

## 2026-10-19 — light chip text: darker ink tokens
Context: the approved light theme's chip text fails 4.5:1 on its soft fills (queue entry from sprint server-runs, slice L1; draft `pod-docs/design-drafts/chip-contrast.html`).
Decision: keep option A as built: light chip text uses the `--*-ink` tokens (the same hue, darkened only enough to pass); dots, card edges, and fills keep the Look's colors. Dark is unchanged.
Consequences: light chip text is slightly darker than the preview; `tokens.test.ts` keeps the 4.5:1 check.

## 2026-10-19 — `you` only on unfinished waves
Context: a merged wave with a pending `→ human` queue entry showed `you`, so finished waves looked unfinished (queue entry from sprint server-runs, slice P1).
Decision: a wave step, or a slice card, that is done shows `done`, even with a pending entry for the human. `you` applies only to waves and slices not yet done. The run and the plan still show `needs-you` while any entry needs the human.
Consequences: nothing waiting on the human is hidden at the plan level; finished work reads as finished.

## 2026-10-19 — cut the speak-out fixture to a sample
Context: `packages/model/fixtures/speak-out/docs/handoff-queue.md` held about 300 KB of speak-out's internal notes, some about auth and security (queue entry from sprint bootstrap-model, slice F1).
Decision: cut it to a short sample; the board only needs it to prove the old layout reads as unsupported.
Consequences: the repo can go public without that text in the current tree (it stays in git history unless rewritten).

## 2026-10-19 — fix live-update starvation before the final review
Context: gate 3 on PR #12: steady edits (every 300 ms poll, every 150 ms native) gave no board events while they continued.
Decision: option A: one more fix engineer on `board-engineer-w2` caps the wait so a rebuild runs within about 1.5–2 s of a burst's first event, while still grouping quick edits.
Consequences: autopilot resumes after the fix merges into PR #12.

## 2026-10-19 — one more fix before the final merge
Context: gate 2 on PR #15: round 2 found that the loose `plan slug` match reads prose, so a reviewer prompt quoting "`plan slug:` field" reads `plan=field`.
Decision: option A: one more fix engineer on `board-read`, then a round 3 review, and merge only when everything checks out. The fix also drops the dispatch `description` from `/api/board` (the reviewer's "now" hardening item).
Consequences: autopilot resumes; the final merge waits for a passing round 3.

## 2026-10-19 — fix the dispatch-field regression, with a corpus check
Context: round 3 on PR #15 found that #17 reads dispatch fields only from dash-list items, so 104 of 444 real pod transcripts lost fields they read before (engineers show as not started).
Decision: option A: one more fix. A field counts when its name starts a line, a list item, or a `·`-separated part, with or without bold; never mid-sentence or inside backticks. Before it is accepted, every real `pod:*` transcript on this machine is read before (#17's parent, 5d785be) and after, and every change must be explained as intended. Then a round 4 review.
Consequences: autopilot resumes; the merge waits for a passing round 4.

## 2026-10-19 — one last fix: drive paths and fenced blocks
Context: round 4 on PR #15 found that `Plan: E:/…/plans/x.md` reads `plan: "E"` (a drive letter isn't treated as a path), and that fenced code blocks aren't skipped like inline backticks.
Decision: option A: one more small fix for both, with the same corpus check against the current reader, then round 5 and the merge.
Consequences: chess-web's own engineer prompt shape stays unread for now (a separate product choice, still in the queue).

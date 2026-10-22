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

## 2026-10-20 — engineer dispatch fields: pod's names only (agent default — override anytime)
Context: chess-web's `ui-refresh` orchestrator wrote its own engineer prompt shape (``Build slice R1 of sprint `refresh` (plan `ui-refresh`)``, `- Slice: R1, branch `refresh-R1``), so the board reads no fields for its 11 engineers and the run shows `idle` (round 4 and 5 reviews on PR #15).
Decision: the board reads only the field names pod's `agents/engineer.md` defines (`sprint slug`, `slice code`, `branch name`, plus the plan fields). Hand-written shapes aren't guessed.
Consequences: runs dispatched in another shape show their engineers as not started. To change it, add that shape to `packages/model/src/dispatch.ts` with a corpus check, or fix the dispatching side to use pod's names.

## 2026-10-20 — fix runs on the board
Context: the board built runs only from plan docs, so a `/pod:fix` run was invisible: its repo read `no active plan · idle` while the fix engineer worked. Agents tied to no plan (researchers, scouts, stray engineers) showed nowhere. The human approved this design.
Decision:
- **Fix runs are runs.** A claim `<repo> fix-<slug>` whose name matches no plan doc is a fix run, in the same runs list with a `fix` tag chip and the row text `fix · <slug> · <where>`, where `<where>` is `build`, `review`, `fix pass`, `review round 2`, or `PR`. A claim that matches a plan keeps the plan behaviour; a claim not named `fix-…` stays ignored.
- **State**, first match: an agent of the run running → `running`; its PR open and reviewed (the run's agent that wrote last is a reviewer that ended; last write, not start, because an engineer continued for the fix pass keeps its first start) → `needs-you`; else `idle`. An open PR whose review hasn't run since the last engineer or fix pass reads where `review`, state `idle`, and Ship `PR #N · after review`: the PR isn't the human's to merge until the review is done (round 1 review fix, like a plan's final PR waiting for its hand-back).
- **Pipeline**: Build (Engineer, Fix pass), Review (Round 1, Round 2), Ship (the PR found by head branch `fix-<slug>` through the cached `gh` reader: `after review`, `you merge`, `merged`, or `closed`). A closed PR found by branch is asked about again every 30 s while the claim lasts, so a reopen or a new PR shows; only `merged` is final. An agent log (role, round, start → end, state) replaces the slice log; each engineer opens the engineer view at `#/<repoId>/fix-<slug>/agent/<id>`. No wave board tab.
- **Matching**: engineers by their dispatch `branch` field; reviewers by `kind: fix` plus the `branch` field or the PR number from a `PR URL`/`PR` field. Fields only, as in `dispatch.ts`: prose such as `Review PR <url>, branch …` is not read (the 2026-10-20 "pod's names only" default). An engineer that started after the first review is the fix pass; a reviewer's round is its `round` field, else 2 after a fix pass, else 1.
- **Lifecycle**: listed while its claim exists; off the list when the claim is gone, or when its PR merged and none of its agents wrote in the last 30 minutes (`STALE_MS`, as for a close-out). No "recent" row.
- **Title line**: the slug only, not the engineer's task text. The task text is orchestrator-written prompt text that often quotes findings, paths, and pasted output; the board serves no prompt text (`AgentRun` holds none, and the "Engineer view shows no secrets" row plants a secret in the prompt). The human can ask for a safe task line later.
- **Other activity**: agents tied to no run (not an agent of any plan in the repo, not one of a listed fix run's) show in a quiet strip on the repo's view: role, one dispatch field (branch, else plan, else sprint), the last write's time, and a state chip. Only those that wrote in the last 2 hours, the newest 8. It counts as no run and no `needs you`.
- The human's main-session chat isn't read.
- **Continued agents** (round 2 review fix): pod's `/pod:fix` sends the fix pass and round 2 to the same agents with SendMessage. An agent reads `ended` only when its last hand-back comes after its last prompt, and each coordinator resume starts a new turn, so the resumed engineer is the fix pass and the resumed reviewer is round 2, each with its own times.
Consequences: fix reviewers dispatched only in prose (ytb-feed's `kind: fix. Review PR <url>, branch …` shape, the live `fix-feed-infinite-scroll` one included) don't join their run: the Review step reads `not started` and they show under Other activity. Writing `PR:` and `Branch:` as fields (as chess-web's and pod-board's fix reviews do) fixes it. A fix run's agents show under Other activity for 2 hours after its claim goes.

## 2026-10-21 — find a plan's final PR by its branch, any base (agent default — override anytime)
Context: pod opens the final PR at plan-complete step 1, before it writes the hand-back, so Ship read `Final PR · not open yet` through the final review and the report. A plan doc doesn't record its merge-target, and real final PRs target different bases: chess-web's `ui-polish` → `ui-polish-staging` (#91), pod-board's `board-read` → `pod-staging` (#15).
Decision: before the hand-back, the final PR is any PR whose head is `<plan-slug>`, whatever its base: the open one, else the newest (the fix runs' `gh pr list --head` rule). The board asks only for plans in their final review or close-out with no pending hand-back: an archived or `done` plan while a claim names it, or any other plan with every sprint done. Open reads `PR #N · after review` (wait), merged `merged PR #N`, closed `PR #N · closed` (blocked). Once the hand-back exists, its PR wins.
Consequences: an older PR from a reused plan slug can show until the new final PR opens. To filter by base, pod would need to write the merge-target into the plan doc.

## 2026-10-21 — no npm publishing
Context: the master plan planned `npx pod-board` for phase 2. The repo is private (2026-10-18), and the board has one user on one machine.
Decision: don't publish to npm. Plan `board-actions` has no packaging sprint; the board keeps running from the repo.
Consequences: no public package. Revisit if the repo goes public or someone else wants to run it.

## 2026-10-21 — a Continue toggle per run
Context: copy-the-reply still sends the human to the chat to type `continue`.
Decision: each run gets a Continue toggle, off by default. On, the board resumes the run's orchestrator session with `continue` whenever pod waits only for `continue`. Off, a Continue button does it once. The board uses the human's own `claude` login, never an API key or `--bare`.
Consequences: needs a check of Anthropic's current rules for headless use, and of what happens when the session is also open in a terminal, before it's built (plan `board-actions`, sprint `resume-runs`). Copy-the-reply stays as the fallback.

## 2026-10-21 — `go` only from a button
Context: the human doesn't want building to start from a guess while planning is still going on.
Decision: the board never sends `go` on its own, not even with the Continue toggle on. A Go button sends it only when the human presses it. The same holds for `try` and for queue answers.
Consequences: the board never infers "waiting for go" from transcripts; the Go button is shown on a plan whose sprints haven't started, and the human decides.

## 2026-10-21 — build queue answers before pod reads them
Context: sprint `queue-and-replies` was planned to wait for claude-pod's `**Answer (human):**` queue format. claude-pod doesn't have it yet, and the human wants all hand-offs on the board website.
Decision: build the board side now against the master plan's format: a `**Answer (human):** <text>` line on the entry in `pod-docs/handoff-queue.md`. The claude-pod change (pod reads the line like a chat answer) goes to the claude-pod agents in parallel.
Consequences: until claude-pod reads the line, an answer written from the board sits in the queue unread, and pod still waits for the chat. The board says so where you answer. End-to-end verification of answers waits for the claude-pod change. If claude-pod settles on a different format, the board's writer follows it.

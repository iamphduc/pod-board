# Runs list and pipeline

## What it is

Screen 1: the runs list beside the selected run's pipeline (Plan, one stage per sprint, Check, Ship) and its slice log, plus the Add a repo form, the live chip, and the empty and error states. Covers the features.md rows Screen 1, Screen 1 live state, Screen 1 Add repo, and Unsupported docs and no runs. The logic is pure in `packages/model/src/runs.ts` and `pipeline.ts` and in `packages/web/src/screens/runs/view.ts`; components are glue.

## How it works

- **Joins (agent → plan).** An agent belongs to a plan by its `plan` (reviewers, sprint planners, and reporters carry one), by one of the plan's sprints, or by a role: a `pod:reviewer` whose plan matches is a review round; an engineer on `<plan>-fix` is the fix pass; one on `<sprint>-w<N>-fix` is wave N's fix (wave time and tokens, never a slice row); else its slice. Running means active within the last 30 minutes.
- **Which runs.** One row per plan that isn't archived or finished (all sprints done, no pending hand-back, not halted, no agent running), plus each plan a claim names (`<temp>/pod-ports/<B>` holding `<repo> <plan>`): a claimed plan that isn't archived always, and a claimed archived plan while its hand-back is pending, it's halted, or one of its agents wrote in the last 30 minutes (ended or not). A repo with an error, unsupported docs, or no live plan gets one repo row instead.
- **Run state**, first match: `blocked` (halted, or a blocked slice in the current sprint) → `needs-you` (any queue item for the human) → `running` → `idle`. Where-text: `<sprint> · wave w/n`, `drafting` / `not drafted`, or `final review` / `final PR` / `closing out` / `all sprints done`. A claimed archived plan reads `final PR` while its hand-back is pending, else `closing out`; a running reviewer still reads `final review`.
- **Wave step state**, first match: `blocked` → `done` → `you` (an ask naming an unfinished slice) → `live` → `wait`. Detail shows engineers, minutes, and tokens, left out when unknown.
- **Slice log.** One group per wave of every sprint with a doc; rows hold model, confidence, minutes, and tokens from that slice's agents.
- **Live.** The page reads `/api/events` and recomputes on each board and every 30 s. While a stream is open it also checks `/api/health` every 5 s; a failure shows `lost · retrying` and keeps the last board.
- **States.** Banners in order: `lost · retrying`, `config unreadable`, `gh missing` / `gh logged out` with "Last checked HH:MM". The empty main view names an unsupported docs version or its absence; no repos shows `No repos yet`.
- **Add a repo** posts to `/api/repos`; a repeat shows "Already registered."; Escape clears the error.

## Why it's this way

- **A claimed plan stays a run through its close-out**: pod archives the plan (`Status: archived`) before the final merge and writes the hand-back only after the reporter finishes, so without the claim the run read `no active plan · idle` while the reporter wrote. The claim file is pod's own "still working on it" signal; pod deletes it after the merge. With no claim, an archived plan stays off the list, even with its reporter running: a reporter re-run on a finished plan isn't a run.
- **A leftover claim doesn't keep a finished plan.** pod deletes the claim only when the human resumes it after the merge, and the next plan's first commit resolves or deletes the untagged hand-back, so the claim can outlive the run. pod itself treats a claim naming an archived plan as free. So a claimed archived plan needs a pending hand-back, a halt, or recent agent activity; the queue entry's resolution isn't used, because the entry may be gone. The 30-minute window (the transcripts' `STALE_MS`) bridges the pauses between close-out steps: after the final review ends and before the reporter starts, and after the reporter ends and before pod writes the hand-back.
- **A plan stays a run while halted or while one of its agents runs**, not only while sprints remain: the final review runs after the last sprint is done, and a halted review must stay visible.
- **`done` beats `you` on a wave step**, while the run still reads `needs-you`: the human chose this over `you` winning, so finished work reads finished and nothing waiting is hidden at plan level. See [decisions.md](../decisions.md#2026-10-19--you-only-on-unfinished-waves).
- **Unsupported docs show nothing but a message**, not a best-effort parse: a wrong board is worse than an empty one.
- **The health check beside the stream**: the Vite proxy kept a dead API's stream open, so the page never saw it drop.
- **Light chip text uses darker `--*-ink` tokens** than the preview, to pass 4.5:1. See [decisions.md](../decisions.md#2026-10-19--light-chip-text-darker-ink-tokens).

## Watch out

- A plan's reviewers and planners join it only through `AgentRun.plan`, read by `readDispatch` (see `run-model.md`): a `plan slug` field, then a `plan` field, then, for sprint planners only, the prose ``for plan `<slug>` ``. A loose match once read a round 2 reviewer's plan as `field` from quoted prose, so the plan dropped off the runs list (`no active plan · idle`) during its own review; reading only list items then lost most running engineers' slice and branch. Any change to these rules needs the corpus check over real transcripts ([decision](../decisions.md#2026-10-19--fix-the-dispatch-field-regression-with-a-corpus-check)).
- A pause between close-out steps longer than 30 minutes (the orchestrator waiting on the human before it dispatches the reporter, say) drops the plan off the list until the next agent starts. Within 30 minutes of the merge, a leftover claim still reads `closing out · idle`.
- The reporter has no step of its own in the pipeline: it shows only as the run's `running` state while it writes.
- The planner's and reporter's prose fallback holds only while pod's prompt says exactly ``for plan `<slug>` ``. A planner that names its plan only as a path mid-sentence reads no plan and shows `not drafted`.
- A pending `→ human` entry stays pending after its wave merges: the wave reads `done`, the run `needs-you`. Don't move this rule into `runs.ts`.
- Fix branches not named `<sprint>-w<N>-fix` (such as `-w2-starve`) aren't counted in their wave's time and tokens.
- `blocked` and `you` wave steps show done-style detail with tokens (queued, someday).
- Agents older than the transcript window lose their time and tokens; the wave then reads `<s> slices`.

## History

- 2026-10-18: added in sprint server-runs (slice P1).
- 2026-10-19: banners, docs version messages, and theme boot added in sprint board-engineer (slice X1).
- 2026-10-19: a done wave reads `done` even with a pending ask for the human; `you` only on unfinished waves (decision "`you` only on unfinished waves", sprint board-engineer wave 2 fix).
- 2026-10-19: reviewers and sprint planners now carry their plan from real dispatches (`readDispatch`, see run-model.md), so `final review`, the Check stage's live round, and `drafting` show for real runs (plan board-read fix pass).
- 2026-10-19 · board-read · plan complete; theme boot moved to `app-shell.md`; round 2 found the prose `plan slug` bug, still open · [report](../reports/board-read.html)
- 2026-10-19: a dispatch field quoted in prose never beats the real list field, so a round 2 reviewer keeps its plan in `final review` and the Check stage shows `round 2` live (plan board-read fix 2).
- 2026-10-19: dispatch fields count at a line, list item, sentence, or ` · ` part start again, so running engineers keep their slice row and the run reads `running` (plan board-read fix 3).
- 2026-10-19: a `Plan: E:/…` drive path no longer hides a planner's prose plan, so it shows `drafting`; fenced examples never count (plan board-read fix 4).
- 2026-10-20 · board-read · final review passed at round 5, with every row driven live · [report](../reports/board-read.html)
- 2026-10-20 · fix-closeout-idle · a live claim keeps its plan listed through the close-out (`closing out`, then `final PR`), and the reporter joins its plan, so a closing-out run no longer reads `no active plan · idle`.
- 2026-10-20 · fix-closeout-idle round 1 · a claimed archived plan leaves the list once its hand-back isn't pending and none of its agents wrote in 30 minutes, so a leftover claim no longer shows a finished plan as `closing out` forever.

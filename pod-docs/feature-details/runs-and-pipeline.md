# Runs list and pipeline

## What it is

Screen 1: the runs list beside the selected run's pipeline (Plan, one stage per sprint, Check, Ship) and its slice log, plus the Add a repo form, the live chip, and the empty and error states. Also `/pod:fix` runs, with their own pipeline and agent log, and the Other activity strip. Covers the features.md rows Screen 1, Screen 1 live state, Screen 1 close-out run, Screen 1 fix run, Other activity, Screen 1 Add repo, and Unsupported docs and no runs. The logic is pure in `packages/model/src/runs.ts`, `pipeline.ts`, and `fix-runs.ts` and in `packages/web/src/screens/runs/view.ts`; components are glue.

## How it works

- **Joins (agent → plan).** An agent belongs to a plan by its `plan` (reviewers, sprint planners, and reporters carry one), by one of the plan's sprints, or by a role: a `pod:reviewer` whose plan matches is a review round; an engineer on `<plan>-fix` is the fix pass; one on `<sprint>-w<N>-fix` is wave N's fix (wave time and tokens, never a slice row); else its slice. Running means active within the last 30 minutes.
- **Which runs.** One row per plan that isn't archived or finished (all sprints done, no pending hand-back, not halted, no agent running), plus each plan a claim names (`<temp>/pod-ports/<B>` holding `<repo> <plan>`): a claimed plan that isn't archived always, and a claimed archived plan while its hand-back is pending, it's halted, or one of its agents wrote in the last 30 minutes (ended or not). A repo with an error, unsupported docs, or no live plan gets one repo row instead.
- **Run state**, first match: `blocked` (halted, or a blocked slice in the current sprint) → `needs-you` (any queue item for the human) → `running` → `idle`. Where-text: `<sprint> · wave w/n`, `drafting` / `not drafted`, or `final review` / `final PR` / `closing out` / `all sprints done`. A claimed archived plan reads `final PR` while its hand-back is pending, else `closing out`; a running reviewer still reads `final review`.
- **Wave step state**, first match: `blocked` → `done` → `you` (an ask naming an unfinished slice) → `live` → `wait`. Detail shows engineers, minutes, and tokens, left out when unknown.
- **Slice log.** One group per wave of every sprint with a doc; rows hold model, confidence, minutes, and tokens from that slice's agents.
- **Live.** The page reads `/api/events` and recomputes on each board and every 30 s. While a stream is open it also checks `/api/health` every 5 s; a failure shows `lost · retrying` and keeps the last board.
- **States.** Banners in order: `lost · retrying`, `config unreadable`, `gh missing` / `gh logged out` with "Last checked HH:MM". The empty main view names an unsupported docs version or its absence; no repos shows `No repos yet`.
- **Add a repo** posts to `/api/repos`; a repeat shows "Already registered."; Escape clears the error.

## Fix runs

- **Which.** Each claim `<repo> fix-<slug>` whose name matches no plan of the repo, once per name (`fixRunNames`). A claim named like a plan stays that plan's; a claim not named `fix-…` that names no plan is ignored. The run's `RunSummary` has `plan: 'fix-<slug>'` (the route key, since no plan has that name) and `fix: '<slug>'`.
- **Agents.** Engineers whose dispatch `branch` is `fix-<slug>`; reviewers with `kind: fix` whose `branch` is `fix-<slug>` or whose `pr` is the run's PR number. Each counts once per turn: an agent continued with SendMessage (`AgentRun.turns`, see `run-model.md`) gives one entry per turn, with that turn's start, last write, and tokens; earlier turns read `ended`. An engineer turn that started after the first matched review is a fix pass, whether a new agent or the same one resumed, else the build (a re-dispatch before any review is still the build). A reviewer's first turn takes its `round` field; else, and for a resumed turn, 2 when it started after a fix pass, else 1. Several turns of one step read `<n> engineers`, `<n> passes`, or `<n> runs`. A `kind: fix` reviewer is never a plan's review round (`roleOf`), even with a plan field.
- **PR.** The PR on `repo.prs` whose `branch` is `fix-<slug>`: the server asks `gh pr list --head fix-<slug> --state all` for each fix claim and keeps the open PR, else the newest. A closed one is asked about again every 30 s (a reopen or a new PR shows); a merged one isn't.
- **Listed** while its claim exists, unless its PR merged and none of its agents wrote in the last 30 minutes (a leftover claim).
- **Reviewed** means the run's agent that wrote last is a reviewer that ended (one that went quiet without ending doesn't count). Last write, not start: an engineer continued for the fix pass (the same transcript) keeps its first start but writes after the review.
- **Where:** the newest running agent's step (`build`, `review`, `fix pass`, `review round 2`); else `review` while the PR is open and not reviewed; else `PR` once there is one; else the newest agent's step; else `build` (pod claims ports before it dispatches). **State:** an agent running → `running`; the PR open and reviewed → `needs-you`; else `idle`.
- **Pipeline** (`buildFixPipeline`): Build (Engineer: `not started`, `<n> min so far`, or `<n> min · <k> tok`, with `<n> engineers` when there are several; Fix pass: `only if review fails` until one starts), Review (Round 1; Round 2: `only after a fix pass`), Ship (PR: `not open yet`, `PR #N · after review` waiting while the PR is open and not reviewed, then `PR #N · you merge`, `PR #N · merged`, or `PR #N · closed` as blocked).
- **Agent log** below the pipeline, oldest first, one row per turn (a continued engineer shows an `engineer` row and a `fix pass` row): role (`engineer`, `fix pass`, `reviewer · round N`), `HH:MM → HH:MM` (`→ now` while running), and a running / ended / stale chip. Each engineer row links to `#/<repoId>/fix-<slug>/agent/<id>`, which opens the engineer view under the log (no slice, so Files owned reads `not listed`), headed by its latest turn. An unknown agent id falls back to the pipeline.
- **No wave board:** no tabs, and `#/<repoId>/fix-<slug>/board` falls back to the pipeline. The title is the slug, never the task text.

## Other activity

- **Which.** The repo's agents that belong to no plan of the repo (`isPlanAgent`, listed or not) and to no listed fix run, whose last write is under 2 hours old (`OTHER_WINDOW_MS`), newest first, 8 at most (`OTHER_CAP`): researchers, scouts, planners with no plan, stray engineers and reviewers, and a fix run's agents once its claim is gone.
- **Shows** under the main view of any run of that repo (the repo row's too): `<role>` (the type without `pod:`), ` · <field>` (branch, else plan, else sprint), the last write as `HH:MM`, and a state chip. No description, prompt, or task text.
- **Not a run:** it adds nothing to `Runs · N active` and no `needs you`.

## Why it's this way

- **A claimed plan stays a run through its close-out**: pod archives the plan (`Status: archived`) before the final merge and writes the hand-back only after the reporter finishes, so without the claim the run read `no active plan · idle` while the reporter wrote. The claim file is pod's own "still working on it" signal; pod deletes it after the merge. With no claim, an archived plan stays off the list, even with its reporter running: a reporter re-run on a finished plan isn't a run.
- **A leftover claim doesn't keep a finished plan.** pod deletes the claim only when the human resumes it after the merge, and the next plan's first commit resolves or deletes the untagged hand-back, so the claim can outlive the run. pod itself treats a claim naming an archived plan as free. So a claimed archived plan needs a pending hand-back, a halt, or recent agent activity; the queue entry's resolution isn't used, because the entry may be gone. The 30-minute window (the transcripts' `STALE_MS`) bridges the pauses between close-out steps: after the final review ends and before the reporter starts, and after the reporter ends and before pod writes the hand-back.
- **A plan stays a run while halted or while one of its agents runs**, not only while sprints remain: the final review runs after the last sprint is done, and a halted review must stay visible.
- **`done` beats `you` on a wave step**, while the run still reads `needs-you`: the human chose this over `you` winning, so finished work reads finished and nothing waiting is hidden at plan level. See [decisions.md](../decisions.md#2026-10-19--you-only-on-unfinished-waves).
- **Unsupported docs show nothing but a message**, not a best-effort parse: a wrong board is worse than an empty one.
- **The health check beside the stream**: the Vite proxy kept a dead API's stream open, so the page never saw it drop.
- **Light chip text uses darker `--*-ink` tokens** than the preview, to pass 4.5:1. See [decisions.md](../decisions.md#2026-10-19--light-chip-text-darker-ink-tokens).

- **Fix runs read fields only** (`kind`, `branch`, `PR`), never the prose a dispatch wraps them in, by the same rule as plan reviewers: prose matching read a plan reviewer's plan as `field`. See [decisions.md](../decisions.md#2026-10-20--fix-runs-on-the-board).
- **An open fix PR waits for its review** (`review · idle`, Ship `after review`), and a running reviewer beats it: the PR isn't the human's to merge until the review is done, like a plan's final PR that waits for its hand-back. Round 1 review of #23 found the first version told the human to merge an unreviewed PR.
- **The slug, not the task text, titles a fix run:** the task text is prompt text, which can quote findings and pasted output, and the board serves none.
- **Other activity's 2 hours and 8 agents** keep it quiet: long enough to see a research run or a just-closed fix, short enough not to list a day's history.

## Watch out

- A fix reviewer dispatched only in prose (ytb-feed's `kind: fix. Review PR <url>, branch fix-… → …`) reads `kind: fix` but no branch or PR, so it doesn't join its run: Review reads `not started` and the reviewer shows under Other activity. pod's `/pod:fix` names `PR URL` and `branch` as fields; writing them as fields fixes it.
- A fix engineer dispatched with no `Branch:` field (older chess-web and ytb-feed shapes: ``Branch `fix-…` ``, `branch fix-… off origin/main`) joins no run and shows under Other activity.
- A closed (not merged) fix PR keeps the run listed as `PR · idle` with Ship `blocked` until the claim goes. A new PR on the same branch after a merged one isn't seen: `gh` isn't asked again about a merged PR. A leftover claim drops off within 30 minutes anyway.
- The board can't read a review's verdict. After a round 1 that failed and before the fix pass starts, the last agent to write is an ended reviewer, so the run reads `needs-you` and Ship `you merge` in that gap.
- A fix run's agents show under Other activity for 2 hours after its claim goes.
- A turn starts only at a prompt whose `origin.kind` is `coordinator`. If the runtime renames that origin, a continued agent still reads running while it works, but its rounds fold into one turn again.
- A plan reviewer's prompt that says `kind: fix` would leave the plan's Check stage. No real plan review did as of 2026-10-20.
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
- 2026-10-20 · fix-show-fix-runs · `/pod:fix` runs show on the runs list with a `fix` tag, their own pipeline (Build, Review, Ship by head-branch PR) and agent log, and no wave board; agents tied to no run show in an Other activity strip ([decision](../decisions.md#2026-10-20--fix-runs-on-the-board)).
- 2026-10-20 · fix-show-fix-runs round 2 · a continued agent reads running until it hands back again, and its turns are their own steps and log rows: the engineer resumed after the review is the fix pass, the reviewer resumed after it round 2. So a running round 2 no longer reads `needs you`.
- 2026-10-20 · fix-show-fix-runs round 1 · an open fix PR reads `review · idle` with Ship `after review` until the agent that wrote last is an ended reviewer, and a closed fix PR is asked about again, so a reopen shows.

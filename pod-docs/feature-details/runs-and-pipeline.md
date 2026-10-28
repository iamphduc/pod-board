# Runs list and pipeline

## What it is

Screen 1: a bar across the top (`+ Repo` and the ⋯ menu), the runs list, and a narrow main column with the selected run's header, its **Next step** card, and three tabs (Waiting, Plan, Log). The pipeline (Plan, one stage per sprint, Check, Ship) shows as the header's progress strip and the Plan tab's lines; the slice log is in the Log tab. Also `/pod:fix` runs, the Other activity strip, and the controls: the Merge confirm, the action log, the reply with Continue and Go, the `auto-continue` switch, and the answer form. Covers the features.md rows Screen 1 (all five), Other activity, Unsupported docs and no runs, Merge from the board (page side), Reply panel, Waiting on you, and Continue and auto-continue (page side). Logic is pure in `packages/model/src` and `packages/web/src/screens/runs`; components are glue.

## How it works

- **Joins:** an agent belongs to a plan by its `plan` field, one of the plan's sprints, or its role (a plan reviewer is a review round; `<plan>-fix` the fix pass; `<sprint>-w<N>-fix` wave N's fix). Running means it wrote in the last 30 minutes.
- **Which runs:** each plan not archived or finished, plus each plan a claim file names. A claimed archived plan stays while its hand-back entry is pending (also after its PR merged, since pod still waits for `continue`), while halted, or while one of its agents wrote in the last 30 minutes.
- **State,** first match: `blocked` → `needs-you` (a queue item for the human, or a PR waiting on you) → `running` → `idle`. Wave steps: `blocked` → `done` → `you` → `live` → `wait`.
- **PRs waiting on you** (`waitingPrs`, one rule for the Merge button and the merge routes): the pending hand-back PR (`final`); a reviewed open fix PR (`fix`); a current-sprint wave whose unfinished slices are all `pushed`, no engineer runs, and whose PR is open (`wave`). Only that step carries `merge`.
- **Autopilot runs:** a plan whose active sprint doc (the plan doc while no sprint doc is active) has a line starting `<!-- autopilot-run` is a `/pod:autopilot` run (`PlanModel.autopilot`); its fields aren't read. pod merges its wave PRs itself, so:
  - Not halted: a wave PR that would wait on you reads `PR #N · autopilot merges`, state `live`, with no Merge, and isn't in `waitingPrs` (the merge routes answer `not waiting on you`). The run reads `running`, not `needs-you`.
  - Stopped (`isAutopilotStopped`: a pending `BLOCKED` from the orchestrator, or a pending `PENDING · orchestrator → human` whose entry starts with its gate: `gate 1`–`gate 7`, or a gate name from the policy (`blocked-concern`, `plan-review-fail`, `auto-merge-fail`, `inter-wave-verify`, `safety-bound`, `escalation-valve`, `plan-complete`), any case, maybe in bold or after `Autopilot`): the step reads `PR #N · autopilot stopped`, state `you`, with Merge (gate 6 withholds the PR for you; at gate 3 it's an override); the run reads `blocked` for a BLOCKED and `needs-you` for a PENDING.
  - The Plan stage has no Go step.
  - A run with no marker (`/pod:code`) is unchanged.
- **Times** (step details and the slice log): active minutes only. Each agent's records form active spans, split wherever two are more than 15 minutes apart (`IDLE_GAP_MS`), or 30 when the later record is the result of the tool call the agent was waiting on (`TOOL_GAP_MS`). A group's spans (a slice's, a wave's, a fix-run step's turns) join as one stream: overlaps count once, and a gap between two agents counts only when it's within 15 minutes. A live agent's time runs on to now while its last record is within 15 minutes. Tokens are every message, as before.
- **Live:** the page reads `/api/events`, recomputes every 30 s, and checks `/api/health` every 5 s; a failure, or no answer within 4 s, shows `lost · retrying` in the bar and keeps the last board. Nothing shows while the stream is live or connecting.

### Layout

- **Bar:** the logo and `Pod Board`; the connection status only while lost; `+ Repo`, which opens the folder picker under the bar and gets focus back when it closes (an added folder closes it); and the ⋯ menu (`BarMenu`): the run's auto-continue switch, the theme (System, Dark, Light), and the run's port base when it has a claim. The menu is keyed per run, so it closes when the run changes. Banners sit under the bar.
- **Runs list:** each row is the repo name, with ` · <plan>` or ` · fix · <slug>` only when that repo has more than one run listed (`runLabel`), the `fix` tag, and the state as a dot and a word. No second line.
- **Main column** (720 px at most; the wave board takes the whole width): the run header (`runHeader`: repo crumb, name, progress strip, `Wave N of M`), the Next step card, and the tabs.
- **Next step card** (`nextSteps(...).card`): `Next step`, a status dot and word, the title, the detail, and one action. Answer and Merge open their panel in place under the card, each with the card's own flow, so the result stays after the Board moves the item on. A reply shows its rows in the card (`ReplyPanel framed={false}`) with no separate detail line. `Nothing to do` is the dashed `.card.calm`, with no button. The card never folds.
- **Tabs:** Waiting (count: `rest.length`), Plan (hidden on a plan-less row; a fix run shows its Build, Review, Ship lines and no wave board link), and Log. One open tab per browser, in `localStorage` key `pod-board-tab`; nothing stored means all closed, so the page ends under the card. Clicking the open tab closes it.
- **Wave board** (`#/<repo>/<plan>/board`): the header, `Back to the run`, and the board at full width; no card or tabs. The Plan tab's `Open the wave board` leads there.
- **Engineer view of a fix run** (`/agent/<id>`): the Log tab shows open, with the engineer under the agent log, and isn't saved. Pressing any tab there saves it and goes back to the run.
- At 820 px and below the runs list stacks above the main column; at 375 px the card and its button fit on a 667 px tall screen with two runs listed.

### Fix runs

A claim `fix-<slug>` naming no plan is a fix run: Build, Review, Ship (the PR on head branch `fix-<slug>`), an agent log with one row per turn, and no wave board. An open PR reads `after review` until the agent that wrote last is an ended reviewer. The slug, never the task text, is its title.

### Other activity

The repo's agents in no plan and no listed fix run, last write under 2 hours, newest 8: role, branch or plan, `HH:MM`, and a state chip. It's not a run and adds no `needs you`.

### Merge and the action log

A PR waiting on you shows Merge on the Next step card or its Waiting tab row (one place only; the button's id is `merge-pr-<n>`, so focus comes back to it), which opens the confirm in place under it: title, checks, mergeability, short head sha, and `Merge (merge commit)`. Then the result in GitHub's words (`Merged` only for `merged`). Try again reads the PR again; it never resends a merge. The Action log, in the Log tab under Other activity, lists the newest 20 actions with a result chip.

### Reply panel

For the selected run, when the model gives a reply (on the card, or as a Waiting row): each word, its why, and Copy; then, behind `Run it yourself`, `Paste it in Session <id>`, a `cd` line, and `claude --resume <id>`, each with Copy. A sendable row also gets a primary Continue or Go; one press posts one resume, and the result shows in place until Close.

### Auto-continue switch

In the bar's ⋯ menu, marked `this run`: a `role="switch"` button labelled `auto-continue`, on when `Board.autoContinue` lists the run. A press only posts the toggle; the server's check does the sending, so the switch never sends `go` or anything else itself.

### Waiting tab and answers

Everything waiting on you that isn't on the card: route and date, then the body clamped to two lines until you click it. Answer shows only on entries routed `→ human`; a `BLOCKED` between agents is listed without it, since pod resolves it, or writes you a new entry if it can't. Answer opens a form in place with a note on when pod reads the answer. A plan run's note is `Answer here, then press Continue. pod reads it when the run continues.` A fix run or repo row gets `Answer here. pod reads it when a /pod:code run next starts a wave.`, since `/pod:fix` reads no answers and a repo row has no Continue (`answerNote`). Save cleans the text, posts it, and the row then reads `Your answer: … Waiting for pod to read it.`

## Why it's this way

- **A claimed plan stays a run through close-out:** pod archives the plan before the final merge and deletes the claim only after your `continue`. Turned down: ending the run when the PR merges, which dropped `final-merged` once the merge came over 30 minutes after the last agent (review round 1 of #33). The 30-minute window bridges pauses between close-out steps.
- **`done` beats `you` on a wave step** ([decision](../decisions.md#2026-10-19--you-only-on-unfinished-waves)): finished work reads finished; the run still reads `needs-you`.
- **A wave PR waits on you once its engineers stop:** pod writes no wave hand-back entry, so `pushed` with no engineer running is the signal. Autopilot may merge first; `--match-head-commit` covers the race.
- **Controls open in place, not in a modal** ([plan Look](../plans/board-actions.md#look)): the confirm and the answer form sit under the card or row they act on.
- **One next step, the rest behind closed tabs** ([plan](../plans/calm-dashboard.md)): the old screen showed every control at once, so the one thing to do was hard to find. The tab stays closed until you open it, and the open tab is remembered per browser, not per run.
- **No red on Merge:** the confirm step carries the weight (plan Look).
- **Autopilot's wave PRs aren't yours** ([decision](../decisions.md#2026-10-26--autopilot-runs-show-their-wave-prs-as-autopilots-agent-default--override-anytime)): `you merge` on a PR autopilot holds back for a failed gate invited a merge that skipped the CI gate. Once autopilot stops for you, Merge shows, since gates 3 and 6 can hand the merge to you, and its confirm shows the checks. Gate 6 writes a PENDING, not a BLOCKED, so `isHalted` alone missed it (review round 1 of #45).
- **Times skip idle gaps over 15 minutes** ([decision](../decisions.md#2026-10-26--slice-times-skip-idle-gaps-over-15-minutes-agent-default--override-anytime)): a slice whose engineer's laptop slept read 1195 min for about 17 min of work. Not 10: a Bash call that runs to its 10-minute limit answers about 10.02 minutes later, and a 10-minute rule dropped that whole wait.
- **Only listed runs show their queue entries** ([decision](../decisions.md#2026-10-22--only-listed-runs-show-their-queue-entries-agent-default--override-anytime)). Trade-off: entries of finished plans are answered in the chat.
- **Unsupported docs show only a message:** a wrong board is worse than an empty one.
- **Fix runs read fields only** ([decision](../decisions.md#2026-10-20--fix-runs-on-the-board)): prose matching read wrong plans.
- **Status words stay in `--fg` or `--muted`; only the dot takes the status color** ([plan Look](../plans/calm-dashboard.md#look)), so text passes 4.5:1 in both themes. This replaced the darker ink tokens for light chip text.

## Watch out

- Key the per-run parts (`NextStepCard`, `WaitingTab`, `BarMenu`) by the run, and keep the card's reply slot mounted for any run with a plan: a slot that mounts only while the card is a reply loses the Continue or Go result when the Board drops the reply. The lingering result shows on whatever card comes next until Close. With one shared key across siblings, React once left an old Reply panel on the page (PR #41).
- Ship's final PR before the hand-back comes from `gh` on head branch `<plan-slug>`: a fixture copy shows it only as a git repo whose `origin` is the real GitHub repo.
- A pause between close-out steps over 30 minutes drops the plan until the next agent starts, unless its hand-back entry is pending.
- A plan's reviewers and planners join only through `AgentRun.plan` (see [run-model.md](run-model.md)); change those rules only with the corpus check ([decision](../decisions.md#2026-10-19--fix-the-dispatch-field-regression-with-a-corpus-check)).
- Fix agents dispatched with prose instead of `Branch:` or `PR URL` fields join no run and show under Other activity.
- The board can't read a review verdict: after a failed round 1 and before the fix pass, a fix run reads `needs-you`.
- The orchestrator also files plain `PENDING → human` notes and keeps going (`now: …`, `someday: …`, an agent default); they don't stop autopilot, nor does a note that names a gate mid-sentence (`Runtime safety bound (gate 6) note: … continuing.`). A halt PENDING that doesn't start with its gate reads as a note, so no Merge shows for it. Of the 48 such entries in the real queues on 2026-10-26, the 10 that start with a gate are the halts.
- A wave engineer quiet for 30 minutes counts as stopped, so its wave can read `you merge` while stuck.
- Autopilot is read from the active sprint doc only: a `/pod:code` resume of a run autopilot started still carries the marker, and reads as autopilot (no Merge until a halt). A sprint doc the planner wrote without carrying the marker over reads as `/pod:code`.
- A wait over 15 minutes that isn't a tool call's result (a background task's notification), or a tool call over 30 minutes, counts as idle, so active time can read low.
- The chess-web fixture's `ladder` sprint ran under autopilot and keeps its marker; delete that line from a copy to see `/pod:code`'s `you merge`.
- A closed hand-back PR still reads `you merge`; Merge then says `PR is closed` ([decision](../decisions.md#2026-10-22--a-closed-hand-back-pr-still-counts-as-waiting-agent-default--override-anytime)).
- An answer doesn't clear `needsYou`: the row reads answered and the run `needs-you` until pod resolves the entry.
- Continue and Go show only when the reply is sendable and the session id is safe for the runner (no leading `-`); without one, only Copy shows (resume-runs wave 2 fix). After `started`, the row usually stays, and a second press gets `session is busy` or `resume in progress`.
- A pending `→ human` entry stays pending after its wave merges: the wave reads `done`, the run `needs-you`. Don't move this rule into `runs.ts`.

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
- 2026-10-21 · fix-final-pr-early · Ship shows the final PR found by head branch `<plan-slug>` before the hand-back exists, so the final review and close-out no longer read `not open yet` ([decision](../decisions.md#2026-10-21--find-a-plans-final-pr-by-its-branch-any-base-agent-default--override-anytime)).
- 2026-10-20 · fix-show-fix-runs round 1 · an open fix PR reads `review · idle` with Ship `after review` until the agent that wrote last is an ended reviewer, and a closed fix PR is asked about again, so a reopen shows.
- 2026-10-21 · merge-actions P1 · one rule (`waitingPrs`) for PRs waiting on you; a handed-back wave reads `you` with `PR #N · you merge` and its run `needs-you`, and waiting steps carry `merge`.
- 2026-10-21 · merge-actions U1 · a step with a PR waiting on you gets a Merge button that opens the confirm in place, shows GitHub's result, and the action log lists the newest 20 actions under Other activity.
- 2026-10-21 · queue-and-replies R1 · a Reply panel under the bar names the reply pod waits for (`continue`, `try`, or `go`), why, and the chat to paste it in, each line with a Copy button.
- 2026-10-22 · queue-and-replies U2 · a Waiting on you list under the main view shows the run's queue entries for you, and an Answer button opens a form in place that appends your answer to the entry's line.
- 2026-10-22 · resume-runs U1 · an `auto-continue` switch beside the run's state chip turns the board's automatic `continue` on or off per run, and the Reply panel's sendable rows get Continue or Go buttons that resume the session from the board.
- 2026-10-22: a claimed archived plan stays a run while its hand-back entry is pending, also after the PR merges; the final PR stops waiting on you once merged (board-actions plan fix, review of #33).
- 2026-10-27 · fix-answer-note · the Answer form note has no chat step: a plan run says `Answer here, then press Continue. pod reads it when the run continues.`; a fix run or repo row says `Answer here. pod reads it when a /pod:code run next starts a wave.`
- 2026-10-22 · board-actions · plan complete: Merge, action log, Reply panel with Continue and Go, the auto-continue switch, and Waiting on you; final PR #33 passed review at round 2 after fix PR #34 · [report](../reports/board-actions.html)
- 2026-10-24 · fix-answered-continue · fixed: the Reply panel stayed on the page after its reply went away, because screen 1's siblings shared one key.
- 2026-10-25 · fix-health-probe-timeout · fixed: a health check that hung kept the chip `live` on a dead server; it now fails after 4 s.
- 2026-10-26 · fix-autopilot-view · fixed: an autopilot run's waiting wave PR read `you merge` with a Merge button, and the plan showed a `Go · not recorded yet` step; now it reads `autopilot merges` (or `autopilot stopped`, with Merge, once autopilot stops for you, at a BLOCKED halt or a PENDING gate such as gate 6) and has no Go step. Slice, wave, and fix-run minutes leave out idle gaps over 15 minutes, so a slice whose laptop slept no longer reads 1195 min.
- 2026-10-26 · fix-answer-only-yours · fixed: Answer showed on every pending BLOCKED, including ones between agents, where an answer did nothing; it now shows only on entries routed to you.
- 2026-10-28 · calm-screen S1 · screen 1 redrawn: a bar with `+ Repo` (the folder picker) and the ⋯ menu, a run header with the progress strip, one Next step card, and Waiting, Plan and Log tabs closed until opened. The Add a repo form, the `live` chip, the pipeline row, the Waiting on you list, and the Pipeline / Wave board tabs are gone.

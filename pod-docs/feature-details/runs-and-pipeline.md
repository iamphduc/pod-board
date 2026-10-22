# Runs list and pipeline

## What it is

Screen 1: the runs list beside the selected run's pipeline (Plan, one stage per sprint, Check, Ship) and its slice log, plus the Add a repo form, the live chip, and the empty and error states. Also `/pod:fix` runs, with their own pipeline and agent log, and the Other activity strip. Also the Reply panel and the Waiting on you list with its answer form. Covers the features.md rows Screen 1, Screen 1 live state, Screen 1 close-out run, Screen 1 fix run, Other activity, Screen 1 Add repo, and Unsupported docs and no runs. The logic is pure in `packages/model/src/runs.ts`, `pipeline.ts`, and `fix-runs.ts` and in `packages/web/src/screens/runs/view.ts`; components are glue.

## How it works

- **Joins (agent → plan).** An agent belongs to a plan by its `plan` (reviewers, sprint planners, and reporters carry one), by one of the plan's sprints, or by a role: a `pod:reviewer` whose plan matches is a review round; an engineer on `<plan>-fix` is the fix pass; one on `<sprint>-w<N>-fix` is wave N's fix (wave time and tokens, never a slice row); else its slice. Running means active within the last 30 minutes.
- **Which runs.** One row per plan that isn't archived or finished (all sprints done, no pending hand-back, not halted, no agent running), plus each plan a claim names (`<temp>/pod-ports/<B>` holding `<repo> <plan>`): a claimed plan that isn't archived always, and a claimed archived plan while its hand-back entry is pending (also after `gh` says its PR merged, since pod still waits for `continue`), it's halted, or one of its agents wrote in the last 30 minutes (ended or not). A repo with an error, unsupported docs, or no live plan gets one repo row instead.
- **Run state**, first match: `blocked` (halted, or a blocked slice in the current sprint) → `needs-you` (any queue item for the human, or a wave PR waiting on you) → `running` → `idle`. Where-text: `<sprint> · wave w/n`, `drafting` / `not drafted`, or `final review` / `final PR` / `closing out` / `all sprints done`. A claimed archived plan reads `final PR` while its hand-back is pending, else `closing out`; a running reviewer still reads `final review`.
- **Ship step** (`Final PR`): the hand-back's PR once it exists (`PR #N · you merge`, then `merged PR #N`). Before it, the PR `gh` found on head branch `<plan-slug>`: `PR #N · after review` (wait) while open, `merged PR #N`, or `PR #N · closed` (blocked); else `not open yet`.
- **Wave step state**, first match: `blocked` → `done` → `you` (an ask naming an unfinished slice, or a PR waiting on you) → `live` → `wait`. Detail shows engineers, minutes, and tokens, left out when unknown; a wave with a waiting PR reads `PR #N · you merge` instead.
- **PRs waiting on you** (`waitingPrs` in `packages/model/src/waiting-prs.ts`), the one rule the Merge button and the merge routes share. Only runs the runs list lists count.
  - `final`: the plan's pending hand-back PR (Ship `PR #N · you merge`).
  - `fix`: a fix run's PR while it's open and reviewed (Ship `you merge`).
  - `wave`: a wave of the current sprint that isn't blocked or done, where every unfinished slice is `pushed`, none of its engineers (slice or `<sprint>-w<N>-fix`) runs, and an unfinished slice's PR cell holds an open number that `gh` doesn't report merged or closed (unknown counts as open). The first such number, once per wave.
  - A step that shows a waiting PR carries `merge: { number }`; no other step does. `url` comes from `gh` only.
- **Slice log.** One group per wave of every sprint with a doc; rows hold model, confidence, minutes, and tokens from that slice's agents.
- **Live.** The page reads `/api/events` and recomputes on each board and every 30 s. While a stream is open it also checks `/api/health` every 5 s; a failure shows `lost · retrying` and keeps the last board.
- **States.** Banners in order: `lost · retrying`, `config unreadable`, `gh missing` / `gh logged out` with "Last checked HH:MM". The empty main view names an unsupported docs version or its absence; no repos shows `No repos yet`.
- **Add a repo** posts to `/api/repos`; a repeat shows "Already registered."; Escape clears the error.

## Fix runs

- **Which.** Each claim `<repo> fix-<slug>` whose name matches no plan of the repo, once per name (`fixRunNames`). A claim named like a plan stays that plan's; a claim not named `fix-…` that names no plan is ignored. The run's `RunSummary` has `plan: 'fix-<slug>'` (the route key, since no plan has that name) and `fix: '<slug>'`.
- **Agents.** Engineers whose dispatch `branch` is `fix-<slug>`; reviewers with `kind: fix` whose `branch` is `fix-<slug>` or whose `pr` is the run's PR number. Each counts once per turn: an agent continued with SendMessage (`AgentRun.turns`, see `run-model.md`) gives one entry per turn, with that turn's start, last write, and tokens; earlier turns read `ended`. An engineer turn that started after the first matched review is a fix pass, whether a new agent or the same one resumed, else the build (a re-dispatch before any review is still the build). A reviewer's first turn takes its `round` field; else, and for a resumed turn, 2 when it started after a fix pass, else 1. Several turns of one step read `<n> engineers`, `<n> passes`, or `<n> runs`, and its minutes add up each turn's own time (to now while one runs), never the idle time between turns. A `kind: fix` reviewer is never a plan's review round (`roleOf`), even with a plan field.
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

## Merge from the board

- **Button.** A pipeline step that carries `merge` (a PR waiting on you: a wave PR, a plan's final PR, or a reviewed fix PR) shows a `Merge` button, in the plan pipeline and the fix pipeline alike. Pressing it opens the confirm in place, right under the pipeline (outside its sideways scroller), headed by the step's stage and name. One confirm is open at a time; every Merge button is off while a merge runs.
- **Flow** (`packages/web/src/screens/runs/merge-flow.ts`, a pure reducer and a small driver): idle → loading (`merge-preview`) → confirm → merging (`merge` with `{ repoId, number, headSha }` from the preview) → result, or → error. Cancel and Escape close it, except while merging. Each reply carries the number of the request it answers, so a reply that lands after a cancel or another open is dropped.
- **Confirm** shows the title, a checks chip, mergeability, and the 7-char head sha, with a primary `Merge (merge commit)` and a quiet Cancel. Conflicts, or a PR already merged or closed, turn Merge off and say why. Failing or pending checks are shown and don't block.
- **Result words:** `Merged` (only for `merged`), `Added to the merge queue`, `Auto-merge on: GitHub merges it when checks pass`, `The PR changed since you looked (head now <sha7>).` with Check again, and the server's message for `failed` and `unconfirmed` (fallbacks `The merge failed.` and `GitHub hasn't confirmed the merge.`). `logged: false` adds `Not saved to the action log.`
- **Errors** from the action client (`Actions need a page reload.`, `The board restarted. Reload the page.`, `Can't reach the board.`, or the server's `error`) show in the panel with Try again, which reads the PR afresh. It never resends the merge: a merge request that failed in transit may still have run.
- **The result stays** after the Board rebuilds and the step drops `merge`: the panel follows the flow, not the step, until you close it.
- **Action log** (`action-log-view.ts`, `ActionLog.tsx`), under Other activity whenever the Board is loaded: the newest 20 of `board.actions` across repos, newest first. Each row: time (`HH:MM` today, else `MMM D HH:MM`, local), repo, target, and a result chip (merged ok; queued and auto-merge run; stale and unconfirmed you; failed bad). Empty: `No actions yet.`

## Reply panel

- **When.** For the selected plan or fix run, when `runReplies` gives anything (see [queue-and-replies.md](queue-and-replies.md)): under the bar and its banners, above the pipeline (also above the wave board, the fix run's agent log, and the engineer view). Nothing for a repo row, or while pod works or is halted.
- **Shows** (`reply-view.ts`, `ReplyPanel.tsx`), a quiet `.inplace` panel headed `Reply pod waits for`: each reply's word in mono, its `why`, and a quiet `Copy`. Then the chat to paste it in: `Paste it in Session <id> · first agent HH:MM` (local time, left out when no start is known), the line `cd "<repo path>"`, and `claude --resume <id>`, each with its own `Copy`. With no session: `No pod session found for this run. Paste it in the chat that runs it.` With an id outside `^[A-Za-z0-9-]{1,64}$`: the session line and `cd` only, no resume line.
- **Copy** (`copy.ts`): writes the exact text to the clipboard. The button reads `Copied` for 2 s. A missing clipboard, or one that refuses, shows the text in a read-only field, selected, with `Copy failed. Press Ctrl+C.` No request, nothing logged.
- **Continue and Go** (`resume-flow.ts`, `reply-view.ts`). A row whose word `sendableReply` allows gets a primary button beside its Copy: `Continue` on a `continue` row whose signal is in `SEND_SIGNALS` (a merged wave, a done sprint, a merged final or fix PR), `Go` on the `go` row of a fresh plan. `try` and the `*-waiting` rows (merge first) get none. Pressing it posts `resume` once with `{ repoId, run, reply }`; every Continue and Go button is off while it runs, and a second press sends nothing. Nothing sends without a press.
- **Result, in place** under the pressed row: started → `The session started again. A terminal open on it won't show the board's send: run claude --resume <id> to see it.`; failed → the server's message (fallback `The session didn't start.`); `logged: false` adds `Not saved to the action log.`. A refusal (`session is busy`, `resume in progress`, `not waiting on you`, `no session`) and the action client's errors show their message. The result stays after the Board drops the reply (the panel then holds only the result) until you press Close.
- **Secrets.** Session ids and commands only, never prompt text.
- At 375 px each row stacks, with its Copy and Continue or Go buttons full width under its text, 44 px tall; ids and paths wrap.

## Auto-continue switch

- **Where.** In the run bar, right after the state chip, for every plan and fix run (not a repo row), whether or not a reply waits. Markup: `<button class="switch" role="switch" aria-checked>auto-continue</button>`; the knob's place and fill show on or off, in both themes.
- **State** (`switchView`): on when `Board.autoContinue` lists the run's `{ repoId, run }`; off when it doesn't or the field is missing.
- **Toggle** (`createToggleFlow`): a press posts `auto-continue` with `{ repoId, run, on }`, the opposite of what it shows. While it runs the switch shows the new value and is disabled. Success: it shows the server's `on` until the Board agrees, then follows the Board again. Failure: back to the Board's value (the one before the press), with the message beside the switch, until the next press. The switch never posts `resume`, so it never sends `go` (or anything) itself; the server's automatic check does the sending.

## Waiting on you

- **Which** (`queue-view.ts`, `WaitingOnYou.tsx`). The repo's `needsYou` entries for the selected run: the selected plan's `queue` first, then the repo's entries that join no plan, each in queue order. A fix run and a repo row get only the unjoined ones. Other plans' entries show under their own run. Entries match by `line`, since the Board arrives as JSON and a plan's join reads only the line. Nothing shows when no entry waits.
- **Where.** Under the main view (pipeline, fix pipeline and agent log, repo row message, or wave board), above Other activity.
- **Rows.** A card with a state edge: a type chip (BLOCKED bad, PENDING you, NOTE and others idle), the date, the route, and the body as plain text (no bold, code ticks, or link syntax). An answerable row (`isAnswerable`) has a quiet `Answer` button. An answered row shows `Your answer: <answer>` and `Waiting for pod to read it.`
- **Form** (`answer-flow.ts`, a pure reducer and driver like `merge-flow.ts`): idle → editing → saving → result, or → error. It opens in place (`.inplace`) right under its row, with a `textarea.input`, a primary `Save answer`, a quiet Cancel, and the note `ANSWER_NOTE`: `pod reads board answers only once its pod plugin supports them. Until then, also give the answer in the chat.` One form at a time; opening another row's form drops the first one's text. Cancel and Escape close it, except while saving; while saving, Save and every Answer button are off, and a repeat press sends nothing.
- **Save** runs `cleanAnswer` first: its error shows at once and nothing is sent. Else it posts `answer` with `{ repoId, line, text }`, the row's `line` and the cleaned text.
- **Result words:** answered → `Saved to the queue.` with the note, and no text box. changed → the server's message (fallback `The entry changed since you looked.`), failed → the server's message (fallback `Couldn't write the queue.`); both keep the form open with the typed text, and Save can send again. `logged: false` adds `Not saved to the action log.` Client errors show `postAction`'s message and keep the text. Sending again is safe: the route answers only an unanswered entry, so a repeat gives `not waiting on you`.
- **The result stays with its row.** After the answer the Board's line carries ` **Answer (human):** …`, so the form follows the answered row whose line starts with the line it opened on. If the entry has left the list, the form shows after the list until you close it.
- At 375 px rows and the form stack, the textarea is full width, and buttons are 44 px tall.

## Why it's this way

- **A claimed plan stays a run through its close-out**: pod archives the plan (`Status: archived`) before the final merge and writes the hand-back only after the reporter finishes, so without the claim the run read `no active plan · idle` while the reporter wrote. The claim file is pod's own "still working on it" signal; pod deletes it after the merge. With no claim, an archived plan stays off the list, even with its reporter running: a reporter re-run on a finished plan isn't a run.
- **A leftover claim doesn't keep a finished plan.** pod deletes the claim only when the human resumes it after the merge, and the next plan's first commit resolves or deletes the untagged hand-back, so the claim can outlive the run. pod itself treats a claim naming an archived plan as free. So a claimed archived plan needs a pending hand-back entry, a halt, or recent agent activity; a merged PR doesn't end it, because pod cleans up only after your `continue` (round 1 review of #33 found the run left the list, and `final-merged` with it, when the merge came over 30 minutes after the last agent wrote); the queue entry's resolution isn't used, because the entry may be gone. The 30-minute window (the transcripts' `STALE_MS`) bridges the pauses between close-out steps: after the final review ends and before the reporter starts, and after the reporter ends and before pod writes the hand-back.
- **A plan stays a run while halted or while one of its agents runs**, not only while sprints remain: the final review runs after the last sprint is done, and a halted review must stay visible.
- **`done` beats `you` on a wave step**, while the run still reads `needs-you`: the human chose this over `you` winning, so finished work reads finished and nothing waiting is hidden at plan level. See [decisions.md](../decisions.md#2026-10-19--you-only-on-unfinished-waves).
- **Unsupported docs show nothing but a message**, not a best-effort parse: a wrong board is worse than an empty one.
- **The health check beside the stream**: the Vite proxy kept a dead API's stream open, so the page never saw it drop.
- **Light chip text uses darker `--*-ink` tokens** than the preview, to pass 4.5:1. See [decisions.md](../decisions.md#2026-10-19--light-chip-text-darker-ink-tokens).

- **Fix runs read fields only** (`kind`, `branch`, `PR`), never the prose a dispatch wraps them in, by the same rule as plan reviewers: prose matching read a plan reviewer's plan as `field`. See [decisions.md](../decisions.md#2026-10-20--fix-runs-on-the-board).
- **An open fix PR waits for its review** (`review · idle`, Ship `after review`), and a running reviewer beats it: the PR isn't the human's to merge until the review is done, like a plan's final PR that waits for its hand-back. Round 1 review of #23 found the first version told the human to merge an unreviewed PR.
- **The slug, not the task text, titles a fix run:** the task text is prompt text, which can quote findings and pasted output, and the board serves none.
- **Other activity's 2 hours and 8 agents** keep it quiet: long enough to see a research run or a just-closed fix, short enough not to list a day's history.

- **A wave PR waits on you once its engineers stop**, not when pod writes a hand-back: pod has no wave hand-back entry, and every unfinished slice `pushed` with no engineer running is the moment the wave PR is the human's (or autopilot's) to merge. Autopilot merges its own, so the board can read `you merge` until it does; `--match-head-commit` covers the race.

- **The confirm opens under the pipeline, not inside the step's column:** the pipeline is a 760 px row that scrolls sideways, so a panel inside a stage would be crushed on a desktop and scroll out of view on a phone.
- **Try again reads the PR again instead of resending the merge:** a request lost in transit may have merged, and the fresh preview shows it (`not waiting on you`, or a new head) before you press again.

## Watch out

- Ship's final PR before the hand-back comes from `gh` on head branch `<plan-slug>`, so a fixture copy shows it only as a git repo whose `origin` is the real GitHub repo; a plain copy makes `gh pr list` fail and Ship stays `not open yet`. With that `origin`, a hand-back's #91 also reads merged, not `you merge`.
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

- A wave engineer that goes quiet for 30 minutes without ending counts as not running, so its wave can read `you merge` while it's still stuck.
- A closed (not merged) hand-back PR still reads `you merge` and carries `merge`, as before; Merge then reports `PR is closed`.
- A `needsYou` entry of a plan that isn't on the runs list (archived or finished, such as a pending `→ human` entry left after a plan closed) shows in no Waiting on you list: it joins its plan, and only listed runs show one.
- An answer doesn't clear `needsYou`: the row stays in the list as answered, and the run stays `needs-you`, until pod reads the line and resolves the entry.
- At 375 px the Merge button sits inside the pipeline's sideways scroller, so on a phone you may need to scroll the pipeline to reach it. The confirm itself is full width.
- With the API stopped, the Vite proxy answers `502` with an empty body; the action client reads that as `Can't reach the board.`. A `502` with a JSON `error` (the merge routes' `gh` failures) keeps its words.

- The Continue and Go buttons follow `sendableReply` only, not the session: a run with no session, or an id outside `^[A-Za-z0-9-]{1,64}$`, still shows the button, and pressing it reads `no session`.
- After `started`, the reply row usually stays (pod hasn't moved on yet) and the button stays pressable; a second press gets `session is busy` or `resume in progress` from the route.

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

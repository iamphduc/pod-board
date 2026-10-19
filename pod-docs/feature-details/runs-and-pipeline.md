# Runs list and pipeline

`listRuns(board, now)` in `packages/model/src/runs.ts` turns the server's `Board` into the runs list on screen 1: one row per live plan, with where it is and its state. `buildPipeline(repo, planSlug, now)` in `packages/model/src/pipeline.ts` turns one plan into the pipeline (stages of steps) and the slice log below it. Both are pure and never throw; the web app calls them on each `board` event and every 30 s, so live minutes move without a new event.

`pipeline.ts` also holds the join rules both use: `roleOf` (what an agent does for a plan), `isPlanAgent`, `handBackPr`, `pendingHandBack`, `isHalted`, `isBlockedSlice`, and `isSliceDone` (the ported `isDone` on a `SliceModel`).

## Joins

- **Agent → plan.** `a.plan` is the plan's slug, `a.sprint` is one of its sprints, or the agent has a role in it (below). Why the last part: a slice-only dispatch, a wave fix, or the fix pass may carry no plan slug.
- **Agent → role**, first match wins:
  - a `pod:reviewer` whose `a.plan` is the plan → a **review round**; another plan's reviewer → nothing.
  - an engineer on branch `<plan>-fix` → the **fix pass**.
  - an engineer on branch `<sprint>-w<N>-fix`, with `<sprint>` one of the plan's → **wave N's fix**. It counts toward the wave's time and tokens, never a slice row.
  - `a.slice` with `a.sprint` → that sprint's slice, when that sprint's board has the code; `a.slice` with no `a.sprint` → the first sprint, in plan order, whose board has the code.
  - else nothing. A slice code no board has, or a sprint of another plan, joins no slice.
- **Running** is `agentState(a, now) === 'running'`. A stale agent (silent 30 min) counts as not running everywhere.
- **Hand-back PR.** N from the last pending queue entry of the plan whose route starts with `orchestrator`, whose body matches `/complete|final PR|hand-?back|awaiting/i`, and that links `/pull/<N>`. It's **pending** until `repo.prs` says PR N merged. Why: pod leaves the hand-back entry pending after the PR merges.
- **Halted.** The plan's queue has a pending `BLOCKED` entry whose route starts with `orchestrator`.
- **Blocked slice.** Status `blocked` or `skipped`, or a PR cell that says `blocked` or `skipped`.

## Runs list

- **Which plans.** One run per plan that isn't `archived` and isn't finished. Finished means every sprint is done, no hand-back is pending, it isn't halted, and none of its agents runs. Why the last three: the final review runs after the last sprint is done and before any hand-back exists, and a halted final review must stay on screen.
- **One run per repo instead** when the repo has `error` set (`where` is the error), its docs are unsupported (`where: 'update pod'`), or it has no plan that is a run (`state: 'idle'`, `where: 'no active plan'`). An error wins over unsupported, since a missing folder also reads as unsupported.
- **State**, first match wins:
  1. `blocked`: halted, or a blocked slice in the current sprint.
  2. `needs-you`: any queue item of the plan with `needsYou`.
  3. `running`: an agent of the plan runs, or a slice in the current wave is `pushed`.
  4. `idle`.
- **Where.**
  - A current sprint with a doc and waves → `<sprint> · wave <w>/<n>`: `w` is `currentWave`, else the last wave (every slice done but the sprint not closed yet). `n` is the last wave's number.
  - A current sprint with no doc (or an empty board) → `<sprint> · drafting` while a running `pod:sprint-planner` names the plan, else `<sprint> · not drafted`.
  - No current sprint → `final review` while one of its reviewers runs, `final PR` with a pending hand-back, else `all sprints done`.
- **Port base.** From a claim for the plan, else the plan's `Port base:` line; absent when neither has one.
- **Order.** By state (`blocked`, `needs-you`, `running`, `idle`, `unsupported`, `error`), then repo name, then plan slug. Names compare without case.
- **`activeRuns(runs)`** counts `blocked`, `needs-you`, and `running`.

## Pipeline

`undefined` for a plan the repo doesn't have, which also covers error, unsupported, and empty repos. Stages:

- **Plan** (caption `Plan`): `Plan` done (`<n> sprints`); `Go` unknown, `not recorded yet` (pod doesn't record it).
- **One per sprint** (caption `Sprint i of n`):
  - a done sprint → one done step, `<k> waves`.
  - the current sprint with waves → one step per wave (`Wave <w>`).
  - the current sprint with no waves → live `drafting` while its planner runs, else wait `not drafted`.
  - any other sprint → one wait step: `<s> slices planned` when it has a doc with slices, else `not drafted`.
- **Check**: `Final review` is live while a reviewer runs (`round <r>`: its round, else its place by start time), done once one has run (`<k> rounds`), else wait `not started`. `Fix pass` is the same for fix-pass engineers (`pass <i>`, `<k> passes`), else wait `only if review fails`.
- **Ship**: `Final PR` is `you` with a pending hand-back (`PR #N · you merge`), done when it merged (`merged PR #N`), else wait `not open yet`.

**Wave step state**, first match wins:

1. `blocked`: a blocked slice.
2. `you`: a `needsYou` queue item of the plan names a slice of this wave, with `sprint:` this sprint or none.
3. `done`: every slice `isSliceDone`.
4. `live`: it's the current sprint's `currentWave`, a slice is `pushed`, or one of its agents runs.
5. `wait`.

**Wave detail.** Its agents are its slices' agents plus its wave fix.

| State | Detail |
|-------|--------|
| wait | `<s> slices planned` |
| live | `<k> engineers · <m> min so far` |
| any other state | `<k> engineers · <m> min · <t> tok` |

- With no agents, the detail is `<s> slices`, so time and tokens are never shown as 0.
- Minutes run from the earliest `startedAt` to the latest `lastAt` (to `now` while live), rounded. They're left out when no agent has times.
- Tokens use `formatTokens` and are left out when 0.
- Counts are singular at 1 (`1 engineer`, `1 slice planned`).

**Slice log.** One group per wave of every sprint with a doc, in sprint order, then wave order. The label is `Sprint i · wave w`. Status, first match wins:

1. `blocked`.
2. Every slice done → `merged PR #N` (the first PR number in the wave), or `merged` with no number. Older boards have done slices with no link.
3. `PR #N open`.
4. `running` (the wave is live, as above).
5. `planned`.

Each row holds the slice's code, title, model, and confidence (absent for `—`). Its minutes and tokens come from that slice's agents, left out with none. `live` is set while one of them runs.

## Screen 1 states

The web app's `screens/runs/view.ts` decides these; `RunsScreen.tsx` only renders them.

- **Banners** (`banners(board, stream)`), above the main view, in this order, each a chip plus one line, with a left edge in the chip's colour:
  1. `lost · retrying` (blocked colour): the server stream is lost; the last board stays on screen.
  2. `config unreadable` (blocked colour): the Board has `configError`. The repo list may be out of date; the board never overwrites the file.
  3. `gh missing` or `gh logged out` (needs-you colour), with `Last checked HH:MM.` (local time) when `ghCheckedAt` is set. `ok` and `unknown` give none, so a board that hasn't checked yet shows nothing.
- **Empty main view** (`emptyMessage(run, repo)`): an error names the folder problem; unsupported docs name the version (`version N; Pod Board reads version 2`) or say there is none (an older pod); a repo with no plan and an unknown plan keep their messages. No repos at all shows `No repos yet`.
- **Theme boot.** An inline script in `index.html`, before the module script, sets `data-theme` from a stored `light` or `dark` pick (`pod-board-theme`, the same `THEME_KEY`). Missing, unknown, or throwing storage does nothing. A `color-scheme` meta and two `:root[data-theme]` rules make the browser's own canvas follow it. Why: in dev, Vite loads the CSS from the module script, so without them a Dark pick paints white first.

## Watch out

- A `→ human` PENDING note stays pending after its wave merges, so a finished wave with such a note reads `you`, and its plan reads `needs-you`. That's the rule as planned: `you` beats `done`. On this repo, sprint server-runs wave 1 shows `you` for the L1 contrast note.
- A slice-only agent (no sprint, no plan) can join two plans when both have a board with that code. Real dispatches always name the sprint.
- Agents are kept only for the transcript window (`POD_BOARD_TRANSCRIPT_DAYS`, default 30), so older waves lose their time and tokens and read `<s> slices`.

## History

- 2026-10-18: added in sprint server-runs (slice P1).
- 2026-10-19: banners, docs version messages, and theme boot added in sprint board-engineer (slice X1).

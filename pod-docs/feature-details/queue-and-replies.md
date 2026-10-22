# Queue and replies

## What it is

Which reply pod waits for on a run, and the chat to paste it in. The board never sends a reply: it names the word, says why, and gives the session id and `claude --resume <id>` to copy. The rules are pure in `packages/model/src/replies.ts` (`runReplies`, `replySession`, `SEND_SIGNALS`); the panel that shows them is in [runs-and-pipeline.md](runs-and-pipeline.md#reply-panel).

## How it works

- **Words.** `continue`, `go`, and `try`. Each reply has a signal, a `why`, and `pr` when the `why` names one. At most one entry per word.
- **Plan run** (`run` is the plan slug). Nothing when the plan isn't on the runs list (`isRun`), is halted, or any of its agents runs (engineer, planner, reviewer, reporter). Else the first that applies:
  1. `final-waiting`: a pending hand-back PR N → `continue` (`Merge PR #N, then reply continue.`) and `try` (`Starts the app so you can try it.`). A closed hand-back PR still counts as waiting.
  2. `final-merged`: the hand-back's PR is merged on `prs` and its entry still pending → `continue` (`PR #N merged: pod cleans up.`).
  3. `wave-waiting`: a current-sprint wave with a PR waiting on you (`waveWaitingPr`) → `continue` (`Merge PR #N, then reply continue.`).
  4. `wave-merged`: a current-sprint wave, not blocked or done, every unfinished slice `pushed`, and an unfinished slice's PR that `gh` reports merged → `continue` (`PR #N merged.`). A PR `gh` doesn't know is not merged.
  5. `sprint-done`: the current sprint has no doc and an earlier sprint is `done` → `continue` (`Sprint <slug> is done.`, the latest done sprint before it).
  6. `not-started`: the plan isn't archived, has at least one sprint, and every sprint is `planned` with no doc → `go` (`Only if pod asked for go.`).
- **Fix run** (`run` is `fix-<slug>`, a listed fix run). Nothing while one of its agents runs. A reviewed open PR (`fixWaitingPr`) → `fix-waiting` `continue` (`Merge PR #N, then reply continue.`); its PR merged while the run is listed → `fix-merged` `continue` (`PR #N merged.`).
- **Pod already waits for `continue`** only on `wave-merged`, `sprint-done`, `final-merged`, and `fix-merged` (`SEND_SIGNALS`). The `*-waiting` signals need your merge first.
- **Session** (`replySession`). From the run's agents (a plan's `isPlanAgent` agents; a fix run's engineers and reviewers, `fixRunAgents`), the one with the newest `lastAt`; ties go to the newer `startedAt`, then the smaller agent id. Agents with no `lastAt`, or an empty `session`, don't count. `id` is its `session`; `startedAt` is the earliest start of any agent of the repo in that session; `resume` is `claude --resume <id>` only when the id matches `^[A-Za-z0-9-]{1,64}$`. No agent → none.

## Why it's this way

- **`go` is never inferred from transcripts or other signals.** It only shows on a plan nothing has started on, and its `why` says to send it only if pod asked: a wrong `go` starts work the human didn't mean to start.
- **No reply while pod works or is halted:** a reply sent mid-turn queues behind pod's work, and a halt needs the human to answer the queue entry, not a `continue`.
- **The session comes from subagent transcripts only.** The main chat is never read, so its start is the earliest subagent start in that session, not the chat's own start.
- **`resume` only for a plain id:** the command is meant to be pasted into a shell, so an id with spaces or shell characters gets no command.
- **Copying is not an action:** no request, nothing in the action log.

## Watch out

- The session is the one whose agent wrote last. If the human started a new chat for the same run with no agents yet, the panel still names the old session.
- A plan with all sprints `planned` and no doc reads `go` even if pod never asked for it. The `why` carries that warning.
- `cd "<path>"` doesn't escape a `"` in the repo path.

## History

- 2026-10-21 · queue-and-replies R1 · added: `runReplies`, `replySession`, `fixRunAgents`, and the Reply panel.

# Queue and replies

## What it is

Which reply pod waits for on a run (`continue`, `go`, or `try`), why, and the chat to paste it in: the session id and `claude --resume <id>` to copy. The same rules decide which reply the board may send itself, from a button or with the run's auto-continue toggle on ([resume.md](resume.md)). The rules are pure, in `packages/model/src` (replies and auto-continue); the Reply panel is in [runs-and-pipeline.md](runs-and-pipeline.md#reply-panel).

## How it works

- **No reply** while the run isn't listed, is halted, or any of its agents runs.
- **Plan run, first match:**
  1. `final-waiting`: a pending hand-back PR → `continue` (merge first) and `try`.
  2. `final-merged`: the hand-back's PR merged, entry still pending → `continue`.
  3. `wave-waiting`: a current-sprint wave PR waiting on you → `continue` (merge first).
  4. `wave-merged`: a wave whose unfinished slices are all `pushed` and whose PR `gh` reports merged → `continue`.
  5. `sprint-done`: the current sprint has no doc and an earlier one is `done` → `continue`.
  6. `not-started`: a live plan whose sprints are all `planned` with no doc → `go`, "Only if pod asked for go."
- **Fix run:** a reviewed open PR → `fix-waiting` `continue` (merge first); its PR merged → `fix-merged` `continue`.
- **Sendable:** `continue` only on `wave-merged`, `sprint-done`, `final-merged`, or `fix-merged` (pod already waits for it); `go` only on `not-started`. `try`, the `*-waiting` signals, and queue answers are never sendable.
- **Stop key:** each reply carries a key naming one pod stop (`<signal>:<pr>`, `sprint-done:<sprint>`, `not-started:<plan>`), never built from the text. Auto-send sends a key once.
- **Auto-send:** for each toggle on, in order: repo on the Board, a sendable `continue` whose key isn't the toggle's last key, a session with a safe id, and that session idle. At most one send per session. It only ever sends `continue`.
- **Session:** of the run's agents, the one that wrote last; its `session` is the id, its start is the earliest agent start in that session. `claude --resume <id>` only when the id matches `^[A-Za-z0-9-]{1,64}$`.
- **Queue answers:** an entry is answerable when it is `PENDING` or `BLOCKED`, addressed to `human`, still pending, and has no answer. Only a `**Answer (human):**` marker after the entry's `**Resolution:**` counts as its answer.

## Why it's this way

- **`go` only from a button** ([decision](../decisions.md#2026-10-21--go-only-from-a-button)): a wrong `go` starts work the human didn't mean to start. Turned down: inferring "waiting for go" from transcripts. The Go row shows on any fresh plan, and its `why` says to send it only if pod asked.
- **A toggle per run, off by default** ([decision](../decisions.md#2026-10-21--a-continue-toggle-per-run)): `continue` only on clear disk signals; any stop without one gets no automatic send. Trade-off: a stop that pod waits on but the board can't see still needs a press or the chat.
- **No reply while pod works or is halted:** a reply sent mid-turn queues behind pod's work, and a halt needs a queue answer, not `continue`.
- **The key names the stop, not the text:** a new wave or sprint makes a new key, so one stop is sent once, even after a restart.
- **The session from subagent transcripts only** ([plan](../plans/board-actions.md#key-decisions)): pod doesn't record its session id yet, and the board never reads the main chat or prompt text.
- **`resume` only for a plain id:** the command is meant for a shell; an id with shell characters gets none.
- **Copying isn't an action:** no request, nothing logged.

## Watch out

- pod archives a plan before its final merge, so `final-merged` comes on an archived plan. The plan must stay a run while its hand-back entry is pending, even after the merge and long after its last agent wrote, or the reply and the auto-send vanish while pod still waits (review round 1 of #33).
- A queue body can quote `**Answer (human):**` (pod's own gate entries do). A marker before the `**Resolution:**` is body text, not an answer (review round 1 of #33).
- The session is the one whose agent wrote last; a new chat for the same run with no agents yet still shows the old session.
- A fresh plan reads `go` even if pod never asked for it.
- The `cd` line is `cd '<path>'` for a POSIX path (each `'` written `'\''`) and `cd "<path>"` for a Windows path. PowerShell and Git Bash still expand a `$` inside the Windows form.

## History

- 2026-10-21 · queue-and-replies R1 · added: `runReplies`, `replySession`, `fixRunAgents`, and the Reply panel.
- 2026-10-22 · resume-runs M1 · added: the stop `key` on each reply, `sendableReply`, and `autoSends`.
- 2026-10-22 · board-actions plan fix · fixed: `final-merged` on an archived, claimed plan after the final merge (it gave no reply); an entry quoting the answer marker in its body now stays answerable.
- 2026-10-22 · board-actions · plan complete; final PR #33 passed review at round 2 after fix PR #34 · [report](../reports/board-actions.html)
- 2026-10-23 · fix-hardening-2 · fixed: the copied `cd` single-quotes a POSIX path, so `$(...)` and backticks in it don't run.

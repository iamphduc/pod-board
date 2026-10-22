# Sprint: Resume runs from the board

_From plan: pod-docs/plans/board-actions.md · Slug: resume-runs · Status: active · Generated: 2026-10-22_

<!-- autopilot-run: started=2026-10-21T23:01:35-07:00 sprints=1 waves=3 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | K1 | Spike: headless resume on a throwaway session, and the claude runner | resume-runs-K1 | — | pending | — | — |
| 1 | M1 | Resume model: sendable replies, stop keys, auto-send rule, resume log entries | resume-runs-M1 | — | pending | — | — |
| 2 | S1 | Resume and auto-continue routes, the toggle store, and the automatic check | resume-runs-S1 | — | pending | — | K1, M1 |
| 2 | U1 | The auto-continue switch in the run bar, and Continue and Go buttons | resume-runs-U1 | — | pending | — | K1, M1 |

## Shared contract

Times are epoch ms. The merge-actions and queue-and-replies contracts (token, action guard, `postAction`, action log, `runReplies`, `replySession`, `SEND_SIGNALS`, Look classes) stand unless changed here. Decisions in force: [a Continue toggle per run](../decisions.md#2026-10-21--a-continue-toggle-per-run), [`go` only from a button](../decisions.md#2026-10-21--go-only-from-a-button), and the plan's Constraints (the human's own `claude` login, never an API key or `--bare`).

**The spike gate.** K1 ends its result file `pod-docs/research/resume-spike.md` with exactly one line `verdict: go` or `verdict: no-go — <check that failed>`. On `no-go`, K1 files a `BLOCKED` (engineer → human) queue entry, and the orchestrator stops after wave 1: wave 2 never starts, and copy-the-reply stays the way to continue. `Depends on` only orders the waves; this line is what halts. `no-go` when: headless resume fails on this machine (Windows), Anthropic's current rules forbid it, or two processes on one session break it in a way the idle rule below doesn't prevent. macOS and Linux get the runner tests in CI (a fake `claude`) and a `PENDING` for the human to run the spike script there once; that gap doesn't halt.

**Stop key** (M1, `RunReply` gains `key: string`): names one pod stop, so a stop gets one automatic send. `<signal>:<pr>` when `pr` is set; `sprint-done:<done sprint slug>`; `not-started:<plan slug>`; the `final-waiting` `try` reply (which has no `pr`) → `try:<plan slug>`. Never built from `why` text.

**Sendable reply** (M1, `packages/model/src/auto-continue.ts`): `sendableReply(repo: BoardRepo, run: string, word: 'continue' | 'go', now: number): RunReply | undefined`.
- `continue`: the run's `continue` reply when its signal is in `SEND_SIGNALS`. The `*-waiting` signals are never sendable: their Merge comes first.
- `go`: the run's `go` reply (`not-started`).
- `try` and queue answers are never sendable. The route and the buttons both use this one rule.

**Auto-send rule** (M1): `autoSends(board: Board, toggles: AutoToggle[], now: number, idle: (repo: BoardRepo, session: string) => boolean): AutoSend[]`, with `type AutoToggle = { repoId: string; run: string; lastKey?: string }` and `type AutoSend = { repoId: string; run: string; session: string; key: string }`. A toggle yields a send only when all hold:
- its repo is on the Board, and `sendableReply(repo, run, 'continue', now)` gives a reply whose `key` isn't the toggle's `lastKey`;
- `replySession` gives a session with `resume` set (a safe id);
- `idle(repo, session)` is true.

At most one send per session. It never yields `go`, `try`, or an answer, for any signal, with any toggle.

**Idle session** (S1): the orchestrator session's own transcript `<claude dir>/projects/<projectDirName(repo.path)>/<session>.jsonl` exists and was last modified at least `SESSION_IDLE_MS = 60_000` ago. The board only checks its modified time and never opens the file (the main chat isn't read). A missing file is not idle. K1 confirms this path.

**Runner** (K1, `packages/server/src/claude-runner.ts`):
```ts
type ResumeWord = Exclude<ReplyWord, 'try'>
type StartResult = { outcome: 'started' | 'failed'; message?: string }
claudeBin(env: Env): string                     // POD_BOARD_CLAUDE_BIN, else 'claude'
createClaudeRunner(o: { bin: string; logDir: string; env?: NodeJS.ProcessEnv; windowMs?: number }): {
  start(r: { session: string; word: ResumeWord; cwd: string }): Promise<StartResult>
  isRunning(session: string): boolean            // a child this runner started for it is still alive
}
```
- Arguments are exactly `-p --resume <session> <word>`. Nothing else, never `--bare` or a permission flag. The working folder is `cwd`, the repo path.
- The child env is the board's minus `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, matched in any case. So the run uses the human's login.
- Failures:
  - A session that doesn't match `^[A-Za-z0-9-]{1,64}$` → `failed`, `bad session id`, and nothing runs.
  - The binary isn't found → `failed`, `claude not found`.
- The result window is `windowMs`, default `RESUME_WINDOW_MS = 10_000`:
  - Still alive at the end → `started`.
  - Exited 0 within it → `started`.
  - Exited non-zero within it → `failed`, with the stderr tail: escape codes removed, at most 500 chars, empty → `claude exited with code <n>`.
- The child is detached, so stopping the board never stops a run. stdout is discarded and stderr goes to a file under `logDir`, never a pipe the board stops reading.

**Action log** (M1 types, S1 writes):
```ts
type ResumeOutcome = 'started' | 'failed'
type ResumeResult = { outcome: ResumeOutcome; message?: string; logged: boolean }
ActionEntry gains | { action: 'resume'; result: ResumeOutcome; reply: 'continue' | 'go'; auto: boolean }
```
`target` is `<run> · <word>`. Chips: started → ok, failed → bad. An automatic entry reads `auto` in the list. Turning the toggle on or off isn't logged.

**Board** (M1 type, S1 fills): `Board.autoContinue?: { repoId: string; run: string }[]`, the runs whose toggle is on. Missing means all off.

**Routes** (S1, behind the action guard). Each takes the repo from the current Board by `repoId`, never a path.
- `POST /api/actions/resume` `{ repoId, run, reply: 'continue' | 'go' }` → `200 ResumeResult`. The checks run in this order, and nothing runs or is logged before they all pass:
  1. Shape wrong, or `reply` isn't one of the two → `400 { error: 'bad request' }`.
  2. Repo not on the Board, or `sendableReply` gives nothing → `404 { error: 'not waiting on you' }`.
  3. No `replySession`, or it has no `resume` → `404 { error: 'no session' }`.
  4. Session not idle → `409 { error: 'session is busy' }`.
  5. A resume request in flight for that session, or `isRunning(session)` → `409 { error: 'resume in progress' }`.

  Then the runner starts. One `auto: false` entry is logged. A `continue` sets that toggle's `lastKey` to the reply's `key`, when the run has a toggle. The Board is rebuilt before the response.
- `POST /api/actions/auto-continue` `{ repoId, run, on: boolean }` → `200 { on }`.
  - Shape wrong → `400`. The run isn't a listed plan or fix run of that repo → `404 { error: 'not a run' }`.
  - Turning on adds the toggle with no `lastKey`, so a stop already showing gets sent at the next check (turning on again is how to retry a failed send). Turning off removes it.
  - A save that fails → `500 { error: "Couldn't save the toggle." }`, with the toggle unchanged.
  - The Board is rebuilt before the response.

**Toggle store** (S1): `<config dir>/auto-continue.json` = `{ "runs": AutoToggle[] }`, written atomically (temp file + rename), owner-only on POSIX. Missing, unreadable, or bad entries → treated as off (fail closed). The next toggle write replaces a bad file. A toggle whose run is no longer listed is kept but never sends.

**Automatic check** (S1): runs on each new Board and every `AUTO_TICK_MS = 15_000` (idle depends on time passing). For each `autoSends` result whose session has no request in flight and no running child, it does these steps in order:
1. It saves `lastKey = key`. If the save fails, nothing is sent or logged, and the next check tries again.
2. It starts the runner.
3. It logs an `auto: true` entry, whatever the result.
4. It rebuilds the Board.

A failed send isn't retried for that stop, because the key is saved. After a restart, the saved `lastKey` keeps a stop from being sent twice.

**Look.** No slice edits `packages/web/src/theme/`. `.switch`, `.btn.primary`, `.btn.quiet`, `.inplace`, and chips cover this sprint. Screen CSS uses tokens only and follows the plan's `## Look`.

**Queue.** No `BLOCKED` is pending. Two `PENDING` entries wait on the human's choice. This sprint builds on the value in use for both: a closed hand-back PR still counts as waiting, and unlisted plans' entries show nowhere. None of the other entries is work for this sprint.

## Per-slice detail

### K1: Spike: headless resume on a throwaway session, and the claude runner
- **Scope:** Build the Runner per the contract, then use it for the spike.
  - **Never** resume a real pod session or send to a real run. Create a throwaway session with a one-word prompt in a new empty temp folder. Afterwards, remove the temp folder and its `~/.claude/projects` folder.
  - Write `packages/server/scripts/resume-spike.ts`. It does the whole spike unattended, so the human can rerun it on macOS and Linux. It creates the throwaway session and reads its id; check that `claude -p … --output-format json` really gives the id. It then resumes the session with `continue` through the runner and reports the result.
  - Record each check in `pod-docs/research/resume-spike.md`, with sources and the dates you read them, ending with the verdict line:
    1. Resume works headless on this OS with the human's login. Check whether the session id stays the same or forks, and confirm the main transcript path the Idle session rule uses.
    2. Anthropic's current rules allow headless `claude -p` with the human's own subscription login. Quote and link the pages you read. Don't rely on memory.
    3. Two processes on one session: run two resumes of the throwaway at once, read its jsonl afterward, and say whether the conversation splits and whether the 60 s idle rule prevents that for the board.
    4. Whether a resumed `-p` run uses the tools the project's settings allow, or denies them. An echo through Bash in the temp folder is enough. If pod's tools would be denied, that is `no-go`.
  - This engineer runs inside Claude Code, and the board server doesn't. Record which env the spawned `claude` saw. If `claude` refuses or misbehaves because it's a nested launch, rerun from a plain shell, or with Claude Code's session variables removed. If it still can't run, mark that check inconclusive, not `no-go`.
  - Tests kill every fake child in teardown. A stray process left in the worktree blocks wave cleanup on Windows (`pod-docs/known-issues/worktree-folder-locked-on-windows.md`).
  - On Windows, find how `claude` is installed (`.exe` or an npm `.cmd` shim) and make the runner work with both, with no shell built from request data.
  - On `no-go`, file the BLOCKED entry per the gate. On `go`, file a `PENDING` → human to run the script once on macOS and Linux.
  - Not in scope: routes, toggles, or UI.
- **Files owned:** `packages/server/src/claude-runner.ts` (new), `packages/server/src/claude-runner.test.ts` (new), `packages/server/test/fake-claude.mjs` (new; a fake binary the tests install as `claude` / `claude.cmd` in a temp folder: it records its argv and env, then exits or waits as told), `packages/server/scripts/resume-spike.ts` (new), `pod-docs/research/resume-spike.md` (new)
- **Success criteria:**
  - `[test] arguments are exactly -p --resume <id> <word>, never --bare — packages/server/src/claude-runner.test.ts › passes only the resume arguments`
  - `[test] ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN (any case) are not in the child env; other env passes — claude-runner.test.ts › strips api keys from the env`
  - `[test] a bad session id fails with bad session id and spawns nothing — claude-runner.test.ts › refuses an unsafe session id`
  - `[test] a missing binary → failed, claude not found — claude-runner.test.ts › reports claude not found`
  - `[test] a child still alive at the window's end → started, and isRunning is true until it exits — claude-runner.test.ts › started when still running`
  - `[test] exit 0 inside the window → started — claude-runner.test.ts › started on a quick clean exit`
  - `[test] non-zero exit inside the window → failed with the cleaned stderr tail, empty stderr → claude exited with code <n> — claude-runner.test.ts › failed with the stderr tail`
  - `[test] the child runs in cwd and isn't killed when the runner is dropped (detached) — claude-runner.test.ts › runs detached in the repo folder`
  - `[test] on win32 a .cmd shim on PATH runs with the same fixed arguments — claude-runner.test.ts › runs a cmd shim on windows` (skipped off Windows; CI's Windows job runs it)
  - `[test] claudeBin reads POD_BOARD_CLAUDE_BIN, else claude — claude-runner.test.ts › picks the claude binary`
  - `[manual] the spike ran on a throwaway session only; resume-spike.md records the four checks with sources and ends in one verdict line — read the file and its script`
- **Depends on:** —
- **One-way door:** none. It only resumes a throwaway session made for the spike.
- **Model:** opus

### M1: Resume model: sendable replies, stop keys, auto-send rule, resume log entries
- **Scope:**
  - Add `key` to `RunReply` per Stop key.
  - Add `sendableReply` and `autoSends` per the contract, pure, in `auto-continue.ts`, exported from the model.
  - Add the resume types and `Board.autoContinue`.
  - Widen the action log view: started and failed chips, an `auto` marker on automatic entries, and a `target` read as `<run> · <word>`.
  - Update `queue-and-replies.md` with the key and the sendable rule.
  - Not in scope: I/O, or any change to which replies `runReplies` gives.
- **Files owned:** `packages/model/src/replies.ts`, `packages/model/src/replies.test.ts`, `packages/model/src/auto-continue.ts` (new), `packages/model/src/auto-continue.test.ts` (new), `packages/model/src/actions.ts`, `packages/model/src/board.ts`, `packages/model/src/index.ts`, `packages/web/src/screens/runs/action-log-view.ts`, `packages/web/src/screens/runs/action-log-view.test.ts`, `pod-docs/feature-details/queue-and-replies.md`
- **Success criteria:**
  - `[test] each signal gets its key (pr, sprint slug, plan slug, try:<plan slug>); two waves' merged PRs get different keys — packages/model/src/replies.test.ts › stop keys name one stop`
  - `[test] continue is sendable only on SEND_SIGNALS; wave-waiting, final-waiting, fix-waiting give nothing — packages/model/src/auto-continue.test.ts › continue only where pod waits for it`
  - `[test] go is sendable only on not-started; try never — auto-continue.test.ts › go only on a fresh plan, try never`
  - `[test] autoSends never yields go: toggle on a not-started plan and on every signal → no send and no go — auto-continue.test.ts › never sends go`
  - `[test] no toggle → no send; toggle on with a send signal, idle, safe session → one send with its key — auto-continue.test.ts › sends only for toggled runs`
  - `[test] a key equal to lastKey → no send; a new stop's key → send — auto-continue.test.ts › one send per stop`
  - `[test] not idle, no session, unsafe id, run not listed, or repo gone → no send — auto-continue.test.ts › skips busy or unknown sessions`
  - `[test] two toggled runs on one session → one send — auto-continue.test.ts › one send per session`
  - `[test] resume entries: started → ok, failed → bad, automatic ones marked auto; merge and answer rows unchanged — packages/web/src/screens/runs/action-log-view.test.ts › resume rows`
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### S1: Resume and auto-continue routes, the toggle store, and the automatic check
- **Scope:** Build the Routes, the Toggle store, the Idle session check, and the Automatic check per the contract, using K1's runner and M1's rules.
  - The action log accepts and reads resume lines (with old lines still read).
  - The Board service fills `autoContinue`.
  - Wire it all in `main.ts`, with `logDir` = `<config dir>/resume-logs`.
  - Docs:
    - Write `resume.md`: how resume works, why, and Watch out, including K1's findings that matter.
    - Add the resume entries to `actions.md`.
    - In `codebase-structure.md`, add `POD_BOARD_CLAUDE_BIN` to Env, and the new routes to Parts and the Smoke recipe. The recipe never resumes a real session: it uses a missing `POD_BOARD_CLAUDE_BIN`, an empty `POD_BOARD_CLAUDE_DIR`, and a fixture copy.
  - Tests use a fake runner and a fake clock; no test starts a real `claude`.
  - Not in scope: UI.
- **Files owned:** `packages/server/src/resume-routes.ts` (new), `packages/server/src/resume-routes.test.ts` (new), `packages/server/src/auto-continue-store.ts` (new), `packages/server/src/auto-continue-store.test.ts` (new), `packages/server/src/auto-continue.ts` (new), `packages/server/src/auto-continue.test.ts` (new), `packages/server/src/session-activity.ts` (new), `packages/server/src/session-activity.test.ts` (new), `packages/server/src/action-log.ts`, `packages/server/src/action-log.test.ts`, `packages/server/src/board-service.ts`, `packages/server/src/board-service.test.ts`, `packages/server/src/main.ts`, `pod-docs/feature-details/resume.md` (new), `pod-docs/feature-details/actions.md`, `pod-docs/codebase-structure.md`
- **Success criteria:**
  - `[test] resume checks answer in contract order (400, 404 not waiting, 404 no session, 409 busy, 409 in progress) and none runs or logs — packages/server/src/resume-routes.test.ts › refuses in order and runs nothing`
  - `[test] continue on a wave-waiting run → 404; go on a plan with a started sprint → 404; reply try → 400 — resume-routes.test.ts › sends only sendable replies`
  - `[test] a passing request starts the runner once with the session, word, and repo path, logs auto false, rebuilds before the response — resume-routes.test.ts › starts and logs a resume`
  - `[test] a failed start → 200 failed with its message, logged — resume-routes.test.ts › logs a failed start`
  - `[test] a second request while the first is starting → 409 resume in progress — resume-routes.test.ts › one resume per session`
  - `[test] a log append that fails → logged false, response otherwise the same — resume-routes.test.ts › reports an unlogged resume`
  - `[test] a request with no token → 403 bad token through createApp — resume-routes.test.ts › sits behind the action guard`
  - `[test] toggle on/off → 200, saved, Board autoContinue updated; not a listed run → 404 — resume-routes.test.ts › toggles auto-continue`
  - `[test] a failed toggle save → 500 and the toggle unchanged — resume-routes.test.ts › keeps the toggle when saving fails`
  - `[test] store: missing or bad JSON → all off; bad entries skipped; written atomically; on clears lastKey; off removes — packages/server/src/auto-continue-store.test.ts › reads fail closed and writes atomically`
  - `[test] idle: modified 60 s ago or more → idle; 59 s → busy; missing file → busy; only stat, never read — packages/server/src/session-activity.test.ts › idle after 60 s of quiet`
  - `[test] toggle off → nothing sent on any Board; toggle on with a send stop → one auto send, logged auto true — packages/server/src/auto-continue.test.ts › sends only with the toggle on`
  - `[test] the same stop across new Boards, ticks, and a restart (store reloaded) → sent once; a failed send isn't retried — auto-continue.test.ts › one send per stop, across restarts`
  - `[test] a session that turns idle with no Board change is sent on the next 15 s tick — auto-continue.test.ts › checks on a tick`
  - `[test] lastKey save fails → nothing sent or logged, retried next check — auto-continue.test.ts › no send without a saved key`
  - `[test] a running child or in-flight request for the session → no auto send — auto-continue.test.ts › skips a session already resuming`
  - `[test] with the toggle on, a not-started plan never gets go, from the check or a tick — auto-continue.test.ts › never sends go`
  - `[test] resume lines read back after restart; merge and answer lines still read; a resume line with a merge result is skipped — packages/server/src/action-log.test.ts › reads resume entries`
  - `[test] Board.autoContinue lists the toggled runs; no dep → no field — packages/server/src/board-service.test.ts › carries auto-continue toggles`
- **Depends on:** K1, M1
- **One-way door:** none. It resumes the human's own session with their own login, as they chose in decisions.md 2026-10-21. It's off by default and logged, and nothing is destroyed or sent to other people.
- **Model:** opus

### U1: The auto-continue switch in the run bar, and Continue and Go buttons
- **Scope:**
  - **The switch.** A `.switch` (`role="switch"`, `aria-checked`) labeled `auto-continue` in the run bar next to the state chip, for plan and fix runs (not repo rows). It's shown whether or not a reply is waiting. Its state comes from `Board.autoContinue`, and toggling posts `/api/actions/auto-continue`. While the request runs, it's disabled. A failure reverts it and shows the message in place.
  - **The buttons.** In the Reply panel, the row whose word `sendableReply` allows gets a button beside its Copy: `Continue` (`.btn.primary`) or `Go` (`.btn.primary`). `try` and the `*-waiting` rows get none. Pressing it posts `/api/actions/resume` once, with the button disabled while in flight. The result shows in place: started → a short line that the session started again, and that a terminal open on it won't show the board's send (use `claude --resume <id>` to see it). failed or an error → its message.
  - Logic goes in `resume-flow.ts` and `reply-view.ts`; the components are glue.
  - Use only the tokens and follow the plan's `## Look`.
  - Not in scope: theme files, or the action log view.
- **Files owned:** `packages/web/src/screens/runs/resume-flow.ts` (new), `packages/web/src/screens/runs/resume-flow.test.ts` (new), `packages/web/src/screens/runs/AutoContinueSwitch.tsx` (new), `packages/web/src/screens/runs/ReplyPanel.tsx`, `packages/web/src/screens/runs/reply-view.ts`, `packages/web/src/screens/runs/reply-view.test.ts`, `packages/web/src/screens/runs/RunsScreen.tsx`, `packages/web/src/screens/runs/runs.css`, `pod-docs/feature-details/runs-and-pipeline.md`
- **Success criteria:**
  - `[test] rows get send continue only on SEND_SIGNALS, send go only on not-started, none on try or *-waiting — packages/web/src/screens/runs/reply-view.test.ts › send buttons follow sendableReply`
  - `[test] rows keep their word and why, and the session line, cd, and resume commands are unchanged next to the new buttons — reply-view.test.ts › rows keep word, why, and session lines`
  - `[test] switch view: on when the run is in autoContinue, off when missing or the field is absent; none for a repo row — packages/web/src/screens/runs/resume-flow.test.ts › switch state from the Board`
  - `[test] toggling posts {repoId, run, on} to auto-continue; a failure returns the previous state and the message — resume-flow.test.ts › toggle posts and reverts on failure`
  - `[test] pressing sends {repoId, run, reply} once; a second press while in flight sends nothing — resume-flow.test.ts › one send per press`
  - `[test] started → the started line with the resume hint; failed → its message; 409, 404, and postAction errors → their message — resume-flow.test.ts › result text`
  - `[manual] the switch sits next to the state chip, reads auto-continue, and shows on/off by knob position in both themes; at 375 px it and the buttons are 44 px tall and stack — open a fixture run at 1280 px and 375 px`
  - `[manual] Continue/Go appear only on their rows, beside Copy; the result shows in place; Copy still copies — open a fixture with a sprint-done run and a fresh plan, with POD_BOARD_CLAUDE_BIN pointing at a missing path`
- **Depends on:** K1, M1
- **One-way door:** none
- **Model:** opus

# Resume

## What it is

The board can send `continue` or `go` to a pod run's own Claude session, so you don't have to paste the reply into the chat. It runs `claude -p --resume <session> <word>` with your own login. A send starts from a button (`POST /api/actions/resume`), or, for `continue` only, from the automatic check when the run's auto-continue toggle is on (`POST /api/actions/auto-continue`). Every send goes in the action log. The server side is `packages/server/src/resume-routes.ts`, `auto-continue.ts` (the automatic check and the shared send step), `auto-continue-store.ts` (the toggles), `session-activity.ts` (the idle rule), and `claude-runner.ts` (the runner). Which reply may be sent is the model's rule, in [queue-and-replies.md](queue-and-replies.md). The buttons and the switch are on screen 1 (see [runs-and-pipeline.md](runs-and-pipeline.md)).

## How it works

- **Resume route.** `POST /api/actions/resume` `{ repoId, run, reply }`, behind the action guard. The repo comes from the current Board by `repoId`, never a path. The checks run in this order, and nothing runs, is logged, or is rebuilt before they all pass:
  1. A field missing or not a string, or `reply` not `continue` or `go` → `400 bad request`. So `try` is never sent.
  2. Repo not on the Board, or `sendableReply(repo, run, reply, now)` gives nothing → `404 not waiting on you`.
  3. `replySession` gives no session, or one with no `resume` (an id that isn't safe) → `404 no session`.
  4. The session isn't idle → `409 session is busy`.
  5. A resume request for that session is in flight, or the runner's child for it is still alive → `409 resume in progress`.

  Then the session is held, and a `continue` on a run with a toggle saves the reply's `key` as the toggle's `lastKey`. The runner starts. One `auto: false` entry is logged, the Board is rebuilt, and the route answers `200 { outcome, message?, logged }`. A runner that throws is a `failed` start with its message.
- **Auto-continue route.** `POST /api/actions/auto-continue` `{ repoId, run, on }`. A field of the wrong type → `400 bad request`. A run that isn't a listed plan or fix run of that repo (`listRuns`) → `404 not a run`. On adds the toggle with no `lastKey`; on again clears its `lastKey`, which is how to retry a failed send. Off removes it. A save that fails → `500 Couldn't save the toggle.`, and the toggle stays as it was. Then the Board is rebuilt and the route answers `200 { on }`. Turning the toggle on or off isn't logged.
- **Toggle store.** `<config dir>/auto-continue.json` = `{ "runs": [{ repoId, run, lastKey? }] }`, read once at start. A missing or unreadable file, bad JSON, or the wrong shape → all off. Bad entries are skipped, and a second entry for the same run is dropped. Each change writes the whole file to a temp file beside it, then renames it over (retried on `EPERM`, `EBUSY`, `EACCES`), owner-only on POSIX. Changes run one at a time, and memory changes only after the write succeeds. The next write replaces a bad file. A toggle whose run is no longer listed is kept, but it never sends.
- **The Board.** `Board.autoContinue` lists the toggles that are on, as `{ repoId, run }`, read on every build. The stop keys stay in the store.
- **Idle session** (`createIdleCheck`). A session is idle when `<claude dir>/projects/<projectDirName(repo.path)>/<session>.jsonl` exists, and it and every entry under `<session>/subagents/` were last modified at least `SESSION_IDLE_MS` (60 s) ago. A missing main file, a modified time ahead of the clock, or an error on the main file → busy. A missing `subagents/` folder is fine. The check only lists folders and stats files. It never opens a transcript.
- **Automatic check** (`createAutoContinue`). It runs at start, on each new Board the watcher sends, and every `AUTO_TICK_MS` (15 s), because idle depends on time passing. It asks the model's `autoSends` for the sends due now and drops any whose session is in flight or has a running child. It holds each remaining session at once, before anything waits, so a check or a request that comes next skips it. Then, for each send:
  1. It saves `lastKey = key`. If the save fails, nothing is sent or logged, and the next check tries again.
  2. It starts the runner with `continue`.
  3. It logs one `auto: true` entry, whatever the result.
  4. It rebuilds the Board.

  A failed send isn't retried for that stop, because its key is saved. After a restart, the saved `lastKey` keeps a stop from being sent twice. It never sends `go`, `try`, or a queue answer.
- **Shared hold.** The route and the check share one in-memory set of sessions being resumed (made in `main.ts`). With `runner.isRunning`, it keeps the board from starting a second run on one session.
- **Runner.** `createClaudeRunner` in `main.ts` uses `POD_BOARD_CLAUDE_BIN` (else `claude` on `PATH`) and `logDir` `<config dir>/resume-logs`, one stderr file per start. The arguments are exactly `-p --resume <session> <word>`. The child env is the board's without `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, so the run uses your login. The child is detached, so stopping the board doesn't stop a run. `started` means it was still running after 10 s, or exited 0 before that. See `pod-docs/research/resume-spike.md`.
- **Action log.** A resume entry is `{ action: 'resume', result: 'started' | 'failed', reply, auto, target: '<run> · <word>', message? }`. See [actions.md](actions.md).

## Why it's this way

- **One sendable rule.** The route and the buttons use the model's `sendableReply`, so the board can't send a reply pod isn't waiting for. The `*-waiting` signals need your merge first, so they're never sent. `go` starts a whole plan, so it only comes from a button ([decision](../decisions.md#2026-10-21--go-only-from-a-button)).
- **A toggle per run, off by default** ([decision](../decisions.md#2026-10-21--a-continue-toggle-per-run)). It's your session and your usage, so you choose which runs continue by themselves.
- **One send per stop.** The stop key names one pod stop. Saving it before the start means a crash or a restart mid-send can't send the same stop twice. A failed send stays failed until you turn the toggle on again, so a broken setup doesn't retry every 15 s.
- **The idle rule.** Two runs on one session split the conversation (the spike, check 3). A turn in progress writes its transcript every few seconds, so 60 s of quiet means no turn is running. A foreground subagent writes only under `<session>/subagents/`, and the main file can stay quiet for over 60 s while it works, so those files count too. A folder's time doesn't change when a file in it grows, so each file is stated.
- **Times only.** The board never reads the main chat. A stat is enough to tell quiet from busy.
- **Fail closed.** A toggle file the board can't read means off, never on, since a wrong on sends to your session.
- **A manual `continue` saves the key too.** Otherwise the automatic check would send the same stop again after your press. If that save fails, the resume you asked for still runs.

## Watch out

- **Setup: a permission mode.** A resumed `claude -p` run can use tools only when your Claude Code settings give it a permission mode (for example `"defaultMode"` in `~/.claude/settings.json`). Without one, `-p` starts in Manual mode, denies each tool call that needs approval, and the resumed orchestrator stalls. The runner never passes a permission flag. The repo's own `permissions.allow` rules load only once the folder is trusted, which a repo you've opened in Claude Code already is.
- **A terminal still open on the session.** It doesn't show the board's turn. If you type in it after a send, it continues from its own last message, and the conversation splits. Reopen it with `claude --resume <id>` instead.
- **`--bare`.** The headless docs say `--bare` will become the default for `-p`. In bare mode Claude Code never reads your login, so a resume would fail for lack of an API key. The runner must not pass an API key; a future release may need an opt-out flag, which would change the fixed arguments.
- **Your hooks run.** A `-p` run without `--bare` loads your global hooks, so a `Stop` or `Notification` hook fires once per send.
- **A quiet turn.** A turn in one long tool call can leave every file quiet for more than 60 s. A send then only happens if pod also shows a sendable stop while that turn runs.
- **Off for an unlisted run.** The toggle route answers `404 not a run` for a run that isn't listed, even to turn it off. Such a toggle stays in the file but never sends.
- **Tests and smoke runs** use a fake runner or `packages/server/test/fake-claude.mjs`, never the real `claude`, and a temp config folder, never the real `auto-continue.json`.
- The resume logs in `<config dir>/resume-logs` are never trimmed.

## History

- 2026-10-22 · resume-runs S1: the resume and auto-continue routes, the toggle store, the idle check, and the automatic check.

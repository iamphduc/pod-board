# Server

The API server (`packages/server`) finds the repos to show, reads their pod docs, agent transcripts, and port claims, builds one `Board`, keeps it current as files change, and serves it to the web app. It only reads, except for its own config file.

- `board-service.ts` builds the Board on demand (`build`) and asks `gh` about live PRs (`refreshGh`).
- `watcher.ts` watches the files the Board comes from, rebuilds, and tells subscribers when the Board changed.
- `app.ts` holds the routes; `main.ts` only wires the parts together from env.

## Rules

- **Which repos.** Every path in the config file (`configPath`: `POD_BOARD_CONFIG_DIR`, else the OS config folder) plus every repo a claim file in the ports folder names (`POD_BOARD_PORTS_DIR`, else `<os temp>/pod-ports`). They merge by Repo identity: normalized path, compared without case when the folder's file system ignores case (`ignoresCase`, probed once per repo). `source` is `registered`, `claim`, or `both`. The first spelling wins: a registered path over a claimed one. Claims keep their file's port base and plan; their `repoPath` is the repo's normalized path.
- **Unreadable config.** The board keeps the last list it read, and sets `configError: 'config unreadable'` on every build while the file exists but can't be read (bad JSON, another shape, or a newer `version`). A missing file is no error. Why: a config file caught mid-edit would otherwise drop every registered repo from the screen for a moment, and the banner tells the user the list may be stale. Starting with an unreadable file gives no registered repos.
- **Each repo.** `readRepoFiles` → `buildRepoModel`. A folder that's gone or unreadable gets `error` (`repo folder not found`, `not a directory`, or `repo folder unreadable`), the model of no files (unsupported docs), and no agents or PRs; the other repos still build. `name` is the folder's base name; repos sort by name without case, then by path.
- **Agents.** `listAgentFiles` (sessions changed within `POD_BOARD_TRANSCRIPT_DAYS`, default 30) → the reader's cache → `parseAgentTranscript`. Non-pod agents drop out; a transcript deleted mid-read is skipped. The reader's cache follows each listing, so a gone agent's text doesn't stay in memory.
- **PRs.** `gh` is asked only about, per plan that isn't archived, the open PRs (by number) of its current sprint's slices, plus its hand-back PR, from the model's `handBackPr` (the same rule the pipeline's Final PR step uses; see `runs-and-pipeline.md`). `build` reads `gh`'s cache only and never waits on it; `refreshGh` runs one repo at a time (the first settles `gh auth status` for the rest) and asks every readable repo, even one with no live PRs, so the `gh` status is known.
- **Watching.** One chokidar watcher per folder: the config file's folder (only the config file counts; the folder itself is kept too, because chokidar runs `ignored` on the watched folder and would drop it), the ports folder, each repo's `pod-docs/` (two levels down, `.md` files only), and each repo's Claude project folder (only `<session>/subagents/agent-*.jsonl` and `.meta.json`; session logs and tool output are ignored). A folder that doesn't exist yet is watched through its nearest existing parent, so creating it swaps in the real watch. The list is re-synced after every rebuild, so it follows added repos and new claims. After opening a watcher it rebuilds once more, to catch writes made before the watcher was ready. `POD_BOARD_POLL=1` polls every 500 ms instead, and the quiet spell before a rebuild grows by one poll interval (300 + 500 ms). Why: a poller can see one quick burst of writes on two ticks 500 ms apart, and with a 300 ms quiet spell it would rebuild in between and send two boards.
- **Rebuilds.** Any event → rebuild after 300 ms with no further events (800 ms when polling). Rebuilds run one at a time, in order. Every 30 s, and once at start, it refreshes `gh` and rebuilds, which also picks up agents going stale and sessions leaving the window. A rebuild that throws keeps the last Board.
- **Emit only on change.** Subscribers get a Board only when its JSON, without `generatedAt` and each PR's `checkedAt`, differs from the last one sent; `ghCheckedAt` is left out too while `gh` is `ok`. Why: those change on every build or `gh` check, so counting them would send a board every 30 s that shows nothing new. While `gh` isn't `ok`, a new `ghCheckedAt` counts, so the banner's "Last checked" time is the latest check (about once a minute). `generatedAt` is therefore when the Board last changed.

## API

Every route sits behind `requestGuard`, with the API and web ports allowed.

- `GET /api/health` → `{ ok: true }`.
- `GET /api/board` → the latest Board, from memory (no files read per request).
- `GET /api/events` → server-sent events: `event: board` with the Board JSON at once, then one per change; `: ping` every 15 s. A client that leaves is unsubscribed.
- `GET /api/agents/:repoId/:agentId/timeline` → `200 AgentTimeline` (`createTimelineSource` in `agent-timeline.ts`). `404 { error: 'not found' }` when the repo isn't on the current Board, the agent id isn't in that repo's `agents`, the id doesn't match `^[A-Za-z0-9_-]{1,64}$`, or the transcript file is gone. The id is only matched against `listAgentFiles` for that repo (same id and session), never used to build a path. The source has its own reader cache (size and mtime), so a polling client doesn't re-read an unchanged file. Why only board agents: the route must not become a way to read any transcript on the machine.
- `POST /api/repos` with `application/json` (a `charset` is fine) and `{ "path": string }` → `addRepo`, then a rebuild before the `201 { path }`, so every client has the new repo by the time the caller hears back. Errors: other or no content type → `415`; bad JSON or no string `path` → `400 { error: 'bad request' }`; `not absolute`/`not a directory` → `400`; `already registered` → `409`; `config unreadable` → `500`; a failed write → `500 { error: 'config unwritable' }`.

## Watch out

- Tests and manual runs must point `POD_BOARD_CONFIG_DIR` and `POD_BOARD_PORTS_DIR` at temp folders: the real ones belong to live pod runs.
- chokidar 5 doesn't notice a watched path that doesn't exist yet; that's why missing folders are watched through a parent.
- `claims.ts` and `gh.ts` re-export `Claim`, `PrStatus`, and `GhStatus` from `@pod-board/model`; change the shapes there.
- chokidar runs `ignored` on the watched folder itself. A target's `keep` must keep its own folder, or the watch reports nothing.

## History

- 2026-10-18 · server-runs A1: board service, watcher, SSE, and repo routes.
- 2026-10-19 · board-engineer T1: agent timeline route.
- 2026-10-19 · board-engineer X1: `configError` on the Board; `livePrNumbers` uses the model's `handBackPr`; the server imports the model's contract types.
- 2026-10-19 · board-engineer wave 2 fix: config edits reach the board through the watcher; poll mode waits one poll interval longer before a rebuild; a new `ghCheckedAt` counts as a change while `gh` isn't `ok`.

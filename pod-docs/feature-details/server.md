# Server

## What it is

The API server (`packages/server`) finds the repos to show, reads their pod docs, agent transcripts, and port claims, asks `gh` about live PRs, builds one `Board`, keeps it current as files change, and serves it to the web app. It only reads, except for its own config file. Covers the features.md rows API health, Board JSON, Live updates, Add repo, Request guard, and Error banners (the server side).

## How it works

- **Repos.** Paths in the config file (`POD_BOARD_CONFIG_DIR`, else the OS config folder) plus every repo a claim file in the ports folder names (`POD_BOARD_PORTS_DIR`, else `<os temp>/pod-ports`). They merge by repo identity: normalized path, compared without case when that folder's file system ignores case (probed once per repo). `source` is `registered`, `claim`, or `both`; a registered spelling wins.
- **Each repo.** Pod docs → `buildRepoModel`; transcripts changed within `POD_BOARD_TRANSCRIPT_DAYS` (default 30) → `parseAgentTranscript`, pod agents only; PRs from `gh`'s cache. A missing or unreadable folder sets `error` and the other repos still build.
- **`gh`.** Asked only about each live plan's open current-sprint PRs and its hand-back PR (the model's `handBackPr`), plus the hand-back PR of an archived plan a claim names (pod archives the plan before the final merge). For each fix claim (`fix-<slug>` naming no plan, the model's `fixRunNames`) it asks `gh pr list --head fix-<slug> --state all --json number,state,url,statusCheckRollup,headRefName --limit 10` and keeps the open PR, else the newest, with `branch` set on its `PrStatus`; that PR replaces the same number found another way. Branch entries share the number entries' cache rules: a merged or closed PR is never asked about again, and no PR yet (`[]`) is asked again after 30 s. A branch that could read as a flag or holds spaces or shell characters is never passed. `build` never waits on `gh`; a refresh runs every 30 s and at start.
- **Watching.** One chokidar watcher per folder: the config folder, the ports folder, each repo's `pod-docs/` (`.md` only), and each repo's Claude project folder (subagent transcripts and meta only). A folder that doesn't exist yet is watched through its nearest parent. `POD_BOARD_POLL=1` polls every 500 ms.
- **Rebuilds.** After 300 ms with no events (800 ms when polling), but never later than 1.5 s after a burst's first event. One at a time; a rebuild that throws keeps the last Board.
- **Sending.** Subscribers get a Board only when its JSON changed, ignoring `generatedAt`, each PR's `checkedAt`, and `ghCheckedAt` while `gh` is `ok`.
- **Unreadable config.** The last repo list stays, and `configError: 'config unreadable'` is set on every build until the file reads again. A missing file is no error.
- **API.** `GET /api/health`, `GET /api/board` (from memory), `GET /api/events` (SSE, `: ping` every 15 s), `GET /api/agents/:repoId/:agentId/timeline`, `POST /api/repos` (`201`, `409`, `400`, `415`, `500`). Every route is behind the request guard: a loopback `Host` on the API or web port, and an exact `Origin` on writes; no CORS headers. Both ports bind `127.0.0.1` only.

## Why it's this way

- **Read-only, loopback only, Host check:** phase 1 must not break a run, and DNS rebinding is the risk even for a read-only server. See the plan's Key decisions (`pod-docs/plans/board-read.md`).
- **Discovery by config plus claim files**, not a scan of `~/.claude/projects/`: claims show live runs at once; a full scan was turned down as slow and as touching unrelated projects.
- **Quiet spell plus a cap**, not a plain debounce: a debounce alone starved under steady writes (0 board events during 10 s of edits). The cap trades a rebuild every ~1.5 s during bursts for never freezing. See [decisions.md](../decisions.md#2026-10-19--fix-live-update-starvation-before-the-final-review).
- **Poll mode waits 300 + 500 ms**: a poller can see one burst on two ticks 500 ms apart; a 300 ms spell would send two boards.
- **Keep the last repo list on a bad config**, not empty it: a file caught mid-edit would blank the screen. The banner says the list may be stale; the file is never overwritten.
- **Timeline route only for agents on the Board**, matched against the listed files and never used to build a path: the route must not read any transcript on the machine.
- **Case rule probed per folder**, not taken from the OS name: a Mac volume ignores case and a Windows folder can be case-sensitive.

## Watch out

- Tests and manual runs must point `POD_BOARD_CONFIG_DIR` and `POD_BOARD_PORTS_DIR` at temp folders: the real ones belong to live pod runs.
- chokidar 5 doesn't see a watched path that doesn't exist yet, and it runs `ignored` on the watched folder itself; a target's filter must keep its own folder or the watch reports nothing.
- Keep the cap timer apart from the quiet-spell timer, and never reset it within a burst.
- Real-file watcher tests must wait out the start-up rebuilds before the edit they time.
- Real-file watcher tests can't count the boards a burst of edits gives: a runner stall of 300 ms or more between two writes splits the burst into two correct rebuilds. Count boards only with a fake `watch` and fake timers.
- Every rebuild re-parses every transcript in full; only file text is cached. Fine at 67 MB here, but queued for caching by size and mtime before hosting.
- Agents on the Board carry no `description`: the meta file's description is assistant-written text no page shows. `AgentRun` still lists it as optional only for old test helpers; never set it.
- `Claim`, `PrStatus`, and `GhStatus` come from `@pod-board/model`; change the shapes there.

## History

- 2026-10-18 · server-runs A1: board service, watcher, SSE, and repo routes.
- 2026-10-19 · board-engineer T1: agent timeline route.
- 2026-10-19 · board-engineer X1: `configError` on the Board; `livePrNumbers` uses the model's `handBackPr`; the server imports the model's contract types.
- 2026-10-20 · fix-closeout-idle: `livePrNumbers` also asks about a claimed archived plan's hand-back PR, so its Ship step can read merged.
- 2026-10-20 · fix-show-fix-runs: `gh` also finds a fix claim's PR by its head branch (`getBranch`), so a fix run's Ship step reads `you merge` or `merged`.
- 2026-10-19 · board-engineer wave 2 fix: config edits reach the board through the watcher; poll mode waits one poll interval longer before a rebuild; a new `ghCheckedAt` counts as a change while `gh` isn't `ok`.
- 2026-10-19 · board-engineer wave 2 fix 2: a rebuild waits at most 1.5 s after a burst's first event, so steady edits still reach clients.
- 2026-10-19 · board-read · plan complete; final PR held at gate 2 for a dispatch bug outside the server · [report](../reports/board-read.html)
- 2026-10-19 · board-read fix 2: `/api/board` no longer serves agent descriptions.
- 2026-10-19 · board-read fix 5: the board count for a quick burst is tested with a fake watch over real files; the real-file test checks only the 5 s bound and the last board.
- 2026-10-20 · board-read · final review passed at round 5; every server row driven live · [report](../reports/board-read.html)

# Codebase structure

_For agents: scout writes it and engineers read it before coding. You check it and fix what's wrong._

> High-level overview only — what the system is and how its parts fit. No file lists or deep directory trees: those change every sprint, and agents read the code for detail. Name a path only for a part's top-level folder.

The **`## Smoke recipe`** below tells each engineer how to bring the app up for browser verification (per `pod:engineer`'s instructions). Fill it in — without it, engineers can't verify their slices and cap confidence at `medium`.

## What it is

Pod Board is a local web app that shows every pod run across a developer's repos: each run's stage, the current wave's slices, what needs the human, and each engineer's live activity. Its actions merge a PR waiting on you, through `gh`, and append your answer to a queue entry waiting on you. One person runs it on their own machine.

## Parts

- `model` (packages/model) — `@pod-board/model`: parsers for pod's docs and the run model built from them. Pure TypeScript, used as source through its package `exports`, with no build step.
- `server` (packages/server) — `@pod-board/server`: Hono API server on Node, started with `tsx`. Finds repos (its config file plus pod's port claims), reads their pod docs and agent transcripts, asks `gh` about live PRs, watches the files with chokidar, and serves the Board at `/api/board` and as server-sent events at `/api/events`. Every route sits behind a request guard (loopback `Host` on the API or web port; `Origin` too for writes); routes under `/api/actions/` also need a POST of a JSON object with the per-launch session token (`X-Pod-Board-Token`). The action routes (merge-preview, merge, answer) and the action log are in `pod-docs/feature-details/actions.md`. See `pod-docs/feature-details/server.md`.
- `web` (packages/web) — `@pod-board/web`: React + Vite single-page app, installable as a PWA. Screen 1 (runs list, pipeline, slice log, Add repo) reads the Board over `/api/events` and runs it through the model's `listRuns` and `buildPipeline`. Screen 2, the wave board (`screens/board`), builds on the same pipeline log; the URL hash picks the run, the view, and an open slice (`selection`). Screen 3, the engineer view (`screens/engineer`), sits under the board when a slice is open and fetches its engineer's tool timeline (`timeline-loader`) each time the agent's `lastAt` moves on the Board. Logic lives in tested `.ts` modules (`board-stream`, `selection`, `add-repo`, `timeline-loader`, each screen's `view.ts` or `board-view.ts`); components are glue. See `pod-docs/feature-details/wave-board.md` and `engineer-view.md`. Screen CSS uses only the theme's tokens.

## How they connect

The browser loads the web app from the Vite dev server, which proxies `/api` to the API server. The server reads repo files and transcripts and hands their text to `model`, which returns the run model and agent runs; the server sends the Board to the web app as JSON, and again over SSE whenever it changes. `model` never reads files itself. No database: state is rebuilt from files on start and kept in memory. The server writes its own config (the registered repos), at each start its session token next to it (which the Vite dev server puts in the page), and the action log `actions.jsonl` in the same folder. In a repo it writes one file: an answer appended to one line of `pod-docs/handoff-queue.md`. Its other outside change is `gh pr merge`, on a PR waiting on you.

## Stack & conventions

- TypeScript everywhere, `strict` with `noUncheckedIndexedAccess`, ESM, Node 22 or later. Shared compiler options are in `tsconfig.base.json`; each package's `tsconfig.json` extends it and runs `tsc` with no emit. Imports of local files keep the `.ts` extension.
- pnpm workspace; the pnpm version is pinned in `package.json` (`packageManager`). Use pnpm only; `pnpm-lock.yaml` is the one lockfile.
- Vitest, one root config (`vitest.config.ts`) that runs `packages/*/src/**/*.test.ts` and `packages/*/test/**/*.test.ts`.
- **`model` has no I/O.** Nothing under `packages/model/src/` imports `node:*` builtins, `fs`, `path`, `child_process`, or network code. `packages/model/test/no-io.test.ts` enforces it. Tests under `packages/model/test/` may read files.
- Env, all optional: `POD_BOARD_CONFIG_DIR` (folder for the board's `config.json`; default `%APPDATA%\pod-board`, `~/Library/Application Support/pod-board`, or `$XDG_CONFIG_HOME/pod-board`), `POD_BOARD_PORTS_DIR` (pod's claim files; default `<os temp>/pod-ports`), `POD_BOARD_CLAUDE_DIR` (default `CLAUDE_CONFIG_DIR`, else `~/.claude`), `POD_BOARD_TRANSCRIPT_DAYS` (default 30), `POD_BOARD_POLL=1` (watch by polling). A bad value stops the server with an error naming the variable.
- Ports come from env: `POD_BOARD_API_PORT` (default `3000`) and `POD_BOARD_WEB_PORT` (default `3001`). Both servers bind to `127.0.0.1` only. An invalid port stops the process with an error naming the variable (`portFromEnv` in the server's config module, which the Vite config also uses).
- `.gitattributes` forces LF line endings so fixtures check out the same on every OS.
- No linter yet.

## CI

`.github/workflows/pod-ci.yml` runs on every `pull_request` (any base branch) and on `push` to `pod-staging`:

- **verify** — on `ubuntu-latest`, `windows-latest`, and `macos-latest` with Node 22 and pnpm (`pnpm/action-setup`): `pnpm install --frozen-lockfile`, then `pnpm verify`.
- **secrets** — on `ubuntu-latest`: `gitleaks/gitleaks-action@v2` over full history (`fetch-depth: 0`) with `GITHUB_TOKEN`.

## Key docs

- `pod-docs/plans/board-read.md` — phase 1 goal, scope, look, and key decisions.
- `docs/master-plan.md` — the phases beyond this plan.
- `docs/design/preview.html` — the approved design.
- `pod-docs/feature-details/server.md` — how the server finds repos, builds and watches the Board, and serves the API, and why.
- `pod-docs/feature-details/actions.md` — the merge routes, the gh merge and re-read, and the action log, and why.
- `pod-docs/feature-details/runs-and-pipeline.md` — the runs list and pipeline (screen 1) and the join rules they share.
- `pod-docs/feature-details/wave-board.md` — the wave board (screen 2): routes, card states, edges, critical path, and filters.
- `pod-docs/feature-details/engineer-view.md` — the engineer view (screen 3): details, the live timeline, and how its loader follows the Board.
- `pod-docs/feature-details/run-model.md` — how `buildRepoModel` reads a repo's pod docs into plans, sprints, waves, slices, and the queue, and why.
- `packages/model/src/pod-flow/README.md` — where the ported pod-flow parsers came from; the copy stays unchanged, new behavior goes in new modules.
- `packages/model/fixtures/README.md` — the scrubbed real-run fixtures: source repos, snapshot date, and what was cut.

## Smoke recipe

- **Install:** `pnpm install` (Node 22 or later; run `corepack enable pnpm` first if pnpm is missing).
- **Start commands:** both servers together with `pnpm dev`. Always point the board's config and claims at temp folders, so a run never touches the real config or pod's live claims: `POD_BOARD_CONFIG_DIR=<tmp>/cfg POD_BOARD_PORTS_DIR=<tmp>/ports POD_BOARD_API_PORT=<api> POD_BOARD_WEB_PORT=<web> pnpm dev` (PowerShell: `$env:POD_BOARD_CONFIG_DIR='<tmp>\cfg'; $env:POD_BOARD_PORTS_DIR='<tmp>\ports'; $env:POD_BOARD_API_PORT='<api>'; $env:POD_BOARD_WEB_PORT='<web>'; pnpm dev`). Separately: `pnpm --filter @pod-board/server dev` and `pnpm --filter @pod-board/web dev`, with the same env. Ready when the log shows `pod-board API listening on http://127.0.0.1:<api>` and Vite's `Local: http://127.0.0.1:<web>/`. Transcripts are read (never written) from `~/.claude`; set `POD_BOARD_CLAUDE_DIR` to an empty temp folder to leave them out.
- **DB setup:** none. To get a repo with pod docs to look at, copy a fixture: `cp -r packages/model/fixtures/chess-web <tmp>/chess-web`.
- **Login credentials:** none. **Session token:** the API writes a new one at each start to `<tmp>/cfg/session-token`; the page gets it in a meta tag (`curl -s http://127.0.0.1:<web>/ | grep pod-board-token`). Action curls (`POST /api/actions/...`) need `-H "X-Pod-Board-Token: $(cat <tmp>/cfg/session-token)"` plus the `Origin` and `Content-Type: application/json` headers; without the token → `403 {"error":"bad token"}`. Never paste the token into logs or docs.
- **Merge routes (never merge a real PR in a smoke run):** take the repo id from `/api/board` (`repos[].id`). `curl -s -X POST http://127.0.0.1:<api>/api/actions/merge-preview -H "Origin: http://127.0.0.1:<api>" -H "Content-Type: application/json" -H "X-Pod-Board-Token: $(cat <tmp>/cfg/session-token)" -d '{"repoId":"<id>","number":999}'` → `404 {"error":"not waiting on you"}`; the same request with no token → `403 {"error":"bad token"}`. The action log is `<tmp>/cfg/actions.jsonl`. It doesn't exist until the first merge, so a smoke run has none; `/api/board` shows `"actions":[]`. To check that the log is read at start, put a line such as `{"at":1,"action":"merge","repoId":"x","repo":"r","target":"PR #1","result":"stale"}` in that file, restart the API, and find it in `/api/board`'s `actions`.
- **Answer route (on a fixture copy only, never a real repo's queue):** register the copy, then take an answerable entry's `line` from `/api/board` (`repos[].model.queue[]` with `isPending` and `needsYou` true, type `PENDING` or `BLOCKED`, no `answer`). Build the body with a tool, since the line holds backticks and quotes: `jq -n --arg id <id> --arg line "<line>" '{repoId:$id,line:$line,text:"smoke answer"}' > <tmp>/body.json`. `curl -s -X POST http://127.0.0.1:<api>/api/actions/answer -H "Origin: http://127.0.0.1:<api>" -H "Content-Type: application/json" -H "X-Pod-Board-Token: $(cat <tmp>/cfg/session-token)" --data-binary @<tmp>/body.json` → `200 {"outcome":"answered","logged":true}`. Then `grep "Answer (human)" <tmp>/<copy>/pod-docs/handoff-queue.md` shows it at the end of that line. The same request again → `404 {"error":"not waiting on you"}`; with no token → `403 {"error":"bad token"}`.
- **Add a repo:** `curl -s -X POST http://127.0.0.1:<api>/api/repos -H "Origin: http://127.0.0.1:<api>" -H "Content-Type: application/json" -d '{"path":"<absolute repo path>"}'` → `201 {"path":"…"}`; again → `409`. It lands in `<tmp>/cfg/config.json`. A claim file also adds a repo: `<tmp>/ports/3100` holding `<repo path> <plan slug>`.
- **Key URLs:** web app `http://127.0.0.1:<web>/` (screen 1: the runs list with a `live` chip, and the selected run's pipeline and slice log; `#/<repoId>/<plan>` picks a run, `#/<repoId>` a repo with no plan; `#/<repoId>/<plan>/board` is that run's wave board (screen 2: the `Wave board` tab, dependency lines with the critical path in the accent, filter chips), and `#/<repoId>/<plan>/board/<code>` opens slice `<code>` on it (screen 3: the engineer view under the board, with its details and a live timeline, or `No engineer has started on this slice yet.`); a `/pod:fix` run (a claim `<repo path> fix-<slug>` naming no plan) is `#/<repoId>/fix-<slug>`, with no wave board, and `#/<repoId>/fix-<slug>/agent/<agentId>` opens one of its engineers; the Add a repo form posts to `/api/repos`; stop the API and the chip turns `lost · retrying` within about 5 s, then back to `live` once it's up); PWA manifest `http://127.0.0.1:<web>/manifest.webmanifest`; API health `http://127.0.0.1:<api>/api/health` → `{"ok":true}`, also through the web proxy at `http://127.0.0.1:<web>/api/health`; the Board `http://127.0.0.1:<api>/api/board` (each repo with `model.plans`, `agents`, `prs`, `claims`, and the Board's `actions`: the action log, newest first, at most 50); one agent's tool timeline `http://127.0.0.1:<api>/api/agents/<repoId>/<agentId>/timeline` → `200 { agentId, events, total, tests }` (names and short summaries only), or `404 {"error":"not found"}` for an agent not on the Board; live updates `curl -sN http://127.0.0.1:<api>/api/events` (an `event: board` at once, another within a few seconds of editing a sprint doc in a watched repo, `: ping` every 15 s). Any other `Host` (say `curl -H "Host: evil.example"`) → `403 {"error":"forbidden host"}`.
- **Stop:** Ctrl+C in the `pnpm dev` terminal. On Windows, check that nothing still listens on the ports (`netstat -ano | findstr :<api>`).
- **Verification:** `pnpm verify`

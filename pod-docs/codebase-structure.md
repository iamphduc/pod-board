# Codebase structure

_For agents: scout writes it and engineers read it before coding. You check it and fix what's wrong._

> High-level overview only — what the system is and how its parts fit. No file lists or deep directory trees: those change every sprint, and agents read the code for detail. Name a path only for a part's top-level folder.

The **`## Smoke recipe`** below tells each engineer how to bring the app up for browser verification (per `pod:engineer`'s instructions). Fill it in — without it, engineers can't verify their slices and cap confidence at `medium`.

## What it is

Pod Board is a local, read-only web app that shows every pod run across a developer's repos: each run's stage, the current wave's slices, what needs the human, and each engineer's live activity. One person runs it on their own machine.

## Parts

- `model` (packages/model) — `@pod-board/model`: parsers for pod's docs and the run model built from them. Pure TypeScript, used as source through its package `exports`, with no build step.
- `server` (packages/server) — `@pod-board/server`: Hono API server on Node, started with `tsx`. Serves `/api/*`.
- `web` (packages/web) — `@pod-board/web`: React + Vite single-page app.

## How they connect

The browser loads the web app from the Vite dev server, which proxies `/api` to the API server. The server reads repo files and hands their text to `model`, which returns the run model; the server sends it to the web app as JSON. `model` never reads files itself. No database: state is rebuilt from files on start and kept in memory.

## Stack & conventions

- TypeScript everywhere, `strict` with `noUncheckedIndexedAccess`, ESM, Node 22 or later. Shared compiler options are in `tsconfig.base.json`; each package's `tsconfig.json` extends it and runs `tsc` with no emit. Imports of local files keep the `.ts` extension.
- pnpm workspace; the pnpm version is pinned in `package.json` (`packageManager`). Use pnpm only; `pnpm-lock.yaml` is the one lockfile.
- Vitest, one root config (`vitest.config.ts`) that runs `packages/*/src/**/*.test.ts` and `packages/*/test/**/*.test.ts`.
- **`model` has no I/O.** Nothing under `packages/model/src/` imports `node:*` builtins, `fs`, `path`, `child_process`, or network code. `packages/model/test/no-io.test.ts` enforces it. Tests under `packages/model/test/` may read files.
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
- `pod-docs/feature-details/run-model.md` — how `buildRepoModel` reads a repo's pod docs into plans, sprints, waves, slices, and the queue, and why.
- `packages/model/src/pod-flow/README.md` — where the ported pod-flow parsers came from; the copy stays unchanged, new behavior goes in new modules.
- `packages/model/fixtures/README.md` — the scrubbed real-run fixtures: source repos, snapshot date, and what was cut.

## Smoke recipe

- **Install:** `pnpm install` (Node 22 or later; run `corepack enable pnpm` first if pnpm is missing).
- **Start commands:** both servers together with `pnpm dev`, ports from env: `POD_BOARD_API_PORT=<api> POD_BOARD_WEB_PORT=<web> pnpm dev` (PowerShell: `$env:POD_BOARD_API_PORT='<api>'; $env:POD_BOARD_WEB_PORT='<web>'; pnpm dev`). Separately: `pnpm --filter @pod-board/server dev` and `pnpm --filter @pod-board/web dev`, with the same env. Ready when the log shows `pod-board API listening on http://127.0.0.1:<api>` and Vite's `Local: http://127.0.0.1:<web>/`.
- **DB setup:** none.
- **Login credentials:** none.
- **Key URLs:** web app `http://127.0.0.1:<web>/` (shows "Pod Board" and "API health: ok"); API health `http://127.0.0.1:<api>/api/health` → `{"ok":true}`, also reachable through the web proxy at `http://127.0.0.1:<web>/api/health`.
- **Stop:** Ctrl+C in the `pnpm dev` terminal. On Windows, check that nothing still listens on the ports (`netstat -ano | findstr :<api>`).
- **Verification:** `pnpm verify`

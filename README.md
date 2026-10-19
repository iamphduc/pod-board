# pod-board

A local, read-only web app that shows every pod run across your repos: each
run's stage, the current wave's slices, what needs you, and each engineer's
live activity. See [docs/master-plan.md](docs/master-plan.md).

## Requirements

- Node.js 22 or later.
- pnpm. The version is pinned in `package.json` (`packageManager`). If you
  don't have pnpm, run `corepack enable pnpm`.

## Install

```sh
pnpm install
```

## Run

```sh
pnpm dev
```

This starts both servers on `127.0.0.1` only:

- API server: `http://127.0.0.1:3000` (health check at `/api/health`).
- Web app: `http://127.0.0.1:3001`. It proxies `/api` to the API server.

To use other ports, set `POD_BOARD_API_PORT` and `POD_BOARD_WEB_PORT`:

```sh
# macOS, Linux, Git Bash
POD_BOARD_API_PORT=3010 POD_BOARD_WEB_PORT=3011 pnpm dev
```

```powershell
# PowerShell
$env:POD_BOARD_API_PORT = '3010'; $env:POD_BOARD_WEB_PORT = '3011'; pnpm dev
```

A port must be an integer from 1 to 65535, or the server stops with an error
that names the variable.

## Verify

```sh
pnpm verify
```

This runs `pnpm typecheck`, then `pnpm test` (Vitest), then `pnpm build`. CI
runs the same command on Windows, macOS, and Linux.

## Layout

- `packages/model`: pod docs parsers and the run model. Pure functions, no I/O.
- `packages/server`: Hono API server.
- `packages/web`: React and Vite web app.

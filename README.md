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

## Add repos

The board shows every repo you register, plus every repo with a live pod run
(pod writes a claim file per run). To register one, use the Add a repo form on
the runs screen, or send its absolute path with the session token the API
writes at each start to `session-token` next to its config file:

```sh
curl -s -X POST http://127.0.0.1:3000/api/repos   -H "Origin: http://127.0.0.1:3000" -H "Content-Type: application/json"   -H "X-Pod-Board-Token: $(cat ~/.config/pod-board/session-token)"   -d '{"path":"/home/you/code/my-repo"}'
```

The path must be a local folder: on Windows a drive path such as
`C:\code\my-repo`. A network share (`\\host\share`) is refused.

The list lives in the board's own config file, the only file it writes:
`%APPDATA%\pod-board\config.json` on Windows,
`~/Library/Application Support/pod-board/config.json` on macOS, and
`$XDG_CONFIG_HOME/pod-board/config.json` (or `~/.config/pod-board/config.json`)
elsewhere. It never writes inside a repo.

See the board as JSON at `http://127.0.0.1:3000/api/board`, and live updates
at `http://127.0.0.1:3000/api/events`.

## Settings

All optional, set as environment variables:

| Variable | What it does | Default |
|---|---|---|
| `POD_BOARD_API_PORT`, `POD_BOARD_WEB_PORT` | Ports of the two servers | `3000`, `3001` |
| `POD_BOARD_CONFIG_DIR` | Folder for `config.json` | per OS, as above |
| `POD_BOARD_PORTS_DIR` | Where pod writes its run claims | `<temp>/pod-ports` |
| `POD_BOARD_CLAUDE_DIR` | Claude's folder, for agent transcripts (read only) | `CLAUDE_CONFIG_DIR`, else `~/.claude` |
| `POD_BOARD_TRANSCRIPT_DAYS` | How many days of sessions to read | `30` |
| `POD_BOARD_POLL` | `1` watches files by polling, for network drives | off |

The board only accepts requests to `127.0.0.1` or `localhost` on its two
ports; any other `Host` gets a 403, and so does a write from another site's
page (`Origin`).

## Verify

```sh
pnpm verify
```

This runs `pnpm typecheck`, then `pnpm test` (Vitest), then `pnpm build`. CI
runs the same command on Windows, macOS, and Linux.

## Layout

- `packages/model`: pod docs parsers and the run model. Pure functions, no I/O.
- `packages/server`: Hono API server: finds repos, watches their files, and serves the board.
- `packages/web`: React and Vite web app.

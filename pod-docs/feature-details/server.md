# Server

## What it is

The API server (`packages/server`) finds the repos to show, reads their pod docs, agent transcripts, and port claims, asks `gh` about live PRs, builds one `Board`, keeps it current as files change, and serves it to the web app. It writes only its own config folder (config, session token, action log, toggles, resume logs) and one line of a repo's `pod-docs/handoff-queue.md`. Covers the features.md rows API health, Board JSON, Live updates, Add repo, Request guard, Action token, and Error banners (server side). The actions themselves are in [actions.md](actions.md) and [resume.md](resume.md).

## How it works

- **Repos:** paths in the config file plus every repo a claim file in the ports folder names, merged by normalized path (case-blind where that folder's file system is). `source` is `registered`, `claim`, or `both`.
- **Each repo:** pod docs → the model (a doc whose real path, after any symlink or junction on it or a folder above it, is outside the repo's real path is skipped; a linked folder, README, or handoff queue that stays inside the repo still reads, and a linked `.md` inside a plan or sprint folder is never read); recent pod-agent transcripts → parsed runs through a cache; PRs from a `gh` cache. One bad repo sets its `error`; the others still build.
- **`gh`:** run by the absolute path of the first `gh.exe` or `gh.com` (`gh` on POSIX) in an absolute `PATH` entry, found once and kept; never a `gh` in the repo folder or a relative entry such as `.`. None found → `missing`. Asked only about live PRs: open current-sprint PRs, the hand-back PR (also for a claimed archived plan), a fix claim's PR by head branch `fix-<slug>`, and a plan's final PR by head branch `<plan-slug>` before the hand-back. A refresh runs every 30 s; `build` never waits on it.
- **Watching and rebuilds:** one watcher per folder (config, ports, each `pod-docs/`, each Claude project folder). A rebuild runs after 300 ms of quiet, never later than 1.5 s after a burst's first event, one at a time. Clients get a Board over SSE only when its JSON changed.
- **Transcript cache:** keeps each transcript's parsed run keyed by size and mtime, never its text.
- **Request guard (every route):** a loopback `Host` on the API or web port, and an exact `Origin` on writes. No CORS headers. Both ports bind `127.0.0.1`.
- **Session token:** each API start writes a fresh random token to `<config dir>/session-token`. The Vite dev server adds it to the page as `<meta name="pod-board-token">` on every load; the page sends it as `X-Pod-Board-Token`. It is never in the Board, SSE, a URL, a cookie, or `pnpm build` output.
- **Action guard (`/api/actions/*` and `/api/repos`):** after the request guard, fails closed on the first broken rule: Host, then `Origin` (a missing one is refused), then a body over 64 KB (`413 payload too large`, Hono `bodyLimit`), then POST only, then `application/json`, then the token (constant-time compare), then a JSON object body.
- **Add repo (`POST /api/repos`):** behind the action guard, so it needs the session token. Takes only a local absolute path: on Windows a drive path (`C:\…` or `C:/…`); a path that starts with two separators (`\\host\share`, `//host/share`, `\\?\…`, `\\.\…`) → `400 not a local path`, before any file system call. On POSIX any absolute path. Relative → `400 not absolute`; not a folder → `400 not a directory`.
- **Folder listing (`GET /api/fs/folders`, optional `path`):** for the folder picker. Behind the request guard, then the read guard (`/api/fs/*`): the token in `X-Pod-Board-Token` (constant-time compare, shared with the action guard), never in the URL; no `Origin` on a GET. No `path` → the roots: on Windows each drive `A:\` to `Z:\` that answers within 1500 ms, all asked at once; elsewhere `/` and the home folder. With `path` → `{ path, parent, locked, truncated, folders: { name, path, podDocs }[] }`: its subfolders, sorted case-blind, at most 1000. `podDocs` means the folder holds a `pod-docs` folder. A link counts when it ends at a local folder; on Windows each link target is read with `readlink` and a network or device target is skipped before it is followed, and a linked `pod-docs` reads `false`. A folder it can't read → `locked: true`. Errors: `400 bad request` (NUL), `400 not a local path` (Windows `\\…` or `//…`, or a requested link to one), `400 not absolute` (`x\y`, `C:x`, an empty `path`), `404 not a directory`. It reads entry names, types and link targets only, never a file, and stores nothing (`folder-list.ts`).

## Why it's this way

- **Loopback, Host check, and an `Origin` check for actions.** DNS rebinding is the risk even for a read-only server, and a 2026 advisory showed a `Host` check alone isn't enough for a server with write tools. Chrome's Local Network Access prompt was turned down as protection: it doesn't cover the board's own page. See [research](../research/board-actions.md).
- **Token in a request header, never a cookie or query string, and JSON-only actions.** A plan default; the plan records no reason beyond failing closed.
- **Add repo needs the token too.** A registered repo is a folder the board reads and runs `gh` in, so adding one is as risky as an action. A UNC path is refused unread: opening one on Windows can send your login to another machine.
- **The folder listing needs the token, but not an `Origin`.** It shows the whole disk's folder names, so a page on another site must not read it; the Host check stops DNS rebinding, and the token stops anything without the page. Browsers leave `Origin` off same-origin GETs, so the read guard doesn't ask for one. Link targets are checked with `readlink` before any `stat`, because following a link to a share would reach that machine with your login.
- **`gh` by absolute path from absolute `PATH` entries.** A bare name with the repo as the working folder could run a `gh.exe` planted in a cloned repo: older Windows lookups search the working folder first, and a relative `PATH` entry resolves against it. The 30 s refresh would run it with no click.
- **A new token per launch, added to the page by the dev server.** `pnpm build` never runs that step, so `dist` holds no token. Trade-off: a page loaded before a restart must reload.
- **Discovery by config plus claim files**, not a scan of `~/.claude/projects/`: claims show live runs at once; a scan was slow and touched unrelated projects.
- **Quiet spell plus a cap**, not a plain debounce: a debounce alone starved under steady writes ([decision](../decisions.md#2026-10-19--fix-live-update-starvation-before-the-final-review)).
- **Keep the last repo list on a bad config:** a file caught mid-edit would blank the screen; the banner says it may be stale, and the file is never rewritten.
- **Docs outside the repo are skipped:** a cloned repo could link `pod-docs/` or a doc to any file on the machine and show it on the board. The repo's own real path is the root, so a repo registered through a link still works.
- **A 64 KB body cap, no transcript cap:** every real action body is under 1 KB. Transcripts reach 136 MB here, and a cap would hide real agents ([decision](../decisions.md#2026-10-23--no-size-cap-on-transcripts)).
- **Parsed runs, not text, in the cache:** the text cache held about 1 GB on a real `~/.claude` and got servers killed.

## Watch out

- Compare real paths with `path.relative` (as `repo-files.ts` and `queue-writer.ts` do), never a string prefix: `C:\x-other` starts with `C:\x`.
- A page loaded before an API restart holds a dead token: actions and Add repo get `403 bad token`, and the client says to reload.
- Never spawn a child by a bare name with a repo as its working folder: resolve it with `resolveBin` (`bin-path.ts`) first. It skips empty and relative `PATH` entries and returns an absolute path. Give the child `safeChildEnv(env)` too: its `PATH` keeps only absolute entries, and on Windows `NoDefaultCurrentDirectoryInExePath=1`, so the child's own bare-name lookups (cmd.exe's included) skip the repo folder. Claude Code sets that variable in its own shells, so a test must remove it to go red.
- The folder listing follows a chain of links by reading each target, but a folder above a target (`C:\a` in `C:\a\b`) that is itself a link is resolved by Windows when the target is checked. Only someone who can already write to your disk can plant one.
- A `gh` folder on `PATH` written as a relative path is skipped, so the board shows `gh` missing.
- Keep Vite's dev `cors: false`: with it on, a page on another local port could read the Board through the web port.
- Through the web proxy, a stopped API answers `502` with an empty body.
- Tests and manual runs must point `POD_BOARD_CONFIG_DIR` and `POD_BOARD_PORTS_DIR` at temp folders: the real ones belong to live pod runs.
- chokidar 5 doesn't see a path that doesn't exist yet, and runs `ignored` on the watched folder itself; a filter must keep its own folder.
- The rebuild chain must never stay rejected: one rejected link skips every later rebuild. `rebuild()` reports a failure through `onError` and goes on.
- Keep the cap timer apart from the quiet-spell timer. Count boards per burst only with a fake watch and fake timers.
- Drop cache entries once per build across all repos, not per repo. The cache trusts size and mtime; Claude only appends.
- Agents on the Board carry no `description` (assistant-written text no page shows).
- A plan left `active` with every sprint done and no PR on its branch costs one `gh pr list` every 30 s.
- Ctrl+C waits up to 70 s for running actions (`/api/actions/*`) and auto-continue sends, then exits; a second Ctrl+C quits at once. Don't wait for `server.close()`: open `/api/events` streams keep it from ever finishing.

## History

- 2026-10-18 · server-runs A1: board service, watcher, SSE, and repo routes.
- 2026-10-19 · board-engineer T1: agent timeline route.
- 2026-10-19 · board-engineer X1: `configError` on the Board; `livePrNumbers` uses the model's `handBackPr`; the server imports the model's contract types.
- 2026-10-19 · board-engineer wave 2 fix: config edits reach the board through the watcher; poll mode waits one poll interval longer before a rebuild; a new `ghCheckedAt` counts as a change while `gh` isn't `ok`.
- 2026-10-19 · board-engineer wave 2 fix 2: a rebuild waits at most 1.5 s after a burst's first event, so steady edits still reach clients.
- 2026-10-19 · board-read · plan complete; final PR held at gate 2 for a dispatch bug outside the server · [report](../reports/board-read.html)
- 2026-10-19 · board-read fix 2: `/api/board` no longer serves agent descriptions.
- 2026-10-19 · board-read fix 5: the board count for a quick burst is tested with a fake watch over real files; the real-file test checks only the 5 s bound and the last board.
- 2026-10-20 · board-read · final review passed at round 5; every server row driven live · [report](../reports/board-read.html)
- 2026-10-20 · fix-closeout-idle: `livePrNumbers` also asks about a claimed archived plan's hand-back PR, so its Ship step can read merged.
- 2026-10-20 · fix-show-fix-runs: `gh` also finds a fix claim's PR by its head branch (`getBranch`), so a fix run's Ship step reads `you merge` or `merged`.
- 2026-10-21 · fix-final-pr-early: `gh` also finds a plan's final PR by head branch `<plan-slug>` while the plan is in its final review or close-out with no hand-back, so Ship shows it before the hand-back exists.
- 2026-10-21 · fix-cache-transcripts: the board keeps each transcript's parsed run, not its text, and parses only files whose size or mtime changed. On a real `~/.claude`: heap after the first board 986 MB → 13 MB, a rebuild with nothing changed 5 s → 69 ms. The timeline route reads its file fresh.
- 2026-10-21 · merge-actions S1: per-launch session token, the action guard on `/api/actions/`, the page's token meta, and the action client. Vite's dev CORS turned off.
- 2026-10-21 · merge-actions M1: merge-preview and merge routes; `ExecResult.stderr`, a per-call exec timeout, and `GhCache.forget`; `Board.actions` from the action log.
- 2026-10-21 · queue-and-replies A1: `POST /api/actions/answer`, the server's one write into a repo's queue.
- 2026-10-22 · board-actions · plan complete: action token, `Origin` check, and the action guard on every action route; final PR #33 passed review at round 2 after fix PR #34 · [report](../reports/board-actions.html)
- 2026-10-22 · fix-security-hardening: `gh` runs by an absolute path from absolute `PATH` entries only (a `gh.exe` in a repo could run); `POST /api/repos` needs the session token and refuses UNC and device paths unread.
- 2026-10-23 · fix-hardening-2: pod docs whose real path leaves the repo are skipped; `/api/actions/*` and `POST /api/repos` bodies over 64 KB get `413`.
- 2026-10-25 · fix-background-loops: a watch that fails to open or close is logged, and later rebuilds still run.
- 2026-10-25 · test-main-boot: `main.test.ts` starts the real API from `main.ts` on temp folders and checks health, the Board, the token file, and the action guard; on macOS and Linux also a clean exit on SIGTERM.
- 2026-10-25 · fix-shutdown-drain: Ctrl+C waits for running merges, answers, resumes, and auto-continue sends before exiting, so their action-log lines aren't lost; a second Ctrl+C quits now.
- 2026-10-28 · calm-screen F1: `GET /api/fs/folders` (the folder listing for the picker) behind a new read guard on `/api/fs/*`; the token compare is shared with the action guard.

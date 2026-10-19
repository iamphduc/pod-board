# Engineer view

Screen 3. With a slice open on the wave board (`#/<repoId>/<plan>/board/<code>`), `BoardScreen` shows the engineer view under the board frame: the slice's engineer, its details, and a live tool timeline. `packages/web/src/screens/engineer/view.ts` holds the rules, `packages/web/src/timeline-loader.ts` fetches the timeline, and `EngineerView.tsx` is glue.

## What it shows

- **The engineer** is `engineerFor(repo, plan, sprint, code)` (see `wave-board.md`): the latest-started engineer agent whose role is this slice of the shown sprint.
- **Bar:** `<code> · <title>` (backticked spans as inline code, via `DocTitle`) and the card's chip.
- **Details** (`engineerDetails`): Branch (the agent's, else the slice's, else `—`), Files owned (`slice.filesOwned`, mono; none → `not listed`), Tests first (`testsLine`), Last active (`lastActive`), Model (the agent's, else the slice's), Tokens (`formatTokens`). With no engineer, Last active and Tokens read `—`.
- **Tests first** (`testsLine`): `yes` or `no` from `testFirst`, then `<k> test files · <r> runs · last passed|failed`. Parts not known (no `testFirst`, zero files, zero runs, no finished run) are left out; nothing left → `no test runs yet`.
- **Last active** (`lastActive`): `<s> s ago` under 60 s, `<m> min ago` under 60 min, else `<h> h ago` (whole units, rounded down). Ahead of now (clock skew) → `just now`; no time → `unknown`; an ended agent → `ended HH:MM` (local), or `ended` with no time.
- **A disabled `Step in (phase 3)` button**, as in the preview. No Open worktree: it's an action, and actions start in phase 2.
- **Never `AgentRun.description`.** The view shows tool names and short summaries only; the server's timeline already holds nothing else (`run-model.md`, Tool timeline).

## Live timeline

Under the eyebrow `Live timeline`: one row per event, oldest first, `HH:MM` (local) then the summary, then `→ ok` or `→ failed` with a mark in the chip's colour (`s-ok`, `s-bad`). `<n> earlier steps not shown` heads the list when the server kept fewer events than `total` (it keeps the newest 300). The list scrolls inside its own box and follows the newest row while you're at its bottom.

- No engineer → `No engineer has started on this slice yet.`
- 404 → `No transcript found for this engineer.`
- A load error with a timeline already shown keeps it, under a `stale` chip and a note. With none shown, a note says it retries when the engineer writes again.

## Loader

`createTimelineLoader(fetchJson, onState)` → `show(key | undefined)`, `stop()`. The key is `{ repoId, agentId, lastAt?, ended }`. States: `idle`, `loading` (with the last timeline when it's the same agent), `ready`, `missing`, `error` (with the last timeline of the same agent).

- It fetches only when the key changes. **Why no polling:** a transcript write changes the agent's `lastAt` on the Board, and the Board already arrives over SSE, so each board event that moves `lastAt` (or `ended`) gives a new key and one fetch. The server's reader caches by size and mtime, so a fetch of an unchanged file is cheap.
- At most one request is in flight. A key change during one waits; when it returns, a response for an older key is dropped and the latest key is fetched once. A key that changes and comes back before the response takes it.
- A 200 whose body isn't a timeline for this agent counts as an error.
- `show(undefined)` → `idle` and forgets the last timeline; `stop()` ends all callbacks.

## Watch out

- An error isn't retried for the same key. An ended agent with a failed load stays on the error note until the page reloads or another slice is opened and back (the view remounts per slice).
- The timeline follows `lastAt`, which moves only on records with a timestamp. A transcript line with no timestamp doesn't refresh the view until the next one that has it.

## History

- 2026-10-19: added in sprint board-engineer (slice E1).

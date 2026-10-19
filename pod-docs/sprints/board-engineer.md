# Sprint: Wave board, engineer view, and empty and error states

_From plan: pod-docs/plans/board-read.md · Slug: board-engineer · Status: active · Generated: 2026-10-19_

<!-- autopilot-run: started=2026-10-18T21:42:12-07:00 sprints=2 waves=7 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | T1 | Tool timeline parser and the timeline route | board-engineer-T1 | — | pushed | medium | — |
| 1 | W1 | Screen 2: wave board, dependency lines, critical path, filters, routes | board-engineer-W1 | — | pushed | high | — |
| 2 | E1 | Screen 3: engineer view with a live tool timeline | board-engineer-E1 | — | pending | — | T1, W1 |
| 2 | X1 | Empty and error states: config, `gh`, unsupported docs, no runs; theme boot | board-engineer-X1 | — | pending | — | W1 |

## Shared contract

Times are epoch milliseconds. Earlier contracts (server-runs, bootstrap-model) stand unless changed here.

**Hash routes** (W1 builds in `packages/web/src/selection.ts`; E1 and X1 use them). Two-segment forms are unchanged.
- `#/<repoId>` and `#/<repoId>/<plan>` → pipeline (screen 1).
- `#/<repoId>/<plan>/board` → wave board (screen 2).
- `#/<repoId>/<plan>/board/<code>` → wave board with slice `<code>`'s engineer view open (screen 3).
- Segments are URI-encoded. A plan slug `board` is still a plan in the two-segment form. A run with no plan never gets the board view. A hash naming no run → the first run's pipeline. A `<code>` that isn't on the shown board → the board with no slice open. The canonical hash replaces a corrected one (as today).

`parseHash(hash) → { repoId; plan?; view: 'pipeline' | 'board'; slice? } | undefined`; `resolveSelection(runs, hash, slicesOf?: (run) => string[]) → { run; view; slice; hash }`; `hashFor(run, view?, slice?)`.

**Wave board view** (W1, `packages/web/src/screens/board/board-view.ts`; E1 imports it):
```ts
type CardState = 'needs-you' | 'running' | 'waiting' | 'blocked' | 'merged'
type Card = { code: string; title: string; state: CardState; meta: string; critical: boolean; slice: SliceModel; row: LogRow }
type Column = { wave: number; status: string; cards: Card[] }
type Edge = { from: string; to: string; critical: boolean }
type WaveBoard = { sprint?: string; caption: string; columns: Column[]; edges: Edge[]; counts: Record<CardState, number> }
buildWaveBoard(repo: BoardRepo, planSlug: string, now: number): WaveBoard | undefined
engineerFor(repo: BoardRepo, planSlug: string, sprint: string, code: string): AgentRun | undefined
cardChip(state: CardState): Chip   // labels: needs you, running, waiting, blocked, merged
```
- **Shown sprint:** the plan's `currentSprint`, else the last sprint with a doc. No such sprint, or one with no slices → `columns: []`. Unknown plan → `undefined`.
- **Card state**, first match wins: `blocked` (`isBlockedSlice`) → `needs-you` (a `needsYou` queue item of the plan with `slice` = code and `sprint` = this sprint or none) → `merged` (`isSliceDone`) → `running` (status `pushed`, or an agent with role slice(sprint, code) runs) → `waiting`. Same precedence as the pipeline's wave step (`you` beats `done`; queue entry P1, value as planned).
- **Engineer for a slice:** among agents whose `type` ends in `engineer` and whose `roleOf` is slice(sprint, code), the one with the latest `startedAt` (missing counts as oldest); none → `undefined`.

**`BoardScreen`** (W1 creates `packages/web/src/screens/board/BoardScreen.tsx`; E1 owns it in wave 2). Props `{ repo: BoardRepo; plan: string; slice?: string; now: number }`. It renders the wave board; when `slice` is set it marks that card selected, and E1 adds the engineer view below the board frame.

**Timeline** (T1, `packages/model/src/timeline.ts`, exported from the model's `index.ts`):
```ts
type ToolEvent = { at: number; tool: string; summary: string; result?: 'ok' | 'failed' }
type TestProgress = { testFiles: number; runs: number; failedRuns: number; last?: 'pass' | 'fail'; testFirst?: boolean }
type AgentTimeline = { agentId: string; events: ToolEvent[]; total: number; tests: TestProgress }
parseAgentTimeline(input: { agentId: string; jsonl: string; roots: string[] }): AgentTimeline   // never throws
```
- **No text leaves it.** A summary is built only from the tool name, file paths, and fixed words; never from assistant text, thinking, prompts, tool output, command arguments, patterns, URLs beyond the host, or edit contents. This is the plan's secret rule; T1 owns its edges.
- `events` are oldest first, the newest 300 kept; `total` counts all.

**Timeline route** (T1, in `app.ts`, behind the request guard): `GET /api/agents/:repoId/:agentId/timeline` → `200 AgentTimeline`. `404 { error: 'not found' }` when the repo isn't on the current Board, the agent id isn't in that repo's `agents`, the id doesn't match `^[A-Za-z0-9_-]{1,64}$`, or the transcript file is gone. The id is never used to build a path; the file comes from `listAgentFiles` for that repo.

**Board config error** (X1, `packages/model/src/board.ts`): `Board` gains `configError?: 'config unreadable'`. Set on every build where the config file exists but can't be read (the last repo list is still used); absent when it reads or doesn't exist. Settles queue entry A1.

**Look.** Only the theme files (`packages/web/src/theme/`) define colors and fonts; nobody edits them this sprint. The critical path uses `--accent`, per the plan's Look ("highlighted in the accent"); the preview draws it in `--warn`.

## Per-slice detail

### T1: Tool timeline parser and the timeline route
- **Scope:** `timeline.ts` per the contract, plus the server lookup and route.
  - Events: one per `tool_use` block in assistant records, deduped by `tool_use.id` (a block repeated over streamed records counts once; no id → each counts). `at` is the record's timestamp; a block with no valid timestamp is skipped. `result` from the later `tool_result` with that `tool_use_id`: `is_error: true` → `failed`, else `ok`; none yet → absent. Bad lines, partial last lines, and odd records are skipped.
  - **Paths** (`file_path`, `notebook_path`, `path`): `\` → `/`; after `/.claude/worktrees/<name>/` → the rest; else starting with a root (any case) → the rest; else the base name. Over 60 characters → `…` plus the last 59.
  - **Summaries:** Read, Edit, Write, MultiEdit, NotebookEdit → `<Tool> <path>` (no path → `<Tool>`). Grep, Glob → `<Tool>`, plus ` in <path>` when `path` is set; never the pattern. Bash, PowerShell → `<Tool>: ` plus up to 3 segments joined by ` · ` (then ` …`): split the command on `&&`, `||`, `;`, `|`, and newlines; in each, skip tokens holding `=`; the program is the first remaining token's base name without `.exe`, shown only if it's in a fixed list of known programs (pnpm, npm, npx, yarn, node, git, gh, vitest, tsc, agent-browser, curl, ls, cd, cat, mkdir, rm, cp, mv, echo, grep, rg, …), else `command`; then the first token among the next four that's in a fixed list of subcommands (test, run, install, add, build, dev, verify, typecheck, exec, commit, push, pull, fetch, status, diff, log, checkout, switch, merge, rebase, worktree, branch, pr, auth, view, open, …), if any. Task, Agent → `<Tool>: <subagent_type>`; Skill → `Skill: <skill>` (each only when it matches `^[\w:.-]{1,40}$`, else the tool name). WebFetch → `WebFetch <hostname>` (hostname matching `^[a-z0-9.-]+$` only). SubagentHandback → `Hand-back`. Anything else (TodoWrite, `mcp__…`) → its name when it matches `^[\w:.-]{1,64}$`, else `tool`.
  - **Tests:** a test run is a Bash or PowerShell event with a segment whose program is `vitest` or `jest`, or whose subcommand is `test`, `verify`, or `vitest`. `runs` and `failedRuns` count finished test runs; `last` is the latest finished one's pass or fail. `testFiles` counts distinct edited paths (Write, Edit, MultiEdit) matching `.test.` or `.spec.` before a JS/TS extension, or under `__tests__/`. `testFirst`: absent with no test-file edit; else `true` unless a code file (an edited path that isn't a test file and doesn't end in `.md`, `.json`, `.yaml`, `.yml`, `.lock`) was edited first.
  - Server: `agent-timeline.ts` → `createTimelineSource({ board: () => Board, claudeDir, transcriptDays, now })` with `timeline(repoId, agentId): Promise<AgentTimeline | undefined>`, using its own `createAgentFileReader()` (cached by size and mtime) and `roots: [repo.path]`. Add the route to `createApp` (new dep `timeline`), wire it in `main.ts`. Document the timeline rules in `run-model.md` and the route in `server.md`.
- **Files owned:** `packages/model/src/timeline.ts` (new), `packages/model/src/timeline.test.ts` (new), `packages/model/src/index.ts`, `pod-docs/feature-details/run-model.md`, `packages/server/src/agent-timeline.ts` (new), `packages/server/src/agent-timeline.test.ts` (new), `packages/server/src/app.ts`, `packages/server/src/app.test.ts`, `packages/server/src/main.ts`, `pod-docs/feature-details/server.md`
- **Success criteria:**
  - `[test] one event per tool_use id across streamed records; result ok, failed, or absent from the matching tool_result; no-timestamp blocks skipped — packages/model/src/timeline.test.ts › events and results`
  - `[test] paths: worktree prefix, root in another case, Windows slashes, outside path → base name, long path cut — packages/model/src/timeline.test.ts › relative paths`
  - `[test] each summary form: file tools, Grep and Glob without pattern, Task, Skill, WebFetch host only, Hand-back, MCP and odd names — packages/model/src/timeline.test.ts › tool summaries`
  - `[test] Bash: env tokens skipped, unknown program → command, subcommand found past flags (pnpm --filter x test → pnpm test), three segments then …, quoted arguments never shown — packages/model/src/timeline.test.ts › shell summaries`
  - `[test] a planted fake secret in the prompt, assistant text, thinking, Bash arguments, an env token, an unknown program, Edit and Write contents, Grep and Glob patterns, a WebFetch path, query, and userinfo, a Task prompt, and tool_result content appears nowhere in the JSON of the result — packages/model/src/timeline.test.ts › never keeps transcript text`
  - `[test] test runs, failed runs, last result, test files, testFirst true, false, and absent — packages/model/src/timeline.test.ts › test progress`
  - `[test] 400 events keep the newest 300 with total 400; bad and partial lines never throw — packages/model/src/timeline.test.ts › limits and bad input`
  - `[test] a temp repo and claude dir: the timeline comes back for an agent on the board; unknown repo, unknown agent, a non-pod agent, a bad id (../x), and a deleted file → undefined — packages/server/src/agent-timeline.test.ts › finds only board agents`
  - `[test] a transcript file with the planted secret: neither the built Board JSON nor the timeline JSON contains it — packages/server/src/agent-timeline.test.ts › never serves transcript text`
  - `[test] the route answers 200 and 404 as the contract says, refuses a foreign Host, and existing route tests still pass — packages/server/src/app.test.ts › timeline route`
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### W1: Screen 2: wave board, dependency lines, critical path, filters, routes
- **Scope:** Screen 2 per the Look and the preview's "Screen 2". Use only L1's tokens and classes; screen CSS has no color literals; every state has a chip and a card edge (`k-*`; waiting has the default edge). Logic in tested `.ts` modules; components are glue.
  - Routes per the contract in `selection.ts`; App passes the view and slice down. The main bar of a run with a plan gets two tabs, `Pipeline` and `Wave board` (links to the hashes, current one marked with `aria-current`). The pipeline view stays as it is.
  - `board-view.ts` per the contract. Caption `Sprint i of n · <sprint>`. Column status is the pipeline's slice log group status for that wave (reuse `buildPipeline`'s log; don't recompute). Card `row` is that log's row. Card meta, unknown parts left out: merged → `model · confidence · m min`; running → `model · m min`; needs-you → `<TYPE>: <body>` of the latest such entry, cut to 60 characters with `…`; blocked → the latest pending `BLOCKED` entry naming the slice the same way, else `status <status>`; waiting → `needs <codes>` from `dependsOn` as written, else the model.
  - **Edges:** one per (dependency, slice) where the dependency is a slice of this board in an earlier wave; duplicates, self, same or later wave, and codes not on the board give no edge.
  - **Critical path:** the longest chain along edges by slice count; on a tie, compare chains slice by slice from the first by board order (wave, then table order), the earlier slice wins. No edges → no critical slices or edges. Its cards get `critical` and its edges are drawn in `--accent`, thicker.
  - **Filters:** chips in the preview's order with counts over all cards; buttons with `aria-pressed`. Selected set empty → all cards plain; else non-matching cards dim (they stay in place, lines stay). Counts never change with the filter. The set clears when the shown sprint changes. `filterState` functions: `toggle`, `isDimmed`.
  - **Lines:** `geometry.ts`: `edgePath(from, to, origin)` with boxes `{ left; top; right; bottom }` → `M x1 y1 C m y1 m y2 x2 y2` (x1 = from.right − origin.left, y1 = from's middle, x2 = to.left − origin.left, m the midpoint; one decimal at most). The SVG redraws on board change, resize, and `document.fonts.ready`.
  - Cards are focusable; click, Enter, or Space sets `#/…/board/<code>`; Escape on the board clears the slice. Empty board → `Sprint <s> isn't drafted yet.` (or `No sprint with a doc yet.`). At 375 px the board scrolls sideways inside its frame. Add `wave-board.md` (these rules and why); update `codebase-structure.md`'s web part and Key URLs.
- **Files owned:** `packages/web/src/screens/board/**` (new, incl. `board-view.ts`, `board-view.test.ts`, `geometry.ts`, `geometry.test.ts`, `BoardScreen.tsx`, `board.css`), `packages/web/src/selection.ts`, `packages/web/src/selection.test.ts`, `packages/web/src/App.tsx`, `packages/web/src/screens/runs/RunsScreen.tsx`, `packages/web/src/screens/runs/runs.css`, `pod-docs/feature-details/wave-board.md` (new), `pod-docs/codebase-structure.md`
- **Success criteria:**
  - `[test] every hash form parses; plan slug "board"; plan-less run never gets the board view; unknown run → first run's pipeline; unknown code dropped; existing selection cases still pass — packages/web/src/selection.test.ts › routes`
  - `[test] card state precedence, each pair: blocked over needs-you over merged over running over waiting — packages/web/src/screens/board/board-view.test.ts › card state`
  - `[test] shown sprint: current, else last with a doc; no doc or no slices → no columns; unknown plan → undefined — packages/web/src/screens/board/board-view.test.ts › shown sprint`
  - `[test] meta per state, with unknown parts left out and the 60-character cut — packages/web/src/screens/board/board-view.test.ts › card meta`
  - `[test] edges only to earlier-wave slices on the board; duplicates, self, same wave, later wave, other-sprint codes left out — packages/web/src/screens/board/board-view.test.ts › edges`
  - `[test] critical path: the preview's example gives B1 → C1 → D1; tie rule; no edges → none; a single slice → none — packages/web/src/screens/board/board-view.test.ts › critical path`
  - `[test] counts over all cards; toggle adds and removes; empty set dims nothing; counts unchanged by filters; set clears on sprint change — packages/web/src/screens/board/board-view.test.ts › filters`
  - `[test] engineerFor picks the latest-started engineer of the slice; reviewers and other slices ignored; none → undefined — packages/web/src/screens/board/board-view.test.ts › engineer for a slice`
  - `[test] edgePath for a right-and-down and a right-and-up pair against an offset origin — packages/web/src/screens/board/geometry.test.ts › edge path`
  - `[manual] with this repo and a temp copy of the chess-web fixture: the wave board matches the preview's screen 2 in light and dark at 1280 px and 375 px (columns, chips and edges, lines, critical path in accent, scrolls in its frame at 375 px); filters dim cards; tabs switch views; the pipeline, slice log, and Add repo form still work — agent-browser from PowerShell, without piping its output`
  - `[manual] change a slice status in the temp copy; its card and count change within 5 s with no reload — agent-browser`
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### E1: Screen 3: engineer view with a live tool timeline
- **Scope:** Screen 3 per the Look and the preview's "Screen 3", below the board frame in `BoardScreen` when a slice is open: two columns on desktop, stacked at narrow widths. Use only L1's tokens and classes; no color literals.
  - Bar: `<code> · <title>` (via `DocTitle`) and the card's chip. Details: Branch (the agent's, else the slice's), Files owned (`slice.filesOwned`, mono; none → `not listed`), Tests first (`yes` or `no` from `testFirst`, then `<k> test files · <r> runs · last passed|failed`; parts unknown left out; nothing → `no test runs yet`), Last active, Model, Tokens (`formatTokens`). A disabled `Step in (phase 3)` button as in the preview; no Open worktree (an action: phase 2 or later). Never show `AgentRun.description`.
  - Timeline under the eyebrow `Live timeline`: one row per event, `HH:MM` (local) then the summary, then `→ ok` / `→ failed` with a chip-colored mark; `<n> earlier steps not shown` when `total` > events. No engineer → `No engineer has started on this slice yet.`; 404 → `No transcript found for this engineer.`; load error → a note, keeping the last timeline.
  - `timeline-loader.ts`: `createTimelineLoader(fetchJson, onState)` with `show(key | undefined)`, key `{ repoId, agentId, lastAt?, ended }`, and `stop()`. States `idle`, `loading`, `ready`, `missing`, `error`. It fetches only when the key changes; at most one request in flight, and a key change during one fetches again once it returns; a response for an older key is dropped; an error keeps the last timeline; `show(undefined)` clears. Because a transcript write changes the agent's `lastAt` on the Board, the timeline follows the board events.
  - `view.ts`: `lastActive(lastAt, now, ended)` → `<s> s ago` under 60 s, `<m> min ago` under 60 min, else `<h> h ago`; ahead of now → `just now`; none → `unknown`; ended → `ended HH:MM`. `testsLine(tests)`, `timelineRows(timeline)`.
  - Add `engineer-view.md` (new); add the timeline route and the screen 3 hash to `codebase-structure.md`'s Key URLs.
- **Files owned:** `packages/web/src/screens/engineer/**` (new, incl. `view.ts`, `view.test.ts`, `EngineerView.tsx`, `engineer.css`), `packages/web/src/timeline-loader.ts` (new), `packages/web/src/timeline-loader.test.ts` (new), `packages/web/src/screens/board/BoardScreen.tsx`, `pod-docs/feature-details/engineer-view.md` (new), `pod-docs/codebase-structure.md`
- **Success criteria:**
  - `[test] fetches on a new key only; same key twice → one request; a key change mid-flight fetches once more after; an older response is dropped — packages/web/src/timeline-loader.test.ts › fetches once per change`
  - `[test] 404 → missing; an error keeps the last timeline; show(undefined) → idle; stop cancels — packages/web/src/timeline-loader.test.ts › missing and errors`
  - `[test] lastActive at 59 s, 60 s, 59 min, 60 min, ahead of now, none, and ended — packages/web/src/screens/engineer/view.test.ts › last active`
  - `[test] testsLine for full, partial, and empty progress; timelineRows with results and the earlier-steps line — packages/web/src/screens/engineer/view.test.ts › tests and rows`
  - `[manual] open a card on the board of this repo: branch, files owned, tests line, last active, and timeline match the preview's screen 3 in light and dark at 1280 px and 375 px (stacked); a waiting slice shows the no-engineer message — agent-browser from PowerShell`
  - `[manual] with a temp claude dir (POD_BOARD_CLAUDE_DIR) holding a transcript for a slice with a planted fake secret in its text, Bash arguments, and tool output: the secret is nowhere on the page; appending a tool_use line shows a new row within 5 s — agent-browser and page text search`
- **Depends on:** T1, W1
- **One-way door:** none
- **Model:** opus

### X1: Empty and error states: config, `gh`, unsupported docs, no runs; theme boot
- **Scope:** The plan's empty and error states on screen 1 (the main view and bar), plus server tidy-ups. Use only L1's tokens and classes; each banner has a chip, never text alone.
  - Server: set `configError` per the contract in `board-service.ts`. Point `livePrNumbers` at the model's `handBackPr` (drop the local copy, same rule). `claims.ts` and `gh.ts` import `Claim`, `PrStatus`, `GhStatus` from `@pod-board/model` instead of local copies; drop the `typesMatch` check.
  - Web, in `runs/view.ts`: `banners(board, stream)` → ordered list of `{ chip, text }`: `lost` (as today) → config error (`The board's config file can't be read, so the repo list may be out of date. The board never overwrites it.`) → `gh` `missing` (`gh isn't installed, so PR states aren't checked.`) or `logged-out` (`gh isn't logged in, so PR states may be out of date. Run gh auth login.`), each with `last checked HH:MM` when `ghCheckedAt` is set; `ok` and `unknown` → none. `emptyMessage(run, repo?)`: unsupported with a version → `This repo's pod docs are version N; Pod Board reads version 2. Update pod in this repo.`; with none → `This repo has no pod docs version (an older pod). Update pod in this repo.`; error, no plan, and unknown plan as today. No repos → the existing `No repos yet` state.
  - Theme boot: an inline script in `index.html`, before the module script, that applies a stored `light` or `dark` choice (`pod-board-theme`) to `<html data-theme>` so a Dark choice doesn't flash light; missing, unknown, or throwing storage → nothing. Nothing loads from another host.
  - Update `server.md` (config error, shared hand-back rule) and `runs-and-pipeline.md` (the states).
- **Files owned:** `packages/model/src/board.ts`, `packages/server/src/board-service.ts`, `packages/server/src/board-service.test.ts`, `packages/server/src/claims.ts`, `packages/server/src/gh.ts`, `packages/web/src/screens/runs/RunsScreen.tsx`, `packages/web/src/screens/runs/view.ts`, `packages/web/src/screens/runs/view.test.ts`, `packages/web/src/screens/runs/runs.css`, `packages/web/index.html`, `packages/web/src/theme-boot.test.ts` (new), `pod-docs/feature-details/server.md`, `pod-docs/feature-details/runs-and-pipeline.md`
- **Success criteria:**
  - `[test] a corrupt config sets configError and keeps the last repos; fixing it clears it; a missing file never sets it — packages/server/src/board-service.test.ts › config error on the board`
  - `[test] gh is still asked only for open current-sprint PRs and the hand-back PR, through the model's handBackPr — packages/server/src/board-service.test.ts › asks gh only for live PRs`
  - `[test] banners: order with all at once; config error alone; gh missing and logged-out with and without ghCheckedAt; ok and unknown give none — packages/web/src/screens/runs/view.test.ts › banners`
  - `[test] emptyMessage: unsupported with version 3, with no version, error, no plan, unknown plan — packages/web/src/screens/runs/view.test.ts › empty messages`
  - `[test] the inline script run against a fake storage and root: dark and light set data-theme; missing, unknown, and throwing storage set nothing; it uses THEME_KEY; it runs before the module script — packages/web/src/theme-boot.test.ts › applies the stored theme before render`
  - `[manual] with a temp config dir: a corrupt config.json shows the config banner, and fixing it removes it; a temp repo whose README says pod docs: 1 shows the version message; with gh logged out (or GH_CONFIG_DIR pointed at an empty temp folder) the gh banner shows; no repos shows the empty state; each checked in light and dark at 1280 px and 375 px — agent-browser from PowerShell`
  - `[manual] pick Dark, reload with the cache off: no light flash; the Add repo form still adds, shows its error, and clears — agent-browser`
- **Depends on:** W1
- **One-way door:** none
- **Model:** opus

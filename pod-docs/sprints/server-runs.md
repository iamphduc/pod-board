# Sprint: Server, live updates, and screen 1

_From plan: pod-docs/plans/board-read.md · Slug: server-runs · Status: active · Generated: 2026-10-18_

<!-- autopilot-run: started=2026-10-18T21:42:12-07:00 sprints=1 waves=5 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | L1 | Look: tokens, self-hosted fonts, both themes, base controls | server-runs-L1 | [#4](https://github.com/iamphduc/pod-board/pull/4) merged | done | medium | — |
| 1 | M1 | Board types, transcript parser, per-slice detail fields, `currentWave` on done sprints | server-runs-M1 | [#4](https://github.com/iamphduc/pod-board/pull/4) merged | done | high | — |
| 1 | G1 | Cached read-only `gh` reader | server-runs-G1 | [#4](https://github.com/iamphduc/pod-board/pull/4) merged | done | high | — |
| 1 | D1 | Discovery readers (config, claim files, repo docs, transcript files) and the request guard | server-runs-D1 | [#4](https://github.com/iamphduc/pod-board/pull/4) merged | done | high | — |
| 2 | P1 | Runs list and pipeline view model | server-runs-P1 | — | pushed | medium | M1 |
| 2 | A1 | Board service, file watcher, SSE, and API routes | server-runs-A1 | — | pushed | medium | M1, G1, D1 |
| 3 | S1 | Screen 1: runs list, pipeline, slice log, Add repo, PWA manifest | server-runs-S1 | — | pending | — | L1, P1, A1 |

## Shared contract

**Times** are epoch milliseconds. **Paths** in the board are absolute, as the OS gives them.

**Board types** (M1, `packages/model/src/board.ts`, exported from the model's `index.ts`):
```ts
type AgentRun = { id: string; session: string; type: string; description: string
  sprint?: string; slice?: string; branch?: string; plan?: string; round?: number
  model?: string; startedAt?: number; lastAt?: number; tokens: number; ended: boolean }
type AgentState = 'running' | 'ended' | 'stale'
type PrStatus = { number: number; state: 'open' | 'merged' | 'closed'
  checks: 'pass' | 'fail' | 'pending' | 'none'; url?: string; checkedAt: number }
type GhStatus = 'ok' | 'missing' | 'logged-out' | 'unknown'
type Claim = { portBase: number; repoPath: string; plan: string }
type BoardRepo = { id: string; name: string; path: string; source: 'registered' | 'claim' | 'both'
  error?: string; model: RepoModel; agents: AgentRun[]; prs: PrStatus[]; claims: Claim[] }
type Board = { generatedAt: number; gh: GhStatus; ghCheckedAt?: number; repos: BoardRepo[] }
```
G1 declares `PrStatus` and `GhStatus` in `packages/server/src/gh.ts` with exactly this shape (it runs beside M1); A1's typecheck proves they match.

**Transcripts** (M1 parses, D1 finds): `<claude-dir>/projects/<project-dir>/<session>/subagents/agent-<id>.jsonl` plus `agent-<id>.meta.json` (`{"agentType":"pod:engineer","description":"…"}`). `<project-dir>` is the repo path with each character outside `[A-Za-z0-9]` replaced by `-` (`E:\Projects\chess-web` → `E--Projects-chess-web`). A JSONL record has `type`, `timestamp` (ISO), and on assistant records `message.id`, `.model`, `.usage`, `.stop_reason`, `.content[]`; one message repeats over several records with the same `message.id`. No transcript text, tool input, or tool output ever enters an `AgentRun`.

**`agentState(a, now)`**: `ended` → `'ended'`; else `now - lastAt < STALE_MS` (30 minutes) → `'running'`; else (or no `lastAt`) → `'stale'`.

**Agent → plan, sprint, slice.** An agent belongs to plan P when `a.plan === P.slug` or `a.sprint` is one of P's sprints. It belongs to slice X of sprint S when `a.sprint === S && a.slice === X`; with a slice but no sprint, to the first sprint (plan order) whose board has code X. An engineer whose branch is `<sprint>-w<N>-fix` counts toward wave N's time and tokens, not a slice. A reviewer with `a.plan === P.slug` is a review round of P; an engineer on branch `<P>-fix` is P's fix pass.

**Hand-back and halt** (P1 and A1 both use them): a plan's **hand-back PR** is N from the last pending entry in `plan.queue` whose route starts with `orchestrator`, whose body matches `/complete|final PR|hand-?back|awaiting/i`, and that links `/pull/<N>`. A plan is **halted** when its queue has a pending `BLOCKED` entry from `orchestrator`.

**PRs the board asks `gh` about** (A1): per non-archived plan, the PR numbers of the current sprint's slices whose `pr.state` is `open`, plus the hand-back PR. Nothing else.

**Request guard** (D1 builds, A1 applies to every route): `Host` must be `127.0.0.1:<p>` or `localhost:<p>` with `p` the API or web port, else `403 { error: 'forbidden host' }` (missing `Host` too). Any method other than GET and HEAD also needs `Origin` equal to `http://127.0.0.1:<p>` or `http://localhost:<p>` for the same ports, else `403 { error: 'forbidden origin' }` (missing `Origin` too). No response carries `Access-Control-Allow-*` headers.

**API** (A1). All JSON unless noted.
- `GET /api/health` → `200 { ok: true }` (unchanged).
- `GET /api/board` → `200 Board`.
- `GET /api/events` → `text/event-stream`. On connect: `event: board` with `data:` the Board JSON. After that, the same event each time the Board's JSON changes (at most one per 300 ms debounce). A `: ping` comment every 15 s.
- `POST /api/repos` with `Content-Type: application/json` and `{ "path": string }` → `201 { path }` (the normalized path); a `board` event follows. Errors: wrong content type → `415`; bad JSON or no string `path` → `400 { error: 'bad request' }`; relative → `400 { error: 'not absolute' }`; missing or not a folder → `400 { error: 'not a directory' }`; already registered → `409 { error: 'already registered' }`; config file unreadable → `500 { error: 'config unreadable' }`.

**Repo identity** (D1): `normalizeRepoPath(p, platform)` resolves, drops trailing separators, and on `win32` uses `\`. Two paths are the same repo when their normalized forms match, ignoring case when the folder's file system ignores case (`ignoresCase(dir)`, probed per repo; a missing folder falls back to the OS default: win32 and macOS ignore case). `repoId` is the normalized path with every character outside `[A-Za-z0-9]` replaced by `-`, lowercased when the file system ignores case. `sameRepoPath(a, b, platform, ignoresCase)` and `repoId(p, platform, ignoresCase)` take that value (wave 1 fix, PR #5). `name` is the folder's base name.

**Env** (D1 reads, A1 documents in the smoke recipe): `POD_BOARD_CONFIG_DIR` (config folder override), `POD_BOARD_PORTS_DIR` (default `<os temp>/pod-ports`), `POD_BOARD_CLAUDE_DIR` (default `CLAUDE_CONFIG_DIR`, else `~/.claude`), `POD_BOARD_TRANSCRIPT_DAYS` (default 30), `POD_BOARD_POLL=1` (watch by polling).

**`currentWave`** (settles queue entry R1): absent when the sprint's status is `done`. Other rules in `pod-docs/feature-details/run-model.md` stand.

**Look.** Only L1 edits `packages/web/src/theme/`. Token names follow the preview (`--bg`, `--panel`, `--panel-2`, `--line`, `--fg`, `--muted`, `--accent`, `--accent-soft`, `--ok`, `--ok-soft`, `--warn`, `--warn-soft`, `--bad`, `--bad-soft`, `--idle`, `--idle-soft`, `--display`, `--body`, `--mono`) plus `--accent-ink`, `--ok-ink`, `--warn-ink`, `--bad-ink`, `--idle-ink` for state text on its soft fill, and size tokens. State classes: chips `.chip.s-run|s-ok|s-you|s-bad|s-idle`, card edges `.card.k-run|k-ok|k-you|k-bad`, buttons `.btn`, `.btn.primary`, text input `.input`.

## Per-slice detail

### L1: Look: tokens, self-hosted fonts, both themes, base controls
- **Scope:** Turn the plan's `## Look` and `docs/design/preview.html` into theme files: every palette value as a token for light and dark, dark applied by `prefers-color-scheme` unless `data-theme="light"`, and by `data-theme="dark"` (the preview's selectors). **Ink tokens:** the Look's light state colors don't reach 4.5:1 as chip text on their soft fills (light `--idle` on `--idle-soft` is about 3.4:1, `--warn` 3.7:1, `--ok` 3.8:1, `--bad` 4.3:1). Keep every Look value as written for dots, card edges, and fills, and add `--*-ink` for text: in dark, ink equals the base color; in light, ink is the base color where it passes, else the same hue with HSL lightness lowered by the fewest whole percent that passes 4.5:1 on both its soft fill and `--panel`. Fonts: Bricolage Grotesque (600, 700), Instrument Sans (400, 500, 600), JetBrains Mono (400, 500) as woff2 files under `packages/web/public/fonts/` with their OFL license files, declared by `@font-face` with `url('/fonts/…')`. Body text 16 px; size tokens for the preview's dense sizes, none under 12 px. Base styles for the contract's state classes, `.frame`, `.eyebrow`, `.mono`, and a visible `:focus-visible` ring; buttons and inputs drop default browser looks. `theme.ts`: `type ThemeChoice = 'system' | 'light' | 'dark'`, `readChoice(storage)`, `saveChoice(storage, choice)`, `applyTheme(choice, root)` (sets `data-theme`, or removes it for `system`), storage key `pod-board-theme`. `index.css` imports the rest; S1 imports it. Not in scope: screen layouts, the toggle control.
- **Files owned:** `packages/web/src/theme/tokens.css` (new), `packages/web/src/theme/fonts.css` (new), `packages/web/src/theme/base.css` (new), `packages/web/src/theme/index.css` (new), `packages/web/src/theme/theme.ts` (new), `packages/web/src/theme/theme.test.ts` (new), `packages/web/src/theme/tokens.test.ts` (new), `packages/web/public/fonts/**` (new)
- **Success criteria:**
  - `[test] each Look palette token has the plan's value in light and in dark, and both dark selectors hold the same set — packages/web/src/theme/tokens.test.ts › palette tokens match the Look`
  - `[test] fg and muted on bg, panel, panel-2; each ink on its soft fill and on panel; panel on accent — all at least 4.5:1 in both themes — packages/web/src/theme/tokens.test.ts › text contrast is at least 4.5 to 1`
  - `[test] dark inks equal their base; each light ink keeps its base hue (within 1 degree) — packages/web/src/theme/tokens.test.ts › ink tokens keep the Look's hues`
  - `[test] every @font-face url starts with /fonts/ and the file exists; the three families and weights are declared; no theme file names an http(s) host — packages/web/src/theme/tokens.test.ts › fonts are served from the app`
  - `[test] body text is 16 px and no font size in the theme is under 12 px — packages/web/src/theme/tokens.test.ts › type sizes`
  - `[test] readChoice: stored light/dark returned; missing, unknown value, or storage that throws → system — packages/web/src/theme/theme.test.ts › readChoice falls back to system`
  - `[test] applyTheme sets data-theme for light and dark and removes it for system; saveChoice then readChoice round-trips — packages/web/src/theme/theme.test.ts › applyTheme and saveChoice`
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### M1: Board types, transcript parser, per-slice detail fields, `currentWave` on done sprints
- **Scope:** Add `board.ts` with the contract's types and `transcript.ts` with `parseAgentTranscript({ id, session, meta, jsonl }): AgentRun | undefined`, `agentState`, and `STALE_MS`. Parser rules: `undefined` when `meta` isn't JSON or `agentType` doesn't start with `pod:`; `type` and `description` (cut to 80 characters) from meta; dispatch fields from `parseDispatch` of the first `user` record's prompt (string content, or its first text block); `startedAt`/`lastAt` from the first and last valid `timestamp`; `tokens` is `turnTokens` summed once per `message.id`; `model` from the last assistant record; `ended` when any `tool_use` is named `SubagentHandback` or the last assistant record's `stop_reason` is `end_turn`. A bad JSON line, a partial last line, or a record missing fields is skipped, never a throw. Test transcripts are built inline in the shape the contract describes (no new fixtures); during the slice, run the parser over a few real local transcripts and name what you saw in the report. In `run-model.ts`: `SliceModel` gains `model?: string`, `filesOwned: string[]`, `oneWayDoor?: string` from the sprint doc's `### <code>: <title>` section (exact code match): `**Model:**` → first word, lowercased; `**Files owned:**` → backticked paths in order without `(new)`, else comma-split; `**One-way door:**` → the text, absent when it starts with the word `none`; no section → absent or `[]`. Apply the contract's `currentWave` rule. Export `board.ts` and `transcript.ts` from `index.ts`. Update `pod-docs/feature-details/run-model.md` (new fields, `currentWave`, transcript rules). Don't edit the pod-flow copy.
- **Files owned:** `packages/model/src/board.ts` (new), `packages/model/src/transcript.ts` (new), `packages/model/src/transcript.test.ts` (new), `packages/model/src/run-model.ts`, `packages/model/src/run-model.test.ts`, `packages/model/test/fixtures.test.ts`, `packages/model/src/index.ts`, `pod-docs/feature-details/run-model.md`, `packages/model/fixtures/chess-web/pod-docs/sprints/ladder.md`, `packages/model/fixtures/README.md` (added by the orchestrator: the per-slice detail criterion needs the fixture's `### <code>:` sections, and no other wave-1 slice owns them)
- **Success criteria:**
  - `[test] an engineer transcript gives type, description, sprint, slice, branch, model, startedAt, lastAt — packages/model/src/transcript.test.ts › reads an engineer transcript`
  - `[test] records repeating one message.id count its usage once; cache reads are left out — packages/model/src/transcript.test.ts › tokens count each message once`
  - `[test] ended by SubagentHandback, ended by end_turn, not ended mid-turn — packages/model/src/transcript.test.ts › ended rules`
  - `[test] agentState: ended; lastAt 29 min ago → running; 30 min → stale; no lastAt → stale — packages/model/src/transcript.test.ts › agentState edges`
  - `[test] non-pod agentType, bad meta, bad lines, a partial last line, and empty text never throw — packages/model/src/transcript.test.ts › tolerates bad transcripts`
  - `[test] a planted fake secret in assistant text, tool input, and tool output appears nowhere in the JSON of the result — packages/model/src/transcript.test.ts › never keeps transcript text`
  - `[test] Model, Files owned (with (new) and without backticks) and One-way door read per slice; "none. …" → absent; no section → absent — packages/model/src/run-model.test.ts › per-slice detail fields`
  - `[test] a done sprint with a blocked or skipped slice has no currentWave; an active one keeps it — packages/model/src/run-model.test.ts › currentWave on a done sprint`
  - `[test] chess-web ladder slices carry their Model and Files owned from the fixture — packages/model/test/fixtures.test.ts › chess-web per-slice detail`
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### G1: Cached read-only `gh` reader
- **Scope:** `packages/server/src/gh.ts`: `createGhReader({ exec, now })` → `{ status(): GhStatus; checkedAt(): number | undefined; get(repoPath, n): PrStatus | undefined; refresh(repoPath, numbers): Promise<boolean> }` (`true` when any cached value changed). `exec(args, cwd)` is injected; the default uses `execFile('gh', …)` with no shell and a 10 s timeout. It only runs `gh auth status` and `gh pr view <n> --json number,state,url,statusCheckRollup`. Rules: `gh` not found → `missing`; `auth status` non-zero → `logged-out`, rechecked at most once per 60 s; while not `ok`, no `pr view` runs. A PR is fetched at most once per 30 s, however often asked; concurrent asks share one call; a `merged` or `closed` PR is never fetched again. A failed `pr view` keeps the last value. Checks: no rollup → `none`; any failed, errored, cancelled, or timed-out → `fail`; any not completed → `pending`; else `pass`.
- **Files owned:** `packages/server/src/gh.ts` (new), `packages/server/src/gh.test.ts` (new)
- **Success criteria:**
  - `[test] every exec call is "auth status" or "pr view <n> --json …", run in the repo folder — packages/server/src/gh.test.ts › runs only read-only commands`
  - `[test] gh missing → missing; auth fails → logged-out with no pr view; recheck after 60 s, not before — packages/server/src/gh.test.ts › gh status`
  - `[test] a second ask within 30 s makes no call; after 30 s it does; two asks at once make one call — packages/server/src/gh.test.ts › caches each PR for 30 seconds`
  - `[test] a merged or closed PR is never fetched again; a failed fetch keeps the last value — packages/server/src/gh.test.ts › final and failed PRs`
  - `[test] state and each checks value map from gh JSON — packages/server/src/gh.test.ts › maps pr view output`
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### D1: Discovery readers and the request guard
- **Scope:** Server modules, each with injected paths so tests use temp folders; nothing writes inside a repo.
  - `config.ts` (extend): `configPath(env, platform, home)`: `POD_BOARD_CONFIG_DIR` → `<dir>/config.json`; `win32` → `%APPDATA%\pod-board\config.json` (no `APPDATA` → `<home>\AppData\Roaming\…`); `darwin` → `<home>/Library/Application Support/pod-board/config.json`; else `$XDG_CONFIG_HOME/pod-board/config.json` or `<home>/.config/pod-board/config.json`. Keep `portFromEnv` and `listenConfig` as they are.
  - `repos-config.ts`: file `{ "version": 1, "repos": [{ "path": "…" }] }`. `loadRepos(file)` → `{ repos: string[] } | { error: 'config unreadable' }` (missing file → empty list). `addRepo(file, path, platform)` with the API's error words; it never overwrites an unreadable file; writes via a temp file and rename, creating the folder.
  - `claims.ts`: `parseClaim(fileName, text)`: integer file name → `portBase`; plan is the last whitespace-separated token, `repoPath` the rest, trimmed (it may hold spaces); anything else → `undefined`. `readClaims(dir)`: missing folder → `[]`; claims whose repo folder is gone are dropped.
  - `repo-files.ts`: `readRepoFiles(repoPath): Promise<RepoFiles>` reads only `pod-docs/README.md`, `pod-docs/handoff-queue.md`, and `.md` files directly in `pod-docs/plans/`, `plans/archive/`, `sprints/`, `sprints/archive/`; keys with `/`; files over 5 MB skipped; read-only opens.
  - `transcript-files.ts`: `claudeDir(env, home)`, `projectDirName(repoPath)`, `listAgentFiles(claudeDir, repoPath, maxAgeDays, now)` (sessions whose folder changed within the window), and `readAgentFile` cached by size and mtime → `{ id, session, meta, jsonl }`. Missing folders → `[]`.
  - `guard.ts`: `requestGuard({ ports })` Hono middleware per the contract's Request guard; `normalizeRepoPath` and `repoId` per Repo identity.
- **Files owned:** `packages/server/src/config.ts`, `packages/server/src/config.test.ts`, `packages/server/src/repos-config.ts` (new), `packages/server/src/repos-config.test.ts` (new), `packages/server/src/claims.ts` (new), `packages/server/src/claims.test.ts` (new), `packages/server/src/repo-files.ts` (new), `packages/server/src/repo-files.test.ts` (new), `packages/server/src/transcript-files.ts` (new), `packages/server/src/transcript-files.test.ts` (new), `packages/server/src/guard.ts` (new), `packages/server/src/guard.test.ts` (new)
- **Success criteria:**
  - `[test] configPath for the override, win32 with and without APPDATA, darwin, linux with and without XDG_CONFIG_HOME; existing port tests still pass — packages/server/src/config.test.ts › configPath per OS`
  - `[test] add, reload, and duplicate (incl. other case and slashes on win32); relative and missing paths refused; nothing written on refusal — packages/server/src/repos-config.test.ts › addRepo rules`
  - `[test] a corrupt config file reads as unreadable and addRepo leaves it byte-for-byte unchanged — packages/server/src/repos-config.test.ts › never overwrites an unreadable config`
  - `[test] "3100" + "E:/My Repos/x plan-a" → base 3100, path with the space, plan plan-a; bad name, empty, one token → undefined — packages/server/src/claims.test.ts › parseClaim`
  - `[test] missing ports folder → []; a claim for a deleted repo is dropped — packages/server/src/claims.test.ts › readClaims`
  - `[test] only the listed pod-docs files are read, keys use "/", deeper folders, non-.md, and over-size files are left out — packages/server/src/repo-files.test.ts › reads only pod docs`
  - `[test] projectDirName maps a Windows and a POSIX path; sessions older than the window are left out; an unchanged file isn't read twice — packages/server/src/transcript-files.test.ts › finds agent transcripts`
  - `[test] allowed and refused Host values (foreign name, unlisted port, no port, missing); POST with a good, foreign, and missing Origin; no Access-Control headers — packages/server/src/guard.test.ts › request guard`
  - `[test] normalizeRepoPath and repoId: trailing slash, mixed slashes, case on win32 — packages/server/src/guard.test.ts › repo identity`
- **Depends on:** —
- **One-way door:** none. It writes only the board's own config file, never over an unreadable one; the guard only refuses requests.
- **Model:** opus

### P1: Runs list and pipeline view model
- **Scope:** Pure functions on M1's types and the ported helpers (`isDone`, `formatTokens`), exported from `index.ts`. Add `pod-docs/feature-details/runs-and-pipeline.md` (new): these rules and why.
  - `listRuns(board, now): RunSummary[]`, `RunSummary = { repoId; repo; plan?; title?; where: string; state: 'blocked' | 'needs-you' | 'running' | 'idle' | 'unsupported' | 'error'; portBase? }`. One run per plan that isn't `archived` and either has a sprint not `done` or a pending hand-back. A repo with none → one `idle` run, `where: 'no active plan'`. Unsupported docs → one `unsupported` run, `where: 'update pod'`; `error` set → one `error` run. State, first match wins: `blocked` (halted, a `blocked` slice or `skipped` PR in the current sprint) → `needs-you` (any plan queue item with `needsYou`) → `running` (an agent of the plan is `running`, or a current-wave slice is `pushed`) → `idle`. `where`: `<sprint> · wave <w>/<n>`; current sprint with no doc → `<sprint> · drafting` if a running `pod:sprint-planner` names the plan, else `<sprint> · not drafted`; no current sprint → `final review` while a reviewer runs, `final PR` with a hand-back, else `all sprints done`. `portBase` from a claim for the plan, else the plan's `portBase`. Order: state in the order above, then repo name, then plan slug. `activeRuns(runs)` counts `blocked`, `needs-you`, `running`.
  - `buildPipeline(repo, planSlug, now): Pipeline | undefined` (undefined for an unknown plan), types `Step = { key; label; state: 'done' | 'live' | 'wait' | 'you' | 'blocked' | 'unknown'; detail }`, `Stage = { key; caption; steps }`, `Pipeline = { stages; log: LogGroup[] }`, `LogGroup = { sprint; wave; label; status; rows: LogRow[] }`, `LogRow = { code; title; model?; confidence?; minutes?; tokens?; live: boolean }`. Stages: **Plan** (`Plan` done; `Go` unknown, detail `not recorded yet`); one per sprint, caption `Sprint i of n` (a done sprint → one done step `<k> waves`; the current sprint with a doc → one step per wave; others → one wait step `not drafted`); **Check** (`Final review`: live while a reviewer runs, done when one ended and none runs, else wait, detail `round r` or `<k> rounds`; `Fix pass` likewise from the fix-pass engineer); **Ship** (`Final PR`: `you` with a hand-back whose PR isn't merged in `prs`, done when merged, else wait). Wave step state, first match wins: `blocked` (a blocked slice or skipped PR) → `you` (a `needsYou` queue item naming a slice of this wave and sprint) → `done` (every slice `isDone`) → `live` (it is `currentWave`, a slice is `pushed`, or one of its engineers runs) → `wait`. Wave detail: done `<k> engineers · <m> min · <t> tok`; live `<k> engineers · <m> min so far`; wait `<s> slices planned`; with no agents, time and tokens are left out, never shown as 0. Minutes = span from the earliest `startedAt` to the latest `lastAt` (or `now` while live), rounded. Log: every wave of every sprint with a doc, in sprint order then wave; group label `Sprint i · wave w`, status `merged PR #N`, `PR #N open`, `running`, `blocked`, or `planned`; one row per slice with its model, confidence (`—` → absent), minutes and tokens from its agents.
- **Files owned:** `packages/model/src/runs.ts` (new), `packages/model/src/runs.test.ts` (new), `packages/model/src/pipeline.ts` (new), `packages/model/src/pipeline.test.ts` (new), `packages/model/src/index.ts`, `pod-docs/feature-details/runs-and-pipeline.md` (new)
- **Success criteria:**
  - `[test] each run state, and the precedence when several apply — packages/model/src/runs.test.ts › run state precedence`
  - `[test] where text for mid-wave, drafting, not drafted, final review, final PR, all done — packages/model/src/runs.test.ts › where text`
  - `[test] archived and finished plans drop out; a repo with no plan gives one idle run; unsupported and error repos give one run each — packages/model/src/runs.test.ts › which plans are runs`
  - `[test] runs sort by state, then repo, then plan; activeRuns counts three states — packages/model/src/runs.test.ts › order and count`
  - `[test] stages and captions for a mid-run plan with one done, one current, one planned sprint — packages/model/src/pipeline.test.ts › stages of a mid-run plan`
  - `[test] wave step precedence: blocked over you over done over live over wait — packages/model/src/pipeline.test.ts › wave step state`
  - `[test] wave minutes and tokens from its engineers and wave-fix agents; none → left out; live uses now — packages/model/src/pipeline.test.ts › wave time and tokens`
  - `[test] agents map to slices by sprint and code, else the first board with the code — packages/model/src/pipeline.test.ts › agents join slices`
  - `[test] review rounds, fix pass, and final PR states, including a merged hand-back — packages/model/src/pipeline.test.ts › check and ship stages`
  - `[test] slice log groups, labels, statuses, and rows — packages/model/src/pipeline.test.ts › slice log`
  - `[test] an unknown plan → undefined; an empty, unsupported, or error repo never throws — packages/model/src/pipeline.test.ts › unknown plan and empty repo`
- **Depends on:** M1
- **One-way door:** none
- **Model:** opus

### A1: Board service, file watcher, SSE, and API routes
- **Scope:** `board-service.ts`: builds the `Board` from registered repos plus claims (merged by Repo identity; `source` set), each repo through `readRepoFiles` → `buildRepoModel`, its agents through `listAgentFiles`/`readAgentFile` → `parseAgentTranscript`, its `prs` through the gh reader for the contract's PR list, and its claims. A repo folder that's gone or unreadable → `error` set and `model` from an empty snapshot. Repos sorted by name. `watcher.ts`: chokidar on each repo's `pod-docs/`, the ports folder, each repo's transcript project folder, and the config file; any event → rebuild after a 300 ms debounce; a 30 s timer refreshes `gh` and agent states; the watch list follows added repos and new claims; `POD_BOARD_POLL=1` → polling. Emit only when the Board's JSON changed. `app.ts`: `createApp(deps)` with the request guard on every route and the contract's API. `main.ts`: wire it all, guard ports = API and web port. Update the existing app tests to send an allowed `Host` (and `Origin` for POST). Add `pod-docs/feature-details/server.md` (new). Update `pod-docs/codebase-structure.md` (parts, env, smoke recipe: run with `POD_BOARD_CONFIG_DIR` set to a temp folder, add a repo, `GET /api/board`) and `README.md`. Add chokidar to the server package.
- **Files owned:** `packages/server/src/board-service.ts` (new), `packages/server/src/board-service.test.ts` (new), `packages/server/src/watcher.ts` (new), `packages/server/src/watcher.test.ts` (new), `packages/server/src/app.ts`, `packages/server/src/app.test.ts`, `packages/server/src/main.ts`, `packages/server/package.json`, `pnpm-lock.yaml`, `pod-docs/feature-details/server.md` (new), `pod-docs/codebase-structure.md`, `README.md`
- **Success criteria:**
  - `[test] a temp repo built from the chess-web fixture plus a claim and a transcript gives one BoardRepo with source both, model, agents, and claims — packages/server/src/board-service.test.ts › builds the board`
  - `[test] a deleted repo folder gives error set and an unsupported model; other repos still build — packages/server/src/board-service.test.ts › a missing repo fails soft`
  - `[test] gh is asked only for open current-sprint PRs and the hand-back PR — packages/server/src/board-service.test.ts › asks gh only for live PRs`
  - `[test] after a build and a watch cycle, every file in the temp repo has its old bytes and mtime and no file was added — packages/server/src/board-service.test.ts › never writes into a repo`
  - `[test] a sprint doc edit reaches an SSE client as a board event within 5 s; three quick edits give one event — packages/server/src/watcher.test.ts › changes reach clients within 5 seconds`
  - `[test] no event when a rebuild gives the same JSON; a new claim file adds its repo — packages/server/src/watcher.test.ts › emits only on change`
  - `[test] GET /api/board and /api/events first event return the Board; a ping comment is sent — packages/server/src/app.test.ts › board and events routes`
  - `[test] POST /api/repos: 201, 415, 400 (bad JSON, relative, missing), 409, 500; a board event follows a 201 — packages/server/src/app.test.ts › add repo route`
  - `[test] every route, health included, refuses a foreign Host; POST refuses a foreign Origin; health and 404 tests still pass — packages/server/src/app.test.ts › guard on every route`
  - `[manual] the updated smoke recipe works from a fresh clone against this repo and one fixture repo — run it`
- **Depends on:** M1, G1, D1
- **One-way door:** none
- **Model:** opus

### S1: Screen 1: runs list, pipeline, slice log, Add repo, PWA manifest
- **Scope:** Replace the bootstrap page with screen 1 per the Look and the preview's "Screen 1": the runs list (repo, `where`, state chip, `Runs · N active`) beside the main view (bar with `repo · plan`, state chip, `ports <B>`; the pipeline stages; the slice log table). At 375 px the runs list stacks above the main view and the pipeline scrolls sideways in its frame. Use only L1's tokens and classes; screen styles go in the screen's own CSS with no color literals. Every state shows a chip or card edge, never text alone. A theme control (system, light, dark) in the bar uses L1's `theme.ts`. Logic lives in tested `.ts` modules; components stay glue:
  - `board-stream.ts`: `createBoardStream(open, onBoard, onState)` over an injected EventSource factory; states `connecting`, `live`, `lost`; on error it keeps the last Board, shows `lost`, and reconnects after 1 s, doubling to 30 s at most, reset on success; malformed data is ignored.
  - `selection.ts`: the selected run from the URL hash `#/<repoId>/<plan>`; a hash naming no run → the first run; no runs → none. Live minutes recompute every 30 s.
  - `add-repo.ts`: the form's state machine: submit trims the path, empty → no request; while sending, a second submit does nothing; 201 → input clears; an error shows the API's error word as a sentence and keeps the input; Escape clears input and error.
  - PWA: `public/manifest.webmanifest` (`name` "Pod Board", `short_name`, `start_url` `/`, `display` `standalone`, `background_color` and `theme_color` from the light tokens, 192 and 512 px PNG icons, one `maskable`), linked from `index.html` with `theme-color` metas for both schemes; `index.html` loads nothing from another host. Add `@pod-board/model` to the web package. Update the smoke recipe's Key URLs.
- **Files owned:** `packages/web/index.html`, `packages/web/package.json`, `pnpm-lock.yaml`, `packages/web/src/main.tsx`, `packages/web/src/App.tsx`, `packages/web/src/screens/**` (new), `packages/web/src/board-stream.ts` (new), `packages/web/src/board-stream.test.ts` (new), `packages/web/src/selection.ts` (new), `packages/web/src/selection.test.ts` (new), `packages/web/src/add-repo.ts` (new), `packages/web/src/add-repo.test.ts` (new), `packages/web/src/pwa.test.ts` (new), `packages/web/public/manifest.webmanifest` (new), `packages/web/public/icons/**` (new), `pod-docs/codebase-structure.md`
- **Success criteria:**
  - `[test] connect → live; error → lost with the last board kept; reconnect delays 1, 2, 4 … 30 s, reset after success; bad data ignored — packages/web/src/board-stream.test.ts › reconnects and keeps the last board`
  - `[test] hash picks the run; unknown hash → first run; no runs → none; the run vanishing moves to the first — packages/web/src/selection.test.ts › selected run`
  - `[test] add repo: empty does nothing, double submit sends once, 201 clears, 409 shows the error and keeps the input, Escape clears — packages/web/src/add-repo.test.ts › add repo form`
  - `[test] manifest fields and icon files exist with their sizes; index.html links it, has both theme-color metas, and names no other host — packages/web/src/pwa.test.ts › installable manifest`
  - `[test] screen CSS uses no hex, rgb, or hsl color literal — packages/web/src/pwa.test.ts › screens use only tokens`
  - `[manual] with the board on this repo and the chess-web fixture copied to a temp folder: runs list, pipeline, and slice log match the preview's screen 1 in light and dark, at desktop and 375 px (list above, pipeline scrolls in its frame), fonts load from the app — agent-browser from PowerShell`
  - `[manual] edit a slice status in the temp repo; the screen changes within 5 s without a reload; stop the API and see the lost state, start it and see it recover — agent-browser`
  - `[manual] Chrome or Edge offers to install the app from 127.0.0.1 — check the address bar`
- **Depends on:** L1, P1, A1
- **One-way door:** none
- **Model:** opus

# Sprint: Bootstrap and run model

_From plan: pod-docs/plans/board-read.md · Slug: bootstrap-model · Status: active · Generated: 2026-10-18_
<!-- autopilot-run: started=2026-10-18T21:42:12-07:00 sprints=0 waves=1 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | B1 | Bootstrap: pnpm workspace, Vitest, health route, smoke recipe, three-OS CI | bootstrap-model-B1 | — | pending | — | — |
| 2 | P1 | Port the pod-flow parsers and their tests into `model` | bootstrap-model-P1 | — | pending | — | B1 |
| 2 | F1 | Scrubbed real-run fixtures, fixture loader, and the scrub check | bootstrap-model-F1 | — | pending | — | B1 |
| 2 | X1 | Format readers: docs version, PR cell, depends-on cell, needs-you, plan extras | bootstrap-model-X1 | — | pending | — | B1 |
| 3 | R1 | Run model: repo → plans → sprints → waves → slices, queue, PRs | bootstrap-model-R1 | — | pending | — | P1, F1, X1 |

## Shared contract

**Workspace.** pnpm workspace, packages in `packages/model`, `packages/server`, `packages/web`, named `@pod-board/model`, `@pod-board/server`, `@pod-board/web`. TypeScript strict, ESM, `noUncheckedIndexedAccess`, Node 22 or later. `@pod-board/model` is used as TypeScript source through its package `exports` (no build step of its own). One root Vitest config runs `packages/*/src/**/*.test.ts` and `packages/*/test/**/*.test.ts`.

**Root scripts** (B1): `pnpm dev`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm verify` = typecheck, then test, then build. `pnpm verify` is the smoke recipe's `Verification:` and the CI verify job.

**Ports.** API server: `POD_BOARD_API_PORT`, default `3000`. Web dev server: `POD_BOARD_WEB_PORT`, default `3001`, and it proxies `/api` to the API port. Both bind to `127.0.0.1` only.

**`model` has no I/O.** Nothing under `packages/model/src/` imports `node:*` builtins, `fs`, `path`, `child_process`, or network code. Tests under `packages/model/test/` may read files.

**Repo snapshot** (input to the run model):
```ts
type RepoFiles = Record<string, string> // repo-relative path → file text
```
Keys may use `/` or `\` (Windows). Readers normalize to `/`. A file that isn't in the map doesn't exist.

**Format readers** (X1, `packages/model/src/formats.ts`):
```ts
const SUPPORTED_DOCS_VERSION = 2
type DocsVersion = { supported: true; version: 2 } | { supported: false; version: number | undefined }
docsVersion(readme: string | undefined): DocsVersion
type PrRef = { state: 'none' | 'open' | 'merged' | 'skipped' | 'blocked' | 'unknown'; number?: number; url?: string }
prRef(cell: string, sliceStatus: string): PrRef
sliceDeps(cell: string): string[]
needsYou(entry: { type: string; route: string; isPending: boolean }): boolean
planExtras(md: string): { portBase?: number; go: 'unknown' }
```
- **Docs version:** the first line that is exactly `pod docs: <integer>` (surrounding spaces allowed, `\r\n` allowed) gives the version. A line that only mentions `pod docs:` inside prose doesn't count. No README, or no such line → `{ supported: false, version: undefined }`. Any version other than 2 → unsupported with that number.
- **PR cell**, checked in this order: the word `skipped` → `skipped`; the word `blocked` → `blocked`; the word `merged` in the cell, or slice status `done`/`merged` → `merged`; a URL → `open`; `#<N>` → `open`; `—`, `-` or empty → `none`; anything else → `unknown`. `number` comes from `/pull/<N>` or `#<N>` wherever it appears, `url` from the first `http(s)://` link; both stay set on `merged`, `skipped`, `blocked`. Real cells include `#76`, `merged`, `https://…/pull/12`, `[#225](https://…/pull/225) merged`, `skipped — verification failed`.
- **Depends-on cell:** comma-separated slice codes, backticks and spaces stripped. `—`, `-`, `none` (any case) or empty → `[]`.
- **Needs you:** pending, not `SOLVED`, and either type `BLOCKED` or the route's target (after `→` or `->`) is `human`. A resolved entry never needs you.
- **Plan extras:** `portBase` from a line `Port base: <integer>`; missing or not a number → absent. `go` is always `'unknown'`: pod doesn't record `go` or the session id yet (decisions.md, 2026-10-18), and no format is guessed.

**Run model** (R1, `packages/model/src/run-model.ts`, exported from `packages/model/src/index.ts`):
```ts
buildRepoModel(files: RepoFiles): RepoModel // never throws
type RepoModel = { docs: DocsVersion; plans: PlanModel[]; queue: QueueItem[] }
type PlanModel = { slug: string; title: string; status: string; portBase?: number; go: 'unknown'
  sprints: SprintModel[]; queue: QueueItem[]; currentSprint?: string }
type SprintModel = { slug: string; goal: string; status: 'planned' | 'active' | 'done' | 'unknown'
  hasDoc: boolean; isArchived: boolean; waves: WaveModel[]; currentWave?: number }
type WaveModel = { wave: number; slices: SliceModel[] }
type SliceModel = { code: string; title: string; branch: string; status: string; confidence: string
  pr: PrRef; dependsOn: string[] }
type QueueItem = QueueEntry & { needsYou: boolean } // QueueEntry from the ported parsers
```
Rules R1 owns (edges in R1's Scope): an unsupported docs version parses nothing else; a missing field reads as `unknown`, empty, or absent, never as a throw.

**Fixtures** (F1): `packages/model/fixtures/<repo>/` mirrors a repo root (for example `fixtures/chess-web/pod-docs/plans/sparring-ladder.md`). `loadFixture(name: string): RepoFiles` in `packages/model/test/load-fixture.ts` reads one, keys relative with `/`. Repos: `chess-web` and `ytb-feed` (docs version 2), and `speak-out` and `skyscraper-view` (the older `docs/` layout, no `pod-docs/README.md`). chess-web includes the `sparring-ladder` plan and its active `ladder` sprint doc with every table kept as it was.

## Per-slice detail

### B1: Bootstrap: pnpm workspace, Vitest, health route, smoke recipe, three-OS CI
- **Scope:** The thinnest runnable stack per the Shared contract's Workspace, Root scripts and Ports. `packages/server`: a Hono app factory `createApp()` with `GET /api/health → 200 { ok: true }`, a `listenConfig(env)` that returns `{ hostname: '127.0.0.1', port }` and throws a clear error for a port that isn't an integer from 1 to 65535, and a `main.ts` that starts it (dev via `tsx`). `packages/web`: React + Vite page showing "Pod Board" and the health result; no styling (the look foundation comes with the first UI sprint). `packages/model`: package, tsconfig, and an `index.ts` placeholder export. Add `.gitattributes` with `* text=auto eol=lf` so fixtures check out the same on Windows. pnpm via `corepack enable pnpm` if missing, with `packageManager` pinned in the root `package.json`. Commit `pnpm-lock.yaml`. Add `.github/workflows/pod-ci.yml`: on `pull_request` and on `push` to `pod-staging`; a **verify** job on `ubuntu-latest`, `windows-latest`, `macos-latest` with Node 22 and pnpm set up (`pnpm/action-setup`), running `pnpm install --frozen-lockfile` then `pnpm verify`; a **secrets** job running `gitleaks/gitleaks-action@v2` with full history (`fetch-depth: 0`) and `GITHUB_TOKEN`. Fill `pod-docs/codebase-structure.md`: What it is, Parts, How they connect, **Stack & conventions** (including the no-I/O rule for `model`), **`## CI`** (each job and its command), and **`## Smoke recipe`**: install step, start commands with ports from env, DB setup `none`, login `none`, key URLs on `127.0.0.1`, `Verification: pnpm verify`. Root `README.md`: how to install, run, and verify. Not in scope: Host-header check, file watching, any parser.
- **Files owned:** `package.json` (new), `pnpm-workspace.yaml` (new), `pnpm-lock.yaml` (new), `tsconfig.base.json` (new), `vitest.config.ts` (new), `.gitignore` (new), `.gitattributes` (new), `.github/workflows/pod-ci.yml` (new), `README.md`, `pod-docs/codebase-structure.md`, `packages/model/package.json` (new), `packages/model/tsconfig.json` (new), `packages/model/src/index.ts` (new), `packages/model/test/no-io.test.ts` (new), `packages/server/package.json` (new), `packages/server/tsconfig.json` (new), `packages/server/src/app.ts` (new), `packages/server/src/config.ts` (new), `packages/server/src/main.ts` (new), `packages/server/src/app.test.ts` (new), `packages/server/src/config.test.ts` (new), `packages/web/package.json` (new), `packages/web/tsconfig.json` (new), `packages/web/vite.config.ts` (new), `packages/web/index.html` (new), `packages/web/src/main.tsx` (new), `packages/web/src/App.tsx` (new)
- **Success criteria:**
  - `[test] GET /api/health answers 200 with { ok: true } — packages/server/src/app.test.ts › GET /api/health returns ok`
  - `[test] an unknown route answers 404 — packages/server/src/app.test.ts › unknown route returns 404`
  - `[test] the server always binds to 127.0.0.1, port from POD_BOARD_API_PORT — packages/server/src/config.test.ts › binds 127.0.0.1 with the env port`
  - `[test] no POD_BOARD_API_PORT → port 3000 — packages/server/src/config.test.ts › defaults to port 3000`
  - `[test] a port of 0, 65536, or "abc" throws an error naming POD_BOARD_API_PORT — packages/server/src/config.test.ts › rejects an invalid port`
  - `[test] no file under packages/model/src imports node builtins, fs, path, child_process, or http — packages/model/test/no-io.test.ts › model src does no I/O`
  - `[manual] the smoke recipe works as written from a fresh clone: install, start both servers, open the web URL on 127.0.0.1, see "Pod Board" and the health result — run it`
  - `[manual] the wave PR shows verify passing on Windows, macOS, and Linux, and secrets passing — check the PR's checks`
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### P1: Port the pod-flow parsers and their tests into `model`
- **Scope:** Copy `claude-pod/pod-flow/hooks/model.ts` and `model.test.ts` (on this machine at `E:/Projects/claude-pod/pod-flow/hooks/`) into `packages/model/src/pod-flow/`. Keep the code a faithful copy so a later shared package can diff it: change only imports. `Dispatch`, `TreeKind` and `TreeLine` come from `claude-pod/pod-flow/types/index.d.ts` into a local `types.ts` (without the `declare module 'claude-code'` block); `ModelUsage` becomes a local `Usage` type with `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. Tests switch from `claude-code/testing` to `vitest` with no other change; a test that can't pass unchanged is fixed with the smallest change and named in the slice report. Every export of the source keeps its name and behavior. A short `README.md` in the folder says where the code came from (repo-relative path and the claude-pod commit hash, never an absolute path on this machine) and that changes go in new modules, not in the copy. Not in scope: new behavior (X1 and R1 build on top), exporting from `index.ts` (R1).
- **Files owned:** `packages/model/src/pod-flow/model.ts` (new), `packages/model/src/pod-flow/model.test.ts` (new), `packages/model/src/pod-flow/types.ts` (new), `packages/model/src/pod-flow/README.md` (new)
- **Success criteria:**
  - `[test] every ported pod-flow test passes under Vitest — packages/model/src/pod-flow/model.test.ts › every ported test, names unchanged (the source has about 77)`
  - `[test] parseSprint reads a board whose PR cell is "#76" and status "merged" — packages/model/src/pod-flow/model.test.ts › parseSprint reads a real chess-web board row`
- **Depends on:** B1
- **One-way door:** none
- **Model:** opus

### F1: Scrubbed real-run fixtures, fixture loader, and the scrub check
- **Scope:** Snapshot the four repos named in the contract's Fixtures from `E:/Projects/<repo>`. For `chess-web` and `ytb-feed`: `pod-docs/README.md`, `pod-docs/plans/*.md`, `pod-docs/sprints/*.md`, `pod-docs/sprints/archive/*.md`, `pod-docs/handoff-queue.md`. For `speak-out` and `skyscraper-view`: `docs/handoff-queue.md` only. Trim to what the parsers read: title and italic header lines, `Port base:`, `pod docs:`, `## ` headings, every table row unchanged, queue entry lines, and the **Slice log** lines of `## Sprint summary`; cut other prose. No transcripts (`.jsonl`) this sprint. Add `packages/model/fixtures/README.md`: source repo, snapshot date, and what was cut. Add `loadFixture` per the contract. Add a pure scrubber `findLeaks(path: string, text: string): string[]` (each item names the rule hit) and a test that runs it on every fixture file. Scrub rules, each a failure: an email address; a home path (`C:\Users\…`, `C:/Users/…`, `/Users/…`, `/home/…`); any drive-letter absolute path (`E:\…`, `E:/…`); a token shape (`ghp_`/`gho_`/`ghs_`/`ghu_`/`github_pat_` + 20 or more characters, `sk-` + 20 or more, `AKIA` + 16 uppercase/digits, `-----BEGIN`); a file other than `.md`. GitHub URLs such as `https://github.com/iamphduc/chess-web/pull/76` are allowed. Fixtures are scrubbed as if the repo were public. Not in scope: any parser.
- **Files owned:** `packages/model/fixtures/**` (new), `packages/model/test/load-fixture.ts` (new), `packages/model/test/load-fixture.test.ts` (new), `packages/model/test/scrub.ts` (new), `packages/model/test/scrub.test.ts` (new)
- **Success criteria:**
  - `[test] no fixture file trips a scrub rule — packages/model/test/scrub.test.ts › every fixture file is clean`
  - `[test] each scrub rule catches a planted example (email, each home path form, a drive path, each token shape, a .jsonl file) — packages/model/test/scrub.test.ts › catches each planted leak`
  - `[test] a GitHub PR URL and ordinary Markdown pass — packages/model/test/scrub.test.ts › allows GitHub URLs`
  - `[test] loadFixture returns repo-relative keys with "/" on every OS, including nested archive files — packages/model/test/load-fixture.test.ts › keys are repo-relative with forward slashes`
  - `[test] loadFixture throws for an unknown fixture name — packages/model/test/load-fixture.test.ts › unknown fixture throws`
  - `[test] chess-web's ladder sprint keeps its status board rows and its Depends on column — packages/model/test/load-fixture.test.ts › chess-web ladder board is intact`
- **Depends on:** B1
- **One-way door:** none. Real-run text enters git history, but the repo stays private until the human checks the fixtures (decisions.md, 2026-10-18), and the secrets job scans every PR.
- **Model:** opus

### X1: Format readers: docs version, PR cell, depends-on cell, needs-you, plan extras
- **Scope:** Build `packages/model/src/formats.ts` exactly as the contract's Format readers section says, with tests for each rule and each edge. Pure string functions; no import from the ported parsers (the queue entry is typed by shape). Not in scope: wiring into the run model (R1).
- **Files owned:** `packages/model/src/formats.ts` (new), `packages/model/src/formats.test.ts` (new)
- **Success criteria:**
  - `[test] "pod docs: 2" → supported, with CRLF and surrounding spaces too — packages/model/src/formats.test.ts › docsVersion reads version 2`
  - `[test] "pod docs: 1" and "pod docs: 3" → unsupported with that number — packages/model/src/formats.test.ts › docsVersion rejects other versions`
  - `[test] undefined, empty, no line, "pod docs: two", or only a prose mention → unsupported with version undefined — packages/model/src/formats.test.ts › docsVersion with no version line`
  - `[test] two version lines → the first wins — packages/model/src/formats.test.ts › docsVersion first line wins`
  - `[test] each real PR cell form maps to its state and number — packages/model/src/formats.test.ts › prRef reads every cell form`
  - `[test] skipped and blocked win over a merged word or a done status — packages/model/src/formats.test.ts › prRef order skipped then blocked then merged`
  - `[test] "—" with slice status done → merged with no number; "—" with pending → none; "soon" → unknown — packages/model/src/formats.test.ts › prRef with no reference`
  - `[test] "H1, C1, M1", "`A1`", "—", "-", "none", "" read as codes or [] — packages/model/src/formats.test.ts › sliceDeps`
  - `[test] pending BLOCKED to orchestrator, pending PENDING to human (with → and ->) need you; resolved, SOLVED, and pending engineer → orchestrator don't — packages/model/src/formats.test.ts › needsYou`
  - `[test] "Port base: 3000" → 3000; missing or "Port base: tbd" → absent; go is always unknown — packages/model/src/formats.test.ts › planExtras`
- **Depends on:** B1
- **One-way door:** none
- **Model:** opus

### R1: Run model: repo → plans → sprints → waves → slices, queue, PRs
- **Scope:** Build `buildRepoModel` per the contract, on the ported parsers (`parsePlan`, `parseSprint`, `readTable`, `parseQueue`, `isDone`) and X1's readers; don't edit the ported copy. Export the run model, the format readers, and the ported parsers and types from `packages/model/src/index.ts`. Rules and their edges:
  - **Docs gate:** `docs` from `pod-docs/README.md`. Unsupported → `plans: []`, `queue: []`, nothing else read.
  - **Plans:** each `pod-docs/plans/*.md` and `pod-docs/plans/archive/*.md`, slug from the file name, sorted by slug. `.gitkeep` and non-`.md` files are ignored. Title and status from `parsePlan`; `portBase` and `go` from `planExtras`.
  - **Sprint docs:** from `pod-docs/sprints/*.md` (`isArchived: false`) and `pod-docs/sprints/archive/*.md` (`isArchived: true`). A doc joins the plan its `From plan:` names; with no `From plan:`, the plan whose sprint table lists its slug. A doc that matches no plan is dropped. The same slug in both folders → the archived copy wins.
  - **Sprint status:** row `done` or doc archived → `done`; row `active` or an unarchived doc exists → `active`; row `planned` → `planned`; anything else → `unknown`. A row with no doc → `hasDoc: false`, `waves: []`.
  - **Waves and slices:** slices grouped by wave number, waves ascending, slices in table order. `dependsOn` from the board's `Depends on` column via `sliceDeps`, joined by slice code; a board with no such column → `[]`. `pr` from `prRef(cell, status)`.
  - **Current:** `currentSprint` is the first sprint in plan-table order that isn't `done`; absent when all are done or the plan is `archived`. `currentWave` is the lowest wave with a slice not `isDone`; absent with no doc or when every slice is done.
  - **Queue:** `queue` is every entry of `pod-docs/handoff-queue.md` with `needsYou`, in file order. A plan's `queue` holds entries whose `plan:` is its slug, or with no `plan:`, whose `sprint:` is one of its sprints. Entries naming neither stay only in the repo's `queue`. A missing queue file → `[]`.
  - **Tolerance:** any missing file, empty file, or malformed table gives `unknown`, empty, or absent fields, never a throw. Path keys with `\` work the same as `/`.

  Add `pod-docs/feature-details/run-model.md` (new): these rules and why, for the next sprint's planner and engineers. Add Key docs entries in `pod-docs/codebase-structure.md` for the run model, the pod-flow copy, and the fixtures. Not in scope: per-slice detail sections (Files owned, Model, One-way door), the Sprint summary's slice log, transcripts, claim files, `gh`.
- **Files owned:** `packages/model/src/run-model.ts` (new), `packages/model/src/run-model.test.ts` (new), `packages/model/test/fixtures.test.ts` (new), `packages/model/src/index.ts`, `pod-docs/feature-details/run-model.md` (new), `pod-docs/codebase-structure.md`
- **Success criteria:**
  - `[test] chess-web builds: docs supported, every plan file present, sparring-ladder's ladder sprint active with its waves, slices, PR refs, and dependsOn matching the fixture's table — packages/model/test/fixtures.test.ts › chess-web run model`
  - `[test] ytb-feed builds: every plan and archived sprint present, archived sprints done — packages/model/test/fixtures.test.ts › ytb-feed run model`
  - `[test] speak-out and skyscraper-view → unsupported, version undefined, no plans, no queue — packages/model/test/fixtures.test.ts › old layout repos are unsupported`
  - `[test] "pod docs: 3" with valid plans present → no plans parsed — packages/model/src/run-model.test.ts › unsupported version parses nothing`
  - `[test] a doc joins by From plan, else by the plan's sprint table; an orphan doc is dropped — packages/model/src/run-model.test.ts › sprint docs join their plan`
  - `[test] the same sprint slug active and archived → the archived copy, status done — packages/model/src/run-model.test.ts › archived copy wins`
  - `[test] sprint status from row and doc: done, archived doc, active, unarchived doc with a planned row, planned, an odd word → unknown — packages/model/src/run-model.test.ts › sprint status rules`
  - `[test] currentSprint and currentWave: mid-run, all done, archived plan, sprint with no doc — packages/model/src/run-model.test.ts › current sprint and wave`
  - `[test] plan queue by plan:, else by sprint:; entries naming neither only on the repo; needsYou set — packages/model/src/run-model.test.ts › queue entries attach to plans`
  - `[test] plan with no Port base line → portBase absent; go is unknown — packages/model/src/run-model.test.ts › plan extras`
  - `[test] empty files, a board with missing columns, a table with no body, and random text never throw and give unknown or empty fields — packages/model/src/run-model.test.ts › tolerates malformed docs`
  - `[test] keys with "\" give the same model as keys with "/" — packages/model/src/run-model.test.ts › windows path keys`
  - `[test] index.ts exports buildRepoModel, docsVersion, prRef, parsePlan, parseSprint, parseQueue — packages/model/src/run-model.test.ts › public exports`
- **Depends on:** P1, F1, X1
- **One-way door:** none
- **Model:** opus

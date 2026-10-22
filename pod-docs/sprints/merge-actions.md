# Sprint: Action security, the action log, and merging from the board

_From plan: pod-docs/plans/board-actions.md · Slug: merge-actions · Status: active · Generated: 2026-10-21_

<!-- autopilot-run: started=2026-10-21T20:11:07-07:00 sprints=0 waves=1 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | L1 | Look: 44 px controls, quiet button, switch, multi-line input, in-place panel | merge-actions-L1 | — | pending | — | — |
| 1 | S1 | Action security: per-launch token, action guard, page token, action client | merge-actions-S1 | — | pending | — | — |
| 1 | P1 | PRs waiting on you: one model rule, wave PR `you merge`, action types | merge-actions-P1 | — | pending | — | — |
| 2 | M1 | Merge routes, gh merge and re-read, action log on the Board | merge-actions-M1 | — | pending | — | S1, P1 |
| 2 | U1 | Merge confirm in place, the result, and the action log list | merge-actions-U1 | — | pending | — | L1, S1, P1 |

## Shared contract

Times are epoch ms. Earlier contracts (bootstrap-model, server-runs, board-engineer) stand unless changed here. Plan values (merge command, result words, security list) are in `pod-docs/plans/board-actions.md` In scope and Key decisions; this section fixes the shapes and edges.

**Token** (S1, `packages/server/src/session-token.ts`, exported as `@pod-board/server/session-token`).
- At each API start: 32 random bytes as base64url (43 chars), written atomically (temp file + rename) to `<config dir>/session-token`, where `<config dir>` is the folder of `configPath(...)`. Mode `0600` on POSIX. It replaces the last launch's token. If it can't be written, the API stops with an error naming the file (fail closed).
- Never printed, never in the Board, SSE, a URL, a cookie, or the action log.
- The Vite dev server puts `<meta name="pod-board-token" content="<token>">` in `index.html`, reading the file on every page load. The plugin comes from the same module and is `apply: 'serve'`, so `pnpm build` never bakes a token into `dist`. A missing or unreadable file gives no meta.
- The page sends it as the `X-Pod-Board-Token` header on every action request.

**Action guard** (S1) on every route under `/api/actions/`. Checks run in this order; the first failure answers, and nothing runs or gets logged:
1. `Host` (the existing guard) → `403 { error: 'forbidden host' }`.
2. On any method but GET and HEAD, `Origin` missing or not exact (the existing guard) → `403 { error: 'forbidden origin' }`.
3. Method not `POST` → `405 { error: 'method not allowed' }`.
4. `Content-Type` not `application/json` (parameters such as `charset` allowed) → `415 { error: 'unsupported media type' }`.
5. `X-Pod-Board-Token` missing, wrong, or a different length → `403 { error: 'bad token' }`. Compared in constant time.
6. Body not a JSON object → `400 { error: 'bad request' }`.

No response carries `Access-Control-Allow-*`. Routes outside `/api/actions/` are unchanged: `POST /api/repos` keeps Host and Origin only, with no token, so the token is additive. `createApp` takes `token: string` and `actions?: Hono`, and mounts `actions` at `/api/actions` behind this guard. With no `actions`, a request that passes the guard gets `404`.

**Action client** (S1, `packages/web/src/actions-client.ts`): `postAction<T>(path: string, body: object, deps?) → Promise<ActionReply<T>>`, with `type ActionReply<T> = { ok: true; data: T } | { ok: false; status: number; message: string }`. These are its only messages:
- No token meta: status `0`, `Actions need a page reload.`, and no request is sent.
- `403 bad token`: `The board restarted. Reload the page.`
- A network failure: status `0`, `Can't reach the board.`
- Any other non-2xx: the body's `error`, else `HTTP <status>`.

**PRs waiting on you** (P1, `packages/model/src/waiting-prs.ts`):
```ts
type WaitingPr = { kind: 'wave' | 'fix' | 'final'; number: number; url?: string; run: string; sprint?: string; wave?: number }
waitingPrs(repo: BoardRepo, now: number): WaitingPr[]   // `run` is the plan slug, or the fix claim name `fix-<slug>`
```
- `final`: each plan `listRuns` lists for the repo whose `pendingHandBack` is N (the Ship step `PR #N · you merge`).
- `fix`: each fix run whose Ship step state is `you` (open and reviewed).
- `wave`: a wave of a listed plan's current sprint that isn't done or blocked, where every unfinished slice is `pushed`. A slice's PR cell must hold an open PR number, and `gh` must not report that number as merged or closed (unknown counts as open). No agent of the wave may be running: no slice engineer and no `<sprint>-w<N>-fix` engineer. One entry per wave, using the first numbered open PR.
- `url` comes from `repo.prs` when `gh` knows it.
- Display: a pipeline step that shows a waiting PR gets `merge: { number }` (`Step.merge?: { number: number }`, set on exactly those steps). A wave with a waiting PR reads `you` with the detail `PR #N · you merge`. Wave step order becomes blocked → done → you (an ask, or a waiting PR) → live → wait. Its run reads `needs-you`, and its wave board cards read `needs-you`.
- Edges:
  - A pending slice, a running wave fix, or `gh` reporting merged or closed means no waiting PR (the wave reads as it does today).
  - Autopilot merges its own wave PRs, so the board can show `you merge` until autopilot does. This is accepted, and `--match-head-commit` covers the race.

**Action types** (P1, types only, `packages/model/src/actions.ts`, exported from the model):
```ts
type MergePreview = { number: number; url: string; title: string; headSha: string; state: PrStatus['state']
  checks: PrStatus['checks']; mergeable: 'mergeable' | 'conflicting' | 'unknown'; mergeState: string }
type MergeOutcome = 'merged' | 'queued' | 'auto-merge' | 'stale' | 'failed' | 'unconfirmed'
type MergeResult = { outcome: MergeOutcome; number: number; message?: string; headSha?: string; logged: boolean }
type ActionEntry = { at: number; action: 'merge'; repoId: string; repo: string; target: string; result: MergeOutcome; message?: string }
```
`Board` gains `actions?: ActionEntry[]`, newest first, at most 50 (in `board.ts`). Later sprints widen `action` and `result`. `target` is `PR #N`.

**Merge routes** (M1, `packages/server/src/action-routes.ts`). The repo comes from the current Board by `repoId`, never from a path in the body. The PR must be in `waitingPrs(repo, now)`.
- `POST /api/actions/merge-preview` `{ repoId, number }` → `200 MergePreview` from a fresh `gh pr view`. Errors:
  - Repo not on the Board, or PR not waiting → `404 { error: 'not waiting on you' }`.
  - `gh` status not `ok` → `503 { error: 'gh unavailable' }`, and `gh` doesn't run.
  - The read fails, or its url isn't `https://github.com/<owner>/<name>/pull/<number>` → `502 { error: <gh's text, or 'gh failed'> }`.
- `POST /api/actions/merge` `{ repoId, number, headSha }`. `headSha` must match `^[0-9a-f]{40}$` and `number` must be a positive integer, else `400`. Then the same `404` and `503`. A merge already in flight for that repo and PR → `409 { error: 'merge in progress' }`. Otherwise `200 MergeResult`:
  1. A fresh `gh pr view` whose head differs from `headSha` → `stale`, with the current `headSha`, and no merge runs.
  2. Runs exactly `gh pr merge <url> --merge --match-head-commit <headSha>`, with a 60 s timeout. It never passes `--admin`, `--auto`, `--squash`, `--rebase`, or `--delete-branch`.
  3. Always reads the PR again. MERGED → `merged`. In a merge queue → `queued`. Auto-merge set → `auto-merge`. Else, if the merge call failed (timeout included) → `failed` with gh's stderr (ANSI codes removed, trimmed, at most 500 chars; empty → `gh pr merge failed`). Closed → `failed`, `PR is closed`. Open with a successful call, or a failed re-read → `unconfirmed`, with a message saying so. `merged` only ever comes from the re-read.
- After every merge that reached step 2: the PR's `gh` cache entries (by number, and any branch entry with that number) are dropped and fetched again, and the Board is rebuilt, all before the response.
- **Action log:** one `ActionEntry` per merge request that passed validation (stale and failed included; previews aren't logged), appended as one JSON line to `<config dir>/actions.jsonl`. At start the server reads the newest 50 entries: bad lines are skipped, and a missing file gives an empty list. The Board's `actions` comes from it. If the append fails, the response is unchanged except `logged: false`.

**Look.** Only L1 edits `packages/web/src/theme/`. It adds `.btn.quiet`, multi-line `textarea.input`, `.switch` (state shown by knob position and a label, not color alone), and `.inplace` (the in-place panel). At ≤ 480 px wide, `.btn`, `.input`, and `.switch` are at least 44 px tall. The merge button is `.btn.primary`, never danger-styled.

**Queue.** No `BLOCKED` entries. None of the pending entries are work for this sprint: all are `someday` or wait on the human or on pod.

## Per-slice detail

### L1: Look: 44 px controls, quiet button, switch, multi-line input, in-place panel
- **Scope:** Add the base control styles named in the contract's Look to the theme, from the plan's `## Look` (approved phase 1 look, no new direction). Tokens only, no color literals outside `tokens.css`. Don't change existing token values. Add a token only if a control needs one, with light and dark values. The switch and textarea get no screen this sprint: U1 uses `.btn.quiet` and `.inplace`, and sprint 2 uses the rest.
- **Files owned:** `packages/web/src/theme/base.css`, `packages/web/src/theme/tokens.css`, `packages/web/src/theme/tokens.test.ts`, `packages/web/src/theme/controls.test.ts` (new), `pod-docs/feature-details/app-shell.md`
- **Success criteria:**
  - `[test] existing palette, ink, contrast, and font checks still pass, and any new token has its light and dark value — packages/web/src/theme/tokens.test.ts › palette tokens match the Look`
  - `[test] .btn.primary text on --accent is at least 4.5:1 in light and dark — packages/web/src/theme/controls.test.ts › primary button text contrast`
  - `[test] .btn, .input, and .switch have min-height 44px inside a max-width 480px media query — packages/web/src/theme/controls.test.ts › controls are 44 px tall on narrow screens`
  - `[test] base.css has no color literals (hex, rgb, hsl, named colors) — packages/web/src/theme/controls.test.ts › base styles use tokens only`
  - `[test] .switch marks the on state with aria-checked="true" and moves the knob, not only the color — packages/web/src/theme/controls.test.ts › switch state is shown in form`
  - `[test] fonts are still served from the app — packages/web/src/theme/tokens.test.ts › fonts are served from the app`
  - `[manual] the Add repo form and the theme control look unchanged at desktop and are 44 px tall at 375 px, in both themes — open screen 1 at 1280 and 375 px`
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### S1: Action security: per-launch token, action guard, page token, action client
- **Scope:** Build the contract's Token, Action guard, and Action client.
  - `session-token.ts` exports `createSessionToken()`, `writeSessionToken(dir, token)`, `readSessionToken(dir) → string | undefined`, `injectTokenMeta(html, token?)`, and `tokenMetaPlugin(dir)` (a Vite plugin using `transformIndexHtml`).
  - The guard is `actionGuard({ ports, token })` in `guard.ts`.
  - `createApp` takes `actions?: Hono` and mounts it behind the guard.
  - `main.ts` makes and writes the token at start and passes it in.
  - `vite.config.ts` adds the plugin, with the config folder from `configPath`.
  - Don't change existing routes, and don't add action routes (M1 does).
  - Document the token in `server.md`. Add a smoke line to `codebase-structure.md`: the token file path, `curl -s http://127.0.0.1:<web>/ | grep pod-board-token`, and that action curls need `-H "X-Pod-Board-Token: $(cat <tmp>/cfg/session-token)"`.
- **Files owned:** `packages/server/src/session-token.ts` (new), `packages/server/src/session-token.test.ts` (new), `packages/server/src/guard.ts`, `packages/server/src/guard.test.ts`, `packages/server/src/app.ts`, `packages/server/src/app.test.ts`, `packages/server/src/main.ts`, `packages/server/package.json`, `packages/web/vite.config.ts`, `packages/web/src/actions-client.ts` (new), `packages/web/src/actions-client.test.ts` (new), `pod-docs/feature-details/server.md`, `pod-docs/codebase-structure.md`
- **Success criteria:**
  - `[test] a token is 43 base64url chars and differs on each call — packages/server/src/session-token.test.ts › creates a fresh token each launch`
  - `[test] writing replaces the old token through a temp file and rename; mode 0600 on POSIX — packages/server/src/session-token.test.ts › writes the token atomically, owner-only`
  - `[test] a missing or unreadable file reads as undefined — packages/server/src/session-token.test.ts › reads no token from a missing file`
  - `[test] the plugin puts the meta in <head> with the current file's token, re-read on each call; no file → html unchanged; the value is HTML-escaped — packages/server/src/session-token.test.ts › injects the token meta on each page load`
  - `[test] the plugin is apply 'serve', so a build gets no token — packages/server/src/session-token.test.ts › plugin runs only on the dev server`
  - `[test] a POST to /api/actions/* with no token → 403 bad token — packages/server/src/app.test.ts › action without token is refused`
  - `[test] a wrong token, and a token of another length → 403 bad token — packages/server/src/app.test.ts › action with wrong token is refused`
  - `[test] a wrong Host → 403 forbidden host — packages/server/src/app.test.ts › action with wrong host is refused`
  - `[test] a missing Origin, and a wrong Origin → 403 forbidden origin — packages/server/src/app.test.ts › action with missing or wrong origin is refused`
  - `[test] text/plain or form content types → 415 — packages/server/src/app.test.ts › action with non-JSON body is refused`
  - `[test] GET on an action path → 405; a body that is invalid JSON, an array, or null → 400 — packages/server/src/app.test.ts › action method and body are checked`
  - `[test] checks run in contract order (a wrong Origin and no token give forbidden origin), and a refused request never reaches the action handler — packages/server/src/app.test.ts › action checks run in order and fail closed`
  - `[test] a valid request reaches the mounted handler; no response sets Access-Control-Allow-* — packages/server/src/app.test.ts › valid action reaches its route`
  - `[test] POST /api/repos still answers 201 without a token, and 409 on a repeat — packages/server/src/app.test.ts › add repo needs no token`
  - `[test] postAction sends the X-Pod-Board-Token header and a JSON content type — packages/web/src/actions-client.test.ts › sends the token header`
  - `[test] no meta → no request and the reload message; 403 bad token → the restarted message; a network error, and another error, give the contract's messages — packages/web/src/actions-client.test.ts › reports each failure in words`
- **Depends on:** —
- **One-way door:** none. The token covers new routes only, and existing routes are unchanged.
- **Model:** opus

### P1: PRs waiting on you: one model rule, wave PR `you merge`, action types
- **Scope:** Build `waitingPrs` and the Display rules from the contract's "PRs waiting on you". Add the Action types and `Board.actions` from the contract. Export them from the model's `index.ts`.
  - `waiting-prs.ts` imports only `pipeline.ts` and `fix-runs.ts` (no cycle with `runs.ts`). Move the listed-plan test (`isRun`) out of `runs.ts` into `pipeline.ts` so both can use it.
  - The final and fix rules reuse today's logic (`pendingHandBack`, the fix Ship step), so nothing about when they read `you merge` changes.
  - Set `Step.merge` in `pipeline.ts` and `fix-runs.ts`.
  - Update the wave state in `pipeline.ts`, the run state in `runs.ts`, and the card state in `board-view.ts`, with the same precedence in all three.
  - Update `runs-and-pipeline.md` and `wave-board.md`.
- **Files owned:** `packages/model/src/waiting-prs.ts` (new), `packages/model/src/waiting-prs.test.ts` (new), `packages/model/src/actions.ts` (new), `packages/model/src/board.ts`, `packages/model/src/index.ts`, `packages/model/src/pipeline.ts`, `packages/model/src/pipeline.test.ts`, `packages/model/src/fix-runs.ts`, `packages/model/src/fix-runs.test.ts`, `packages/model/src/runs.ts`, `packages/model/src/runs.test.ts`, `packages/web/src/screens/board/board-view.ts`, `packages/web/src/screens/board/board-view.test.ts`, `pod-docs/feature-details/runs-and-pipeline.md`, `pod-docs/feature-details/wave-board.md`
- **Success criteria:**
  - `[test] a pending hand-back's PR is a final waiting PR; once gh says merged it isn't — packages/model/src/waiting-prs.test.ts › final PR waits until merged`
  - `[test] a fix PR waits only while open and reviewed — packages/model/src/waiting-prs.test.ts › fix PR waits after review`
  - `[test] a wave with every unfinished slice pushed, an open PR, and no running agent waits; a pending slice, a running slice engineer, or a running wave-fix engineer doesn't — packages/model/src/waiting-prs.test.ts › wave PR waits when the wave is handed back`
  - `[test] gh merged or closed for the wave PR → not waiting; gh unknown → waiting — packages/model/src/waiting-prs.test.ts › wave PR follows gh state`
  - `[test] a blocked wave, a done wave, and a sprint that isn't current give no wave entry; one entry per wave — packages/model/src/waiting-prs.test.ts › wave PR edges`
  - `[test] an archived plan with no claim and a plan off the runs list give nothing — packages/model/src/waiting-prs.test.ts › only listed runs`
  - `[test] a waiting wave reads you with PR #N · you merge and merge {number}; done still beats you — packages/model/src/pipeline.test.ts › wave step shows a waiting PR`
  - `[test] Step.merge is set on the Ship step of a pending hand-back and on a reviewed fix PR, and on no other step — packages/model/src/pipeline.test.ts › only waiting steps carry merge` and `packages/model/src/fix-runs.test.ts › fix Ship step carries merge`
  - `[test] a run with a waiting wave PR reads needs-you, and blocked still wins — packages/model/src/runs.test.ts › waiting wave PR needs you`
  - `[test] that wave's cards read needs-you; blocked and merged keep precedence — packages/web/src/screens/board/board-view.test.ts › cards of a waiting wave need you`
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### M1: Merge routes, gh merge and re-read, action log on the Board
- **Scope:** Build the contract's Merge routes and Action log.
  - `gh.ts`: `ExecResult` gains `stderr?: string` (optional, so existing fakes still typecheck), and `GhReader` gains `forget(repoPath, n)`. Export the checks rollup for the preview.
  - `gh-actions.ts`: the preview read, the merge call, and the outcome mapping. Run `gh pr view --json` with no fields to list the real names (`headRefOid`, `mergeable`, `mergeStateStatus`, `autoMergeRequest`, the merge-queue field). Record the ones used in `actions.md`. If gh has no merge-queue field, an open PR with no auto-merge after a successful call reads `queued`; say so in `actions.md`.
  - `action-log.ts`: `createActionLog({ file, now })` with `append(entry) → Promise<boolean>` and `recent() → ActionEntry[]`.
  - `action-routes.ts`: `createActionRoutes(deps) → Hono`.
  - `board-service.ts` takes `actions?: () => ActionEntry[]`.
  - `main.ts` wires everything into S1's `createApp({ actions })`.
  - No real PR is merged by tests or the smoke recipe: tests use a fake gh exec. Add smoke lines: a preview for a PR not waiting gives `404`, the same request with no token gives `403`, and `actions.jsonl` sits in `<tmp>/cfg`. Write `pod-docs/feature-details/actions.md`. Update `server.md`'s API list.
- **Files owned:** `packages/server/src/gh.ts`, `packages/server/src/gh.test.ts`, `packages/server/src/gh-actions.ts` (new), `packages/server/src/gh-actions.test.ts` (new), `packages/server/src/action-log.ts` (new), `packages/server/src/action-log.test.ts` (new), `packages/server/src/action-routes.ts` (new), `packages/server/src/action-routes.test.ts` (new), `packages/server/src/board-service.ts`, `packages/server/src/board-service.test.ts`, `packages/server/src/main.ts`, `pod-docs/feature-details/actions.md` (new), `pod-docs/feature-details/server.md`, `pod-docs/codebase-structure.md`
- **Success criteria:**
  - `[test] the merge runs exactly [pr, merge, <url>, --merge, --match-head-commit, <sha>] with no other flag and a 60 s timeout — packages/server/src/gh-actions.test.ts › merge argv is exact`
  - `[test] the re-read maps MERGED → merged, merge queue → queued, auto-merge → auto-merge, CLOSED → failed, an open PR after success or a failed re-read → unconfirmed — packages/server/src/gh-actions.test.ts › outcome comes from the re-read`
  - `[test] a failed or timed-out call whose re-read says MERGED → merged; otherwise failed with gh's stderr, without ANSI codes, capped at 500 chars, and the fallback text when empty — packages/server/src/gh-actions.test.ts › failure shows gh's text`
  - `[test] the preview maps mergeable, mergeStateStatus, headRefOid, checks, and title; a url that isn't this PR's GitHub pull url → 502 — packages/server/src/gh-actions.test.ts › preview reads and checks the PR`
  - `[test] stderr is captured and forget makes the next refresh fetch the PR again, merged or not — packages/server/src/gh.test.ts › forget re-fetches a PR`
  - `[test] a repo not on the Board, or a PR not in waitingPrs → 404, and gh isn't run — packages/server/src/action-routes.test.ts › refuses a PR not waiting on you`
  - `[test] a bad sha or number → 400; gh missing or logged out → 503 before any exec — packages/server/src/action-routes.test.ts › validates before running gh`
  - `[test] a head that moved since the preview → stale with the new sha, and no merge call — packages/server/src/action-routes.test.ts › stale head is refused`
  - `[test] a second merge for the same PR while one runs → 409; another PR runs at once — packages/server/src/action-routes.test.ts › one merge per PR at a time`
  - `[test] after a merge the Board is rebuilt with the PR fetched fresh before the response — packages/server/src/action-routes.test.ts › board shows the new PR state after merge`
  - `[test] each validated merge appends one entry (stale and failed too), and previews add none; an append that fails gives logged false with the same outcome — packages/server/src/action-routes.test.ts › every merge is logged`
  - `[test] append writes one JSON line; recent gives the newest 50, newest first, skips bad lines, and is empty for a missing file — packages/server/src/action-log.test.ts › reads and appends the log`
  - `[test] the log survives a restart (a new log on the same file reads the old entries) — packages/server/src/action-log.test.ts › log survives restart`
  - `[test] Board.actions comes from the actions dep and is absent without it — packages/server/src/board-service.test.ts › board carries the action log`
- **Depends on:** S1, P1
- **One-way door:** none. The code can merge real PRs, but building and testing never does: tests fake gh, and the smoke recipe never calls merge on a real PR. The human's press on the confirm step is the only trigger.
- **Model:** opus

### U1: Merge confirm in place, the result, and the action log list
- **Scope:** On screen 1, a step with `merge` shows a Merge button (`.btn`). Pressing it opens the confirm in place (`.inplace`) under that step, in both the plan pipeline and the fix pipeline. Use only the tokens and follow the plan's `## Look`.
  - `merge-flow.ts` is a pure reducer: idle → loading → confirm(preview) → merging → result, or → error; cancel → idle. Escape cancels from confirm. One confirm is open at a time, and Merge is disabled while merging.
  - The confirm shows the title, a checks chip, mergeability, and the head sha (7 chars, mono). It has a primary `Merge (merge commit)` button and a quiet Cancel button. A `conflicting` PR disables Merge and says why. Failing or pending checks are shown, and Merge stays enabled.
  - Result words, one per outcome:
    - `merged`: `Merged`.
    - `queued`: `Added to the merge queue`.
    - `auto-merge`: `Auto-merge on: GitHub merges it when checks pass`.
    - `stale`: `The PR changed since you looked (head now <sha7>).`, with a Check again button that loads the preview again.
    - `failed` and `unconfirmed`: the server's message.
    - `logged: false` adds `Not saved to the action log.`
    - A client error shows its `message` (see the contract's Action client).
  - `Merged` shows only for `merged`.
  - The action log list (`action-log-view.ts` and `ActionLog.tsx`) sits under Other activity: the newest 20 of `board.actions`. Each row shows the time (`HH:MM` today, else `MMM D HH:MM`), the repo, the target, and a result chip: merged → ok; queued and auto-merge → run; stale and unconfirmed → you; failed → bad. With no entries it reads `No actions yet.` It updates from the Board stream.
  - Uses S1's `postAction` and P1's types. Update `runs-and-pipeline.md`.
- **Files owned:** `packages/web/src/screens/runs/merge-flow.ts` (new), `packages/web/src/screens/runs/merge-flow.test.ts` (new), `packages/web/src/screens/runs/MergeConfirm.tsx` (new), `packages/web/src/screens/runs/action-log-view.ts` (new), `packages/web/src/screens/runs/action-log-view.test.ts` (new), `packages/web/src/screens/runs/ActionLog.tsx` (new), `packages/web/src/screens/runs/Pipeline.tsx`, `packages/web/src/screens/runs/FixRun.tsx`, `packages/web/src/screens/runs/RunsScreen.tsx`, `packages/web/src/screens/runs/runs.css`, `pod-docs/feature-details/runs-and-pipeline.md`
- **Success criteria:**
  - `[test] open → loading → confirm on a preview; cancel and Escape → idle; a second open closes the first — packages/web/src/screens/runs/merge-flow.test.ts › opens and cancels in place`
  - `[test] merge sends { repoId, number, headSha } from the preview, and a repeat press while merging sends nothing — packages/web/src/screens/runs/merge-flow.test.ts › merges the head you saw, once`
  - `[test] each outcome gives its result words; Merged only for merged; logged false adds the note — packages/web/src/screens/runs/merge-flow.test.ts › shows GitHub's result`
  - `[test] stale offers Check again, which loads the preview again — packages/web/src/screens/runs/merge-flow.test.ts › stale head asks to look again`
  - `[test] conflicting disables Merge; failing checks don't — packages/web/src/screens/runs/merge-flow.test.ts › conflicts block merge`
  - `[test] a client error (reload, restarted, can't reach) shows its message and returns to a retryable state — packages/web/src/screens/runs/merge-flow.test.ts › client errors are shown`
  - `[test] rows: newest 20, time format today and older, result chip per outcome, the empty text — packages/web/src/screens/runs/action-log-view.test.ts › action log rows`
  - `[manual] the Merge button and confirm sit next to the PR's step, not in a modal; plain primary button, no danger color; both themes — fixture run with a waiting PR at 1280 px`
  - `[manual] at 375 px the confirm stacks, every button is at least 44 px tall, and nothing scrolls sideways — same run at 375 px`
  - `[manual] the action log reads as a quiet list like Other activity; with gh off PATH, pressing Merge on a fixture's waiting wave PR shows `gh unavailable` in place — fixture copy with a pushed wave, 1280 and 375 px`
  - `[manual] Add repo still saves, shows "Already registered." on a repeat, and clears on Escape — screen 1`
- **Depends on:** L1, S1, P1
- **One-way door:** none. A real merge is only checked in the plan's final verification, in a scratch repo.
- **Model:** opus

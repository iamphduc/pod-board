# Sprint: Calm screen

_From plan: pod-docs/plans/calm-dashboard.md · Slug: calm-screen · Status: archived · Generated: 2026-10-28_

<!-- autopilot-run: started=2026-10-28T08:11:52Z sprints=0 waves=3 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | L1 | Look: Geist tokens, fonts, controls, dark default | calm-screen-L1 | merged | done | medium | — |
| 1 | F1 | Folder listing API | calm-screen-F1 | merged | done | medium | — |
| 1 | N1 | Next step, header and tab-memory views (pure) | calm-screen-N1 | merged | done | medium | — |
| 2 | M1 | Bar ⋯ menu | calm-screen-M1 | merged | done | medium | L1 |
| 2 | P1 | Folder picker panel | calm-screen-P1 | merged | done | medium | L1, F1 |
| 2 | T1 | Waiting, Plan and Log tab panels | calm-screen-T1 | merged | done | medium | L1, N1 |
| 3 | S1 | Screen 1 layout: bar, header, Next step card, tabs | calm-screen-S1 | merged | done | medium | L1, N1, M1, P1, T1 |

## Shared contract

Values (palette, type sizes, spacing, button sizes) are the plan's `## Look`; the draft `pod-docs/design-drafts/calm-dashboard-look-3.html` shows them drawn. Don't restate them; use the tokens.

### 1. Tokens and base classes (L1 defines, every UI slice uses only these)
- **Tokens** (`theme/tokens.css`), one per Look palette entry: `--bg --surface --hover --border --border-strong --fg --muted --faint --primary-bg --primary-fg --focus` and the status colors `--blocked --needs-you --running --ready --idle`. Fonts `--font` (Geist) and `--mono` (Geist Mono). Keep `--size-*` and `--radius-*` names with Look values. The old names (`--panel`, `--panel-2`, `--line`, `--accent`, `--ok`, `--warn`, `--bad`, `--*-soft`, `--*-ink`, `--display`, `--body`) are gone after L1; L1 moves every screen CSS file to the new names.
- **`--faint` is never text color.** It fails 4.5:1 (about 4.1:1 on dark bg, 3.2:1 on light). Text uses `--fg` or `--muted`; `--faint` is for icons and rules only. Status colors color only dots, the ✓ icon, and the focus ring, never text.
- **Classes in `base.css`:** `.btn`, `.btn.sm`, `.btn.primary`, `.btn.quiet` (the draft's ghost), `.btn.lead` (icon before the label), `.btn.trail` (icon after), `.btn.icon` (square, icon only, needs `aria-label`), `.input`, `textarea.input`, `.switch` (`role="switch"`, `aria-checked`), `.status` with `s-bad | s-you | s-run | s-ok | s-idle` (dot plus word), `.tabs` / `.tab` (a `button` with `aria-expanded`; `.tab .n` is the count), `.menu` (the only element with a shadow), `.seg` (buttons with `aria-pressed`), `.card` (plain, no colored edge, no fill), `.card.calm` (dashed, transparent), `.inplace`, `.inplace-actions`.
- **`.chip` keeps its markup** (`Chip.tsx`: `<span class="chip s-…">label</span>`) but L1 restyles it to look like `.status`: dot plus word, no fill. `.chip.tag` stays an outlined kind tag with no dot. `.card.k-*` keeps its selectors but draws no colored edge.
- **Touch size:** at `max-width: 480px`, `.btn` (all sizes), `.input` and `.switch` stay at least 44 px tall, and `.btn.icon` is 44 × 44. This keeps the existing phone rule; wider screens use the Look's 40 / 32 px.

### 2. Theme storage
`pod-board-theme` in `localStorage`: `dark`, `light`, `system` (follow the OS). Nothing stored, an unknown value, or storage that throws reads as **`dark`**. `readChoice` and the inline boot script in `index.html` follow the same rule; the boot script sets `data-theme="dark"` when nothing usable is stored, and sets nothing for `system`.

### 3. Icons
`packages/web/src/theme/icons.tsx` exports `Icon({ name })`, a 16 px SVG, 1.5 px stroke, `aria-hidden="true"`. Names: `plus`, `more`, `check`, `chevron-right`, `chevron-down`, `arrow-up`, `folder`, `close`. No button label uses a text glyph (`+`, `⋯`, `✓`, `→`, `↑`); use an icon. Finished steps in the Plan tab show `check` in `--ready`.

### 4. Folder listing route (F1 serves, P1 calls)
`GET /api/fs/folders` with optional query `path=<absolute path>`. Header `X-Pod-Board-Token` is required. The token never goes in the URL.
- **Guard:** the existing request guard (Host), then a new GET guard: the token (constant-time compare, same as the action guard). No `Origin` check (browsers omit it on same-origin GETs). `actionGuard` itself doesn't change.
- **200:** `{ path: string | null, parent: string | null, locked: boolean, truncated: boolean, folders: { name: string, path: string, podDocs: boolean }[] }`.
  - With no `path`: the roots, `path: null`, `parent: null`. On win32, each `A:\` to `Z:\` that exists; a drive whose check doesn't answer within 1500 ms is left out. Elsewhere, `/` and the home folder.
  - With `path`: its subfolders, sorted case-insensitively by name. `path` is the normalized form (`normalizeRepoPath`). `parent` is null at a drive root or `/`.
  - `podDocs`: the subfolder holds a `pod-docs` folder.
  - Only folders are listed. A link to a local folder counts as a folder. Files, broken links, and links to files are left out. On win32, a link whose real target starts with two separators (a network or device path) is left out too, and the `pod-docs` mark uses `lstat`, so a linked `pod-docs` reads `false`. Mapped drive letters stay listed.
  - At most 1000 folders, the first 1000 by sort order; then `truncated: true`.
  - A folder that exists but can't be read (`EACCES`, `EPERM`): 200 with `locked: true` and `folders: []`.
- **Errors:** no or wrong token → `403 {"error":"bad token"}`; foreign Host → `403 {"error":"forbidden host"}`; on win32 a path starting with two separators (UNC, `\\?\`, `\\.\`) → `400 {"error":"not a local path"}`, before any file system call; a relative path, or `C:x` → `400 {"error":"not absolute"}`; a path holding a NUL → `400 {"error":"bad request"}`; missing or not a folder → `404 {"error":"not a directory"}`.
- It reads directory entries and their types only. It never opens a file and stores nothing.

### 5. Next step view (N1 builds, T1 and S1 render)
`packages/web/src/screens/runs/next-step.ts`:
```ts
export type NextStatus = 'blocked' | 'needs-you' | 'ready' | 'running' | 'idle'
export type NextAction =
  | { kind: 'answer'; repoId: string; line: string }
  | { kind: 'merge'; repoId: string; number: number }
  | { kind: 'reply'; panel: ReplyPanelView }   // from reply-view.ts
  | { kind: 'none' }
export type NextItem = {
  key: string            // stable across Boards: `entry:<line>`, `pr:<number>`, `reply:<run>`; a repeated line gets `#2`, `#3`
  tier: 'blocked' | 'merge' | 'reply' | 'pending' | 'info' | 'nothing'
  status: NextStatus
  title: string          // one short line
  detail?: string        // one short line
  entry?: WaitingRow     // queue items: the row from queue-view.ts (body, route, date, yourAnswer)
  action: NextAction
}
export type NextSteps = { card: NextItem; rest: NextItem[] }
export function nextSteps(run: RunSummary | undefined, repo: BoardRepo | undefined, now: number): NextSteps | undefined
```
- **Sources**, the model's rules only: entries from `waitingEntries` / `waitingRows`; PRs from `waitingPrs(repo, now)` whose `run` equals `run.plan`; the reply from `replyPanel(run, repo, now)`.
- **Order** (the plan's Key decision): `blocked` (an entry with `isAnswerable` and type `BLOCKED`) → `merge` (each waiting PR, in `waitingPrs` order) → `reply` (one item for the whole reply panel) → `pending` (`isAnswerable`, type `PENDING`) → `info` (every other `needsYou` entry: answered entries, and a `BLOCKED` not routed `→ human`). Within a tier, list order. `card` is the first item of tiers `blocked` to `pending`; `rest` is every other item, `info` included. The Waiting tab count is `rest.length`.
- **No action item** → `card` is `tier: 'nothing'`, `title: 'Nothing to do'`, `action: none`. Its status is `blocked` for a `blocked` run, `running` for a `running` run, else `idle`. Its detail is `emptyMessage(run, repo)` for an error, unsupported, or plan-less run, else `run.where`.
- **Status:** `blocked` tier → `blocked`; `merge` and `pending` → `needs-you`; `reply` → `ready` when any row has `send`, else `needs-you`; `info` → `blocked` for a `BLOCKED` entry, else `idle`.
- **Edges:**
  - An autopilot run not halted: its wave PR isn't in `waitingPrs`, so a run with nothing else shows `Nothing to do` · `running`.
  - Autopilot stopped: the halt entry is the card, and the PR follows in `rest`.
  - A halted plan: the model hides replies 1 to 6, so only `answered` can appear.
  - `try` is never sendable, so its row has only Copy.
  - A fix run gets `fix` PRs and `fix-*` replies, and only the entries that join no plan.
  - A plan-less repo row gets only the entries that join no plan.
  - `undefined` run or repo → `undefined`.

### 6. Header and Plan lines (N1 builds, T1 and S1 render)
`packages/web/src/screens/runs/plan-view.ts`:
- `planLines(stages: Stage[]): PlanLine[]`, where `PlanLine = { key, label, state: StepState, word, detail?, current }`. There is one line per step in pipeline order. `label` is `<stage caption> · <step label>`, or the step label alone when the two are equal. `word` is the state word (`done`, `running`, `waiting`, `needs you`, `blocked`, `unknown`). Only the current line has `detail` (the step's).
- **Current step:** the first step whose state is `blocked`, `you` or `live`; if there is none, the first `wait`; if there is none, no step is current.
- `runHeader(run, repo, now): { crumb: string; name: string; segments: ('done' | 'current' | 'rest')[]; wave?: string } | undefined`.
  - `crumb` is the repo name. `name` is the plan slug, `fix · <slug>` for a fix run, or the repo name for a plan-less row.
  - `segments` has one entry per pipeline step: done → `done`; current → `current`; else `rest`. An `unknown` step (Go `not recorded yet`) counts as `done` once any later step isn't `wait` or `unknown`. A plan-less row has `[]`.
  - `wave` is `Wave N of M` for a plan whose current sprint has a doc and waves, using `runs.ts`'s rule: N = `currentWave ?? last wave`, M = the last wave. Otherwise it's left out (fix runs, plan-less rows, between sprints).

### 7. Tab memory (N1)
`packages/web/src/screens/runs/tab-memory.ts`: key `pod-board-tab`, values `waiting | plan | log`. Nothing stored means every tab is closed. One value per browser, not per run.
- `readTab(storage)`: an unknown value or throwing storage → `undefined`.
- `saveTab(storage, tab | undefined)`: `undefined` removes the key. Throwing storage is ignored.
- `toggleTab(open, clicked)`: clicking the open tab closes it.
- `shownTab(stored, { view, hasPlan })`: `view === 'agent'` → `log`, without saving; a stored `plan` on a plan-less row → `undefined`.

### 8. Components S1 mounts (wave 2 builds them, S1 wires them)
- `BarMenu.tsx` (M1): `BarMenu({ autoContinue?: { target: RunTarget; on: boolean }; portBase?: number })`. It renders its own square ⋯ trigger and the menu.
- `FolderPicker.tsx` (P1): `FolderPicker({ repoPaths: string[]; onClose: () => void })`. It renders the panel only. S1 owns the `+ Repo` trigger, and returns focus to it after `onClose`.
- `WaitingTab.tsx` (T1): `WaitingTab({ repo: BoardRepo; run: RunSummary; items: NextItem[] })`.
- `PlanTab.tsx` (T1): `PlanTab({ stages: Stage[]; boardHref?: string })`.
- `LogTab.tsx` (T1): `LogTab({ repo; run; pipeline?: Pipeline; fixPipeline?: FixPipeline; agent?: string; now: number; actions: ActionEntry[] })`.
- `AnswerForm.tsx` (T1, moved out of `WaitingOnYou.tsx`): `AnswerForm({ state: AnswerState; flow: AnswerFlow; note: string })`.
- `ReplyPanel.tsx` (T1): it keeps `{ view, target }` and adds `framed?: boolean` (default `true`). `framed={false}` drops the frame and the heading, for use inside the card.

## Per-slice detail

In **Files owned**, a bare file name sits in the same folder as the path before it on that line. Bare test names in N1, M1, P1 and T1 are under `packages/web/src/screens/runs/`.

### L1: Look: Geist tokens, fonts, controls, dark default
- **Scope:**
  - Turn the Look into contract items 1 to 3:
    - tokens for dark and light;
    - Geist (400, 500, 600) and Geist Mono (400, 500) as latin woff2 in `public/fonts/`, with each OFL text. Copy the files from the Fontsource packages; don't add them as dependencies. Delete the old font files and their licenses.
    - base control styles per the Look's button rules (sizes, 14 px / 500 labels, icon-side padding, square icon buttons);
    - `.status`, and the `.chip` / `.card` restyle;
    - `icons.tsx`;
    - the dark default in `theme.ts` and the `index.html` boot script, plus theme-color metas `#000000` / `#ffffff` and the font preload.
  - Move `board.css`, `engineer.css` and `runs.css` to the new token names, look only, with no layout change. The wave board's critical path line uses `--fg`, and other lines use `--border-strong`.
  - Record in `decisions.md` that the 2026-10-19 "light chip text: darker ink tokens" decision is obsolete (chips are now dots plus words). Update `app-shell.md` (theme default, fonts, controls).
  - Not in scope: screen 1 layout, and the theme control's markup.
- **Files owned:**
  - theme: `packages/web/src/theme/tokens.css`, `base.css`, `fonts.css`, `index.css`, `theme.ts`, `icons.tsx` (new), `tokens.test.ts`, `controls.test.ts`, `theme.test.ts`, `icons.test.ts` (new)
  - shell: `packages/web/index.html`, `packages/web/src/theme-boot.test.ts`
  - fonts: `packages/web/public/fonts/` (Geist files (new); old files deleted)
  - screen CSS: `packages/web/src/screens/board/board.css`, `packages/web/src/screens/engineer/engineer.css`, `packages/web/src/screens/runs/runs.css`
  - docs: `pod-docs/decisions.md`, `pod-docs/feature-details/app-shell.md`
- **Success criteria:**
  - `[test]` Dark and light token values equal the Look's palette — `tokens.test.ts › palette tokens match the Look`
  - `[test]` `--fg` and `--muted` reach 4.5:1 on `--bg`, `--surface` and `--hover` in both themes, and `--primary-fg` does on `--primary-bg` — `tokens.test.ts › text contrast is at least 4.5 to 1`
  - `[test]` No CSS file under `packages/web/src` sets `color` to `--faint` or to a status token — `tokens.test.ts › faint and status colors are never text`
  - `[test]` No CSS file under `packages/web/src` uses an old token name — `tokens.test.ts › screens use only the new tokens`
  - `[test]` Each Geist face is a local woff2 with its OFL file, the old faces are gone, and no theme file names another host — `tokens.test.ts › fonts are served from the app`
  - `[test]` `.btn` is 40 px with 20 px sides, `.btn.sm` 32 px with 12 px sides, labels are 14 px / 500, `.lead` / `.trail` cut the icon side to 16 px (10 px small), and `.btn.icon` is square at both sizes — `controls.test.ts › button sizes follow the Look`
  - `[test]` At `max-width: 480px`, buttons, inputs and switches are at least 44 px, and icon buttons are 44 × 44 — `controls.test.ts › controls are 44 px tall on narrow screens`
  - `[test]` `.btn.primary` uses `--primary-bg` / `--primary-fg` in every state — `controls.test.ts › primary button is black and white`
  - `[test]` `.chip` and `.status` draw a dot and have no background fill, and `.card.k-*` has no colored border — `controls.test.ts › status is a dot and a word`
  - `[test]` `base.css` has no color literals — `controls.test.ts › base styles use tokens only`
  - `[test]` The switch knob moves when it's on — `controls.test.ts › switch state is shown in form`
  - `[test]` Nothing, unknown, or throwing storage reads as `dark`; `system`, `light` and `dark` round-trip — `theme.test.ts › readChoice falls back to dark`
  - `[test]` The boot script sets `dark` for nothing, unknown, or throwing storage, sets nothing for `system`, and sets the stored `light` / `dark` — `theme-boot.test.ts › applies the stored theme before render`
  - `[test]` Every icon renders a 16 × 16 SVG, `aria-hidden`, with stroke width 1.5 where it's stroked — `icons.test.ts › icons are 16 px SVGs`
  - `[manual]` The wave board and the engineer view at 1280 and 375 px: same layout, the dependency lines still line up, new fonts and colors, and every state shows as a dot plus a word — open the chess-web fixture's board in both themes.
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### F1: Folder listing API
- **Scope:**
  - Contract item 4: the route and the new GET token guard (`guard.ts`, beside `actionGuard`, which stays unchanged).
  - `folder-list.ts` lists through injected `readdir` / `stat` / platform / home, so tests need no real drives. Wire it into `createApp` as a new `AppDeps` field from `main.ts`.
  - Docs: the route in `server.md`, and one smoke-recipe line in `codebase-structure.md`.
  - Not in scope: the picker page.
- **Files owned:**
  - code: `packages/server/src/folder-list.ts` (new), `packages/server/src/guard.ts`, `packages/server/src/app.ts`, `packages/server/src/main.ts`
  - tests: `packages/server/src/folder-list.test.ts` (new), `packages/server/src/guard.test.ts`, `packages/server/src/app.test.ts`
  - docs: `pod-docs/feature-details/server.md`, `pod-docs/codebase-structure.md`
- **Success criteria:**
  - `[test]` Lists only subfolders, sorted case-insensitively, with `podDocs`; files, broken links and links to files are left out, and a link to a folder is listed — `folder-list.test.ts › lists folders only`
  - `[test]` On win32, a link to `\\host\share` is skipped and a linked `pod-docs` reads `podDocs: false` — `folder-list.test.ts › a link to a network path is skipped`
  - `[test]` No path on win32 → the existing `A:\` to `Z:\`, skipping a drive that doesn't answer within 1500 ms (fake timers); on POSIX → `/` and home — `folder-list.test.ts › roots`
  - `[test]` The `parent` of `C:\x` is `C:\`; at `C:\` and at `/` it's null; `C:/a/../b/` normalizes to `C:\b` — `folder-list.test.ts › path and parent`
  - `[test]` A folder that `EACCES`es on read → `locked: true`, `folders: []` — `folder-list.test.ts › unreadable folder is locked`
  - `[test]` 1001 folders → the first 1000 and `truncated: true` — `folder-list.test.ts › caps at 1000`
  - `[test]` UNC and device paths → `not a local path` with no file system call; a relative path or `C:x` → `not absolute`; NUL → `bad request`; missing → `not a directory` — `folder-list.test.ts › refuses bad paths`
  - `[test]` The GET guard: no token or a wrong one → 403 `bad token`, a foreign Host → 403 `forbidden host`, the right token → next — `guard.test.ts › token guard for reads`
  - `[test]` `GET /api/fs/folders` through `createApp`: every error code and body above, and a 200 with the token — `app.test.ts › folder listing route`
  - `[test]` Nothing in `folder-list.ts` opens or reads a file (no `readFile`, `open` or `createReadStream`) — `folder-list.test.ts › reads names only`
- **Depends on:** —
- **One-way door:** none. It's an additive read route behind the existing token and Host checks. To undo it, remove the route.
- **Model:** opus

### N1: Next step, header and tab-memory views (pure)
- **Scope:**
  - Contract items 5, 6 and 7 as pure modules, with no React.
  - Test the order against Boards built from the chess-web fixture (`loadFixture('chess-web')` from `packages/model/test/load-fixture.ts`, then `buildRepoModel`), the same cases the model's `waitingPrs`, replies and queue tests cover.
  - Don't change `@pod-board/model`.
- **Files owned:**
  - code: `packages/web/src/screens/runs/next-step.ts` (new), `plan-view.ts` (new), `tab-memory.ts` (new)
  - tests: `next-step.test.ts` (new), `plan-view.test.ts` (new), `tab-memory.test.ts` (new)
- **Success criteria:**
  - `[test]` A `BLOCKED → human` entry and a waiting PR together → the card is the entry, and `rest` holds the PR — `next-step.test.ts › blocked beats a PR`
  - `[test]` A PR beats a reply, a reply beats a `PENDING → human`, and list order holds within a tier — `next-step.test.ts › tier order`
  - `[test]` A `BLOCKED · engineer → orchestrator` and answered entries are `info` in `rest` and never the card — `next-step.test.ts › only entries routed to you take the card`
  - `[test]` No action → `Nothing to do`, `action: none`, with the status taken from the run, and an error or plan-less run gets `emptyMessage` — `next-step.test.ts › nothing to do`
  - `[test]` An autopilot run not halted → `Nothing to do` · `running`; stopped → the halt is the card and the PR is in `rest` — `next-step.test.ts › autopilot`
  - `[test]` A `try` row gives a reply with no `send`, status `needs-you`; a sendable `continue` → `ready` — `next-step.test.ts › reply status`
  - `[test]` A fix run gets its `fix` PR, and a repo row gets only the entries that join no plan — `next-step.test.ts › fix run and repo row`
  - `[test]` Keys stay the same across two Boards with the same items, and repeated lines get `#2` — `next-step.test.ts › stable keys`
  - `[test]` The current step is the first `blocked` / `you` / `live`, else the first `wait`; only it has a detail; labels skip a doubled caption — `plan-view.test.ts › plan lines`
  - `[test]` Segments map done / current / rest; the Go `unknown` step counts as done once a later step started; `Wave N of M` follows `runs.ts`, and is left out for fix runs and between sprints — `plan-view.test.ts › run header`
  - `[test]` Read, save, toggle and shownTab with every edge in contract item 7 — `tab-memory.test.ts › remembers one open tab`
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### M1: Bar ⋯ menu
- **Scope:**
  - `BarMenu` per contract item 8. It holds:
    - the auto-continue switch for the selected run, labeled `Auto-continue`, only when `autoContinue` is given. A press only posts the toggle, as today.
    - the theme as a `.seg` in the order System, Dark, Light;
    - `Ports <n>`, only when `portBase` is given.
  - Open and close rules live in pure `menu-view.ts`:
    - the trigger toggles the menu;
    - Escape and a click outside close it, and focus returns to the trigger;
    - picking a theme or flipping the switch keeps it open;
    - a change of the selected run closes it.
  - The trigger is a square `.btn.sm.icon` with `Icon more`, `aria-label="Menu"` and `aria-expanded`. The menu is a group, not `role="menu"`.
  - Keep the `ThemeControl` and `AutoContinueSwitch` exports and props, because today's `RunsScreen` still mounts them until S1.
- **Files owned:**
  - code: `packages/web/src/screens/runs/BarMenu.tsx` (new), `menu-view.ts` (new), `menu.css` (new), `ThemeControl.tsx`, `AutoContinueSwitch.tsx`
  - tests: `menu-view.test.ts` (new), `bar-menu.test.ts` (new)
- **Success criteria:**
  - `[test]` Toggle, Escape, outside click, theme pick, switch press and run change give the open state above, and say when focus returns — `menu-view.test.ts › open and close`
  - `[test]` The rendered menu has the switch only with `autoContinue`, the ports only with `portBase`, the theme buttons in order with `aria-pressed` on the stored choice (Dark when nothing is stored), and an icon trigger with `aria-label` — `bar-menu.test.ts › menu contents`
  - `[manual]` At desktop and 375 px the menu sits inside the viewport under its trigger, and the theme changes at once — open it on the chess-web copy.
- **Depends on:** L1
- **One-way door:** none
- **Model:** sonnet

### P1: Folder picker panel
- **Scope:**
  - `FolderPicker` per contract item 8. It's a panel in place, not a modal.
  - The panel has:
    - a path input showing the open folder;
    - an Up button (`Icon arrow-up`; at a root it goes to the roots list);
    - one row button per folder (`Icon folder`), with a `pod-docs` mark as an icon plus the words `pod-docs`;
    - `Add this folder` (primary), disabled at the roots list;
    - Close.
  - Pure `folder-picker.ts` holds:
    - the GET client (page token in `X-Pod-Board-Token`; error words as in `actions-client.ts`);
    - `startFolder(repoPaths)`: the parent folder most repos share, with a tie going to the first repo's parent; no repos, or a repo at a root → the roots. A start folder that answers 404 falls back to the roots with no error shown.
    - typing: text ending in a separator lists that folder; otherwise it lists the parent and keeps the folders whose names start with the last part (case-insensitive). Requests wait for 150 ms of quiet, and only the latest one's answer shows. Tab completes the first match plus a separator. A relative path asks for a full path and sends nothing.
    - Add goes through the existing `postRepo` (`add-repo.ts`, unchanged). 201 → `onClose`. An error stays in the panel as `errorSentence`.
  - Escape closes it. A `locked` folder reads `Can't open this folder.`, and `truncated` reads `Showing the first 1000 folders. Type to narrow.`
  - Don't delete `AddRepoForm.tsx`; S1 does.
- **Files owned:**
  - code: `packages/web/src/screens/runs/FolderPicker.tsx` (new), `folder-picker.ts` (new), `picker.css` (new)
  - tests: `folder-picker.test.ts` (new)
- **Success criteria:**
  - `[test]` The client sends the token header, never the token in the URL; no token → `NEED_RELOAD` with no request; 403 `bad token` → `RESTARTED` — `folder-picker.test.ts › listing client`
  - `[test]` `startFolder` covers one parent, mixed parents, a tie, no repos, and a repo at a root — `folder-picker.test.ts › start folder`
  - `[test]` Typing lists the parent and filters by prefix, a trailing separator lists the folder, Tab completes, a relative path sends nothing, and an out-of-order answer is dropped (fake timers) — `folder-picker.test.ts › typing a path`
  - `[test]` Up from a folder lists its parent and from a root lists the roots; a start folder that 404s falls back to the roots; Add is disabled at the roots; Add 201 closes; 409 shows `Already registered.` — `folder-picker.test.ts › clicking down and adding`
  - `[test]` `locked` and `truncated` give their notes — `folder-picker.test.ts › locked and truncated`
  - `[manual]` At desktop and 375 px, on the smoke stack, click from the roots down to a fixture copy holding `pod-docs`, see its mark, and press Add with no typing; the repo shows in the runs list, and the page has no sideways scroll.
- **Depends on:** L1, F1
- **One-way door:** none
- **Model:** opus

### T1: Waiting, Plan and Log tab panels
- **Scope:**
  - The tab panels per contract item 8.
  - **Waiting** renders `items` (contract item 5).
    - An entry row shows its route and date on one line, and its body clamped to 2 lines; a click on the row toggles it open (`aria-expanded`). Answer (answerable only) opens `AnswerForm` in place under that row, with `answerNote(run)`.
    - A PR row shows Merge and opens `MergeConfirm` in place under it (its own `useMergeFlow`).
    - A reply row shows `ReplyPanel`.
    - `info` rows have no button.
    - With no items: `Nothing else waits on you.`
    - The open rows are kept by item key and dropped when their item leaves.
  - **Plan** renders `planLines`: a done line shows `Icon check` in `--ready`; every line carries its word (visible, or `sr-only` on done lines); only the current line shows its detail. `Open the wave board` shows when `boardHref` is given.
  - **Log**: for a plan, the slice log; for a fix run, the agent log and the open engineer's view (today's `FixRun` content without its pipeline). Then Other activity and the Action log.
  - **`ReplyPanel`** keeps its rows (word, why, Copy, Continue or Go). The session line, `cd` and `claude --resume` (each with Copy) move behind a `Run it yourself` button (`aria-expanded`, closed by default). It gains `framed`.
  - Move `AnswerForm` to its own file; `WaitingOnYou.tsx` imports it so screen 1 keeps building until S1.
- **Files owned:**
  - code: `packages/web/src/screens/runs/WaitingTab.tsx` (new), `PlanTab.tsx` (new), `LogTab.tsx` (new), `AnswerForm.tsx` (new), `waiting-tab.ts` (new), `tabs.css` (new), `WaitingOnYou.tsx`, `ReplyPanel.tsx`
  - tests: `waiting-tab.test.ts` (new), `tab-panels.test.ts` (new), `reply-view.test.ts`
- **Success criteria:**
  - `[test]` `toggleOpen` opens and closes by key and prunes keys whose item left — `waiting-tab.test.ts › open rows`
  - `[test]` Rendered Waiting: an answerable entry has Answer, an `info` entry has none, a PR row has Merge, and the body is clamped and `aria-expanded="false"`; an empty list gives the empty note — `tab-panels.test.ts › waiting rows`
  - `[test]` Rendered Plan: one line per step, a check icon on done lines, a state word on every line, a detail only on the current one, and the board link only with `boardHref` — `tab-panels.test.ts › plan lines`
  - `[test]` Rendered Log: the slice log for a plan, the agent log for a fix run, then Other activity and the Action log — `tab-panels.test.ts › log sections`
  - `[test]` ReplyPanel: the commands sit behind a closed `Run it yourself` (`aria-expanded="false"`), Continue and Go still follow `send`, and `framed={false}` drops the frame and heading — `reply-view.test.ts › run it yourself`
  - `[manual]` At desktop and 375 px: a click opens a clamped entry, Answer and Merge open in place, and nothing scrolls sideways.
- **Depends on:** L1, N1
- **One-way door:** none
- **Model:** opus

### S1: Screen 1 layout: bar, header, Next step card, tabs
- **Scope:**
  - **Bar** across the top: the logo and `Pod Board`; a connection status (`.status s-bad`, `lost · retrying`) only while the stream is `lost` (nothing while `live` or `connecting`); `+ Repo` (`.btn.sm.lead` with `Icon plus`, `aria-expanded`) toggling `FolderPicker` under the bar; and `BarMenu`. The banners stay under the bar.
  - **Runs list**: a row shows the repo name, plus ` · <plan>` or ` · fix · <slug>` only when that repo has more than one run in the list. It keeps the state as `.status`, the `fix` tag, and the selection. There are no subtitles.
  - **Main column** (about 720 px on desktop; at 375 px it stacks under the runs list):
    - the `runHeader` (crumb, name, strip, wave);
    - the **Next step card** from `nextSteps(...).card`: label, status, title, detail and its one action. Answer opens `AnswerForm` in place under the card (its own answer flow). Merge opens `MergeConfirm` under the card. A reply shows `ReplyPanel framed={false}`. `Nothing to do` uses `.card.calm` and has no button. The card never folds.
    - **Tabs** under the card: `Waiting` with count `rest.length`, `Plan` (hidden on a plan-less row), `Log`. They're opened and closed through `tab-memory`, and the page ends under the card when all are closed.
  - **Wave board view** (`/board`): the header, a `Back to the run` link and `BoardScreen` at full main width, with no card or tabs. The URLs don't change, and the Pipeline / Wave board tabs go.
  - **Fix agent view** (`/agent/<id>`): the Log tab is shown open.
  - Delete `AddRepoForm.tsx`, `WaitingOnYou.tsx`, `Pipeline.tsx` and `FixRun.tsx`, and `createAddRepoForm` with its tests. Fix the big gaps at 375 px.
  - Docs: update `runs-and-pipeline.md` (screen 1, the menu, the picker, the tabs) and the `codebase-structure.md` Key URLs and web part (no `live` chip, no Wave board tab).
- **Files owned:**
  - code: `packages/web/src/screens/runs/RunsScreen.tsx`, `NextStepCard.tsx` (new), `RunHeader.tsx` (new), `RunsList.tsx`, `runs.css`, `view.ts`, `packages/web/src/add-repo.ts`
  - tests: `packages/web/src/screens/runs/view.test.ts`, `runs-screen.test.ts` (new), `runs-css.test.ts`, `packages/web/src/add-repo.test.ts`
  - deleted: `packages/web/src/screens/runs/AddRepoForm.tsx`, `WaitingOnYou.tsx`, `Pipeline.tsx`, `FixRun.tsx`
  - docs: `pod-docs/feature-details/runs-and-pipeline.md`, `pod-docs/codebase-structure.md`
- **Success criteria:**
  - `[test]` The stream status shows only for `lost` — `view.test.ts › connection status only when lost`
  - `[test]` A run row's label adds the plan or fix slug only when its repo has more than one run — `view.test.ts › run row label`
  - `[test]` Rendered screen with a waiting PR: the card has exactly one primary button (Merge), the tabs follow it with every tab closed, and no `live` text — `runs-screen.test.ts › card then closed tabs`
  - `[test]` Rendered with a `BLOCKED → human` and a PR: the card shows Answer and the Waiting count is 1 — `runs-screen.test.ts › blocked first, rest counted`
  - `[test]` Rendered with nothing waiting: `Nothing to do`, `.card.calm`, and no button in the card — `runs-screen.test.ts › nothing to do`
  - `[test]` A stored `plan` tab renders the Plan panel, a plan-less row hides Plan, and the agent view shows Log — `runs-screen.test.ts › remembered tab`
  - `[test]` The board view renders `BoardScreen`, a back link to the run, and no card or tabs — `runs-screen.test.ts › wave board view`
  - `[test]` At `max-width: 480px` the layout is one column, and no rule sets a fixed width over 375 px — `runs-css.test.ts › phone layout is one column`
  - `[manual]` At 375 × 667, on a chess-web copy with wave 3 T1 at `#78 · pushed` and the autopilot marker removed (two runs listed): the card and Merge show with no scrolling, and there's no sideways scroll. At desktop the column is about 720 px.
  - `[manual]` From the new screen, each of these still works: Merge with its confirm, Answer, Continue, Go, auto-continue, Copy continue, and `cd` / `claude --resume` under `Run it yourself`. Use the smoke recipe's fake `claude`.
- **Depends on:** L1, N1, M1, P1, T1
- **One-way door:** none
- **Model:** opus

## Sprint summary

- **Synced with merge-target:** up to date (`pod-staging` had `main` merged in at preflight; nothing new since)
- **Slices shipped:** L1, F1, N1, M1, P1, T1, S1
- **Queue entries:** resolved 1 (gate 1, manifest colors: human chose dark), deferred 5 — N1 card wording, N1 halt-vs-PR card rule, T1 no-session note behind "Run it yourself", P1 partial-name Add, P1 1000-folder prefix limit (all in [handoff-queue.md](../../handoff-queue.md), sorted at plan complete)
- **Slice log:**
  - L1: opus · medium · test-first yes · runtime dark/light boot, 44 px controls at 375, board and engineer view · 6 NOTEs · time lost: one gate 1 halt (manifest test outside its files)
  - F1: opus · medium · test-first yes · runtime real API on Windows (roots, listing, links to shares skipped, token and Host refusals) · 6 NOTEs · time lost ~5 min on backslash escaping
  - N1: opus · medium · test-first yes · runtime n/a (pure modules, fixture tests) · 3 NOTEs · time lost none
  - M1: sonnet · medium · test-first yes · runtime menu mounted temporarily (theme, switch, Escape, 375 px) · 5 NOTEs · time lost none
  - P1: opus · medium · test-first yes · runtime picker logic against the live API (no browser: agent-browser hung twice from Git Bash) · 2 NOTEs · time lost ~4.5 min on browser hangs
  - T1: opus · medium · test-first yes · runtime Reply panel and Answer on the old screen · 4 NOTEs · time lost one browser hang (120 s)
  - S1: opus · medium · test-first partly — two reds were missing-export errors, one scenario changed after the red commit · runtime full screen 1 with stub gh and fake claude · 9 NOTEs · time lost ~5 min on a stdin `cat` and browser wrapper hangs
  - Wave fixes: none. Stalls: none. Orchestrator wave checks: wave 2 mounted the unmounted parts temporarily (reverted) to drive them.
- **Agent context at hand-back:** 1,442,029 tokens (sprint planner 216,845; L1 238,023; F1 153,991; N1 173,849; M1 86,339; P1 149,750; T1 170,658; S1 252,574) — *each agent's final context size, not tokens billed*

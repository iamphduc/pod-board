# App shell, theme, and install

## What it is

The frame around every screen: the web app at `http://127.0.0.1:<web>/`, the bar with "Pod Board" and the `live` chip, the System / Light / Dark control, the theme applied before first paint (Dark unless you picked another), and the PWA manifest so Chrome or Edge can install the board as an app window. Covers the features.md rows Web shell, Theme, Theme boot, and PWA. Theme code and tokens live in `packages/web/src/theme/`; the boot script is inline in `packages/web/index.html`.

## How it works

- **Serving.** Vite serves the React app on the web port and proxies `/api` to the API port; both bind `127.0.0.1` only, ports from `POD_BOARD_WEB_PORT` and `POD_BOARD_API_PORT`.
- **Theme.** The choice is stored under `pod-board-theme` in `localStorage`: `dark`, `light`, or `system`. Nothing stored, an unknown value, or storage that throws reads as **Dark**, the default (`readChoice`). `light` and `dark` set `data-theme` on `<html>`; `system` removes it, so `prefers-color-scheme` decides.
- **Theme boot.** An inline script before the module script reads the stored choice and sets `data-theme` by the same rule: the stored `light` or `dark`, nothing for `system`, and `dark` for anything else (nothing stored, an unknown value, or storage that throws). A `color-scheme` meta and two `:root[data-theme]` rules make the browser's own canvas follow it. The `theme-color` metas are `#000000` (dark) and `#ffffff` (light).
- **Tokens.** Only the theme files define colors and fonts; screen CSS uses tokens, never color literals. The palette is the calm-dashboard Look's, one token per entry: `--bg --surface --hover --border --border-strong --fg --muted --faint --primary-bg --primary-fg --focus`, the status colors `--blocked --needs-you --running --ready --idle`, and `--shadow` (the menu's shadow). `:root` holds the light values; `:root[data-theme="dark"]` and the dark media query hold the dark ones. The `--size-*` and `--radius-*` names stay.
- **Fonts.** Geist (400, 500, 600) for the UI and headings, Geist Mono (400, 500) for paths, commands, numbers, and labels: latin woff2 copied from the Fontsource packages (not dependencies), in `public/fonts/` with each OFL text. `index.html` preloads `geist-400.woff2`. Nothing loads from another host.
- **States.** Every state is a dot plus a word (`.status`, or `.chip`, which keeps its markup and looks the same): the dot takes the status color, and the word stays `--fg` or `--muted`. `--faint` and the status colors are never a text color; `--faint` is for icons and rules. Cards have no colored edge and no color fill. A kind tag (`chip tag`, the `fix` beside a fix run's repo) is an outlined chip with no dot, so it never reads as a state. An error or a merge reason is plain text with a colored dot before it.
- **Icons.** `theme/icons.tsx` exports `Icon({ name })`: a 16 px SVG in `currentColor`, 1.5 px stroke, `aria-hidden`. Names: `plus`, `more`, `check`, `chevron-right`, `chevron-down`, `arrow-up`, `folder`, `close`. No button label uses a text glyph such as `+` or `⋯`.
- **Controls.** `base.css` holds the shared controls, so screens don't restyle them:
  - `.btn` is 40 px tall with 20 px sides; `.btn.sm` is 32 px with 12 px sides. Labels are 14 px / 500 at both sizes. `.btn.lead` (icon before the label) and `.btn.trail` (icon after) cut the icon side to 16 px (10 px small). `.btn.icon` is square and icon only, and needs an `aria-label`.
  - `.btn.primary` is the main action: `--primary-bg` / `--primary-fg` in every state (white on black in dark, black on white in light), never blue or a danger color. `.btn.quiet` has no fill or frame until hovered, for Cancel.
  - `.input`, and `<textarea class="input">` for multi-line text (at least 72 px, resizes downward).
  - `.switch`: `<button class="switch" role="switch" aria-checked="false">Auto-continue</button>`. The track and knob are pseudo-elements and the label is the button text; on moves the knob right and fills the track with `--fg`, so the state shows in form, not by color alone. Toggle `aria-checked`, not a class.
  - `.tabs` / `.tab`: each tab is a `button` with `aria-expanded`; the open one is underlined, and `.tab .n` is its count. `.seg` holds buttons with `aria-pressed`. `.menu` is the only element with a shadow. `.card` is plain; `.card.calm` is dashed and transparent.
  - `.inplace`: a panel that opens under the step or entry it acts on, never a modal. Buttons go in `.inplace-actions`, which stacks on a phone.
  - At 480 px wide or less, `.btn` (all sizes), `.input`, and `.switch` are at least 44 px tall, and `.btn.icon` is 44 × 44. Wider screens use the 40 and 32 px sizes.
- **PWA.** `/manifest.webmanifest` (`application/manifest+json`) and icons (`/icons/icon-192.png`); Chrome offers to install from `127.0.0.1`.

## Why it's this way

- **A local web app, not a desktop app:** a Node server opened in the browser, with a PWA window. Tauri or Electron was turned down for phase 1; a wrapper can come later without a rewrite.
- **Dark by default, black and white:** the calm-dashboard plan's Look, drawn in `../design-drafts/calm-dashboard-look-3.html`. It replaced the board-read look (slate and cobalt, Bricolage Grotesque, Instrument Sans, JetBrains Mono, tinted chips, and colored card edges).
- **States are dots plus words, never text color:** `--faint` and the light status colors fail 4.5:1 as text, so color stays on the dot. This made the old darker-ink-tokens decision obsolete; see [decisions.md](../decisions.md#2026-10-28--states-are-dots-plus-words-the-ink-tokens-go).
- **An inline boot script plus `color-scheme`**, not applying the theme in `main.tsx`: in dev Vite loads the CSS from the module script, so a stored Dark choice painted white first.
- **Self-hosted fonts:** the plan rules out requests to other hosts.

## Watch out

- The look to build to is `pod-docs/plans/calm-dashboard.md` `## Look` and its draft `pod-docs/design-drafts/calm-dashboard-look-3.html`, not `docs/design/preview.html`. The wave board's critical path line is `--fg`; the other lines are `--border-strong`.
- `tokens.test.ts` keeps the 4.5:1 check for `--fg` and `--muted` on `--bg`, `--surface`, and `--hover`, and for `--primary-fg` on `--primary-bg`. It also fails on any CSS file under `packages/web/src` that sets `color` to `--faint` or a status token (a rule that targets an `svg`, such as a done step's check icon, may), or that uses an old token name (`--panel`, `--line`, `--accent`, `--ok`, `--warn`, `--bad`, `--*-soft`, `--*-ink`, `--display`, `--body`).
- The boot script and the app share `THEME_KEY` and the dark default; change both or neither.
- `public/manifest.webmanifest` uses the dark (default) `--bg`, `#000000`, for `background_color` and `theme_color` (`pwa.test.ts`); the human chose dark on 2026-10-28.
- "Chrome reports installable" wasn't run in any of the five review rounds; S1 saw the install offer only in headless Chrome.
- `tokens.test.ts` and `controls.test.ts` find rules by selector text. Write a new rule's selector exactly (`textarea.input {`, not `textarea.input{`), and keep `textarea.input` after `.input` so the older tests read the right block.
- `base.css` takes colors from tokens only; `controls.test.ts` fails on any hex, `rgb()`, `hsl()`, or named color. `transparent` and `currentColor` are allowed.
- agent-browser hangs when run from Git Bash on Windows; see [known-issues/agent-browser-git-bash.md](../known-issues/agent-browser-git-bash.md).
- A render error shows a `render failed` notice in place of the board (`ErrorBoundary.tsx`), and the board tries again when the next changed Board arrives. Keep the stream in `App`, above the boundary: a boundary around `App` would stop the stream and never recover.

## History

- 2026-10-19 · board-read · added: the bootstrap page (B1), the look foundation (server-runs L1), screen 1's theme control and PWA (S1), and theme boot (board-engineer X1) · [report](../reports/board-read.html)
- 2026-10-20 · board-read · final review passed at round 5; Theme, Theme boot, and PWA rows driven live · [report](../reports/board-read.html)
- 2026-10-20 · fix-show-fix-runs: an outlined kind tag chip (`chip tag`) marks fix runs in the runs list.
- 2026-10-21 · merge-actions L1: shared controls for the board's actions: `.btn.quiet`, `textarea.input`, `.switch`, `.inplace`, and 44 px controls at 480 px or less.
- 2026-10-25 · fix-render-error-boundary: a render error shows a notice and recovers on the next Board; it used to leave a blank page until a reload.
- 2026-10-28 · calm-screen L1: the calm-dashboard Look. Geist tokens and fonts, Dark by default (nothing stored reads as Dark), states as dots plus words, plain cards, the Look's button sizes, `.status`, `.tabs`, `.menu`, `.seg`, `.card.calm`, and `Icon`.

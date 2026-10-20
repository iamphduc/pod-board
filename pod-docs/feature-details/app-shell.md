# App shell, theme, and install

## What it is

The frame around every screen: the web app at `http://127.0.0.1:<web>/`, the bar with "Pod Board" and the `live` chip, the System / Light / Dark control, the theme applied before first paint, and the PWA manifest so Chrome or Edge can install the board as an app window. Covers the features.md rows Web shell, Theme, Theme boot, and PWA. Theme code and tokens live in `packages/web/src/theme/`; the boot script is inline in `packages/web/index.html`.

## How it works

- **Serving.** Vite serves the React app on the web port and proxies `/api` to the API port; both bind `127.0.0.1` only, ports from `POD_BOARD_WEB_PORT` and `POD_BOARD_API_PORT`.
- **Theme.** The choice is stored under `pod-board-theme` in `localStorage`: `light`, `dark`, or nothing for System. It sets `data-theme` on `<html>`; System follows `prefers-color-scheme`.
- **Theme boot.** An inline script before the module script reads the stored choice and sets `data-theme`. A `color-scheme` meta and two `:root[data-theme]` rules make the browser's own canvas follow it. Missing, unknown, or throwing storage does nothing.
- **Tokens.** Only the theme files define colors and fonts; screen CSS uses tokens, never color literals. Fonts (Bricolage Grotesque, Instrument Sans, JetBrains Mono) are self-hosted woff2 with their licenses. Nothing loads from another host.
- **Chips.** Every state has a chip and a card edge, never text alone. Text under 12 px in the preview was raised to 12 or 13 px.
- **PWA.** `/manifest.webmanifest` (`application/manifest+json`) and icons (`/icons/icon-192.png`); Chrome offers to install from `127.0.0.1`.

## Why it's this way

- **A local web app, not a desktop app:** a Node server opened in the browser, with a PWA window. Tauri or Electron was turned down for phase 1; a wrapper can come later without a rewrite.
- **Light chip text uses `--*-ink` tokens**, slightly darker than the approved preview, because the preview's light chips failed 4.5:1 contrast. The human chose this over the preview's colors. See [decisions.md](../decisions.md#2026-10-19--light-chip-text-darker-ink-tokens) and the draft `../design-drafts/chip-contrast.html`.
- **An inline boot script plus `color-scheme`**, not applying the theme in `main.tsx`: in dev Vite loads the CSS from the module script, so a stored Dark choice painted white first.
- **Self-hosted fonts:** the plan rules out requests to other hosts.

## Watch out

- The approved design is `docs/design/preview.html`; build to it. Its critical path is drawn in yellow, but the plan's Look says accent, and the board follows the plan.
- `tokens.test.ts` keeps the 4.5:1 contrast check; changing a light ink color must still pass it.
- The boot script and the app share `THEME_KEY`; rename both or neither.
- "Chrome reports installable" wasn't run in any of the five review rounds; S1 saw the install offer only in headless Chrome.
- agent-browser hangs when run from Git Bash on Windows; see [known-issues/agent-browser-git-bash.md](../known-issues/agent-browser-git-bash.md).

## History

- 2026-10-19 · board-read · added: the bootstrap page (B1), the look foundation (server-runs L1), screen 1's theme control and PWA (S1), and theme boot (board-engineer X1) · [report](../reports/board-read.html)
- 2026-10-20 · board-read · final review passed at round 5; Theme, Theme boot, and PWA rows driven live · [report](../reports/board-read.html)

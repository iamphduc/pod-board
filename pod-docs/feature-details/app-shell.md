# App shell, theme, and install

## What it is

The frame around every screen: the web app at `http://127.0.0.1:<web>/`, the bar with "Pod Board" and the `live` chip, the System / Light / Dark control, the theme applied before first paint, and the PWA manifest so Chrome or Edge can install the board as an app window. Covers the features.md rows Web shell, Theme, Theme boot, and PWA. Theme code and tokens live in `packages/web/src/theme/`; the boot script is inline in `packages/web/index.html`.

## How it works

- **Serving.** Vite serves the React app on the web port and proxies `/api` to the API port; both bind `127.0.0.1` only, ports from `POD_BOARD_WEB_PORT` and `POD_BOARD_API_PORT`.
- **Theme.** The choice is stored under `pod-board-theme` in `localStorage`: `light`, `dark`, or nothing for System. It sets `data-theme` on `<html>`; System follows `prefers-color-scheme`.
- **Theme boot.** An inline script before the module script reads the stored choice and sets `data-theme`. A `color-scheme` meta and two `:root[data-theme]` rules make the browser's own canvas follow it. Missing, unknown, or throwing storage does nothing.
- **Tokens.** Only the theme files define colors and fonts; screen CSS uses tokens, never color literals. Fonts (Bricolage Grotesque, Instrument Sans, JetBrains Mono) are self-hosted woff2 with their licenses. Nothing loads from another host.
- **Chips.** Every state has a chip and a card edge, never text alone. A kind tag (`chip tag`, the `fix` beside a fix run's repo) is an outlined chip with no dot, in `--muted` on `--line`, so it never reads as a state. Text under 12 px in the preview was raised to 12 or 13 px.
- **Controls.** `base.css` holds the shared controls, so screens don't restyle them:
  - `.btn`, `.btn.primary` (the main action, accent fill; the merge button uses it, never a danger color), and `.btn.quiet` (no fill or frame until hovered, for Cancel).
  - `.input`, and `<textarea class="input">` for multi-line text (body font, at least 72 px, resizes downward).
  - `.switch`: `<button class="switch" role="switch" aria-checked="false">auto-continue</button>`. The track and knob are pseudo-elements and the label is the button text; on moves the knob right and fills the track, so the state shows in form, not by color alone. Toggle `aria-checked`, not a class.
  - `.inplace`: a panel that opens under the step or entry it acts on, never a modal. Buttons go in `.inplace-actions`, which stacks on a phone.
  - At 480 px wide or less, `.btn`, `.input`, and `.switch` are at least 44 px tall. Wider screens keep the phase 1 sizes.
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
- `tokens.test.ts` and `controls.test.ts` find rules by selector text. Write a new rule's selector exactly (`textarea.input {`, not `textarea.input{`), and keep `textarea.input` after `.input` so the older tests read the right block.
- `base.css` takes colors from tokens only; `controls.test.ts` fails on any hex, `rgb()`, `hsl()`, or named color. `transparent` and `currentColor` are allowed.
- agent-browser hangs when run from Git Bash on Windows; see [known-issues/agent-browser-git-bash.md](../known-issues/agent-browser-git-bash.md).

## History

- 2026-10-19 · board-read · added: the bootstrap page (B1), the look foundation (server-runs L1), screen 1's theme control and PWA (S1), and theme boot (board-engineer X1) · [report](../reports/board-read.html)
- 2026-10-20 · board-read · final review passed at round 5; Theme, Theme boot, and PWA rows driven live · [report](../reports/board-read.html)
- 2026-10-20 · fix-show-fix-runs: an outlined kind tag chip (`chip tag`) marks fix runs in the runs list.
- 2026-10-21 · merge-actions L1: shared controls for the board's actions: `.btn.quiet`, `textarea.input`, `.switch`, `.inplace`, and 44 px controls at 480 px or less.

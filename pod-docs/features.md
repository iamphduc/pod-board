# Features

_For agents: engineers and the reviewer drive these rows. You add or fix rows when a feature changes._

> How to prove each user-facing feature works on the running app (start it per the brief's `## Smoke recipe`). Agents drive these rows to check their work, and the reviewer drives every row at plan end, so a feature that quietly breaks later gets caught. Keep to the features a user would miss first.
>
> - **Drive:** an action on the running app — a request, a CLI call, or browser steps. Running a test file isn't a drive: the tests already run under the smoke recipe's `Verification:`.
> - **Proof:** what you can observe when it works — a response, a value read back from storage after a reload or restart, text on the page. "No errors" isn't proof.
> - A feature with notes in `feature-details/` links to them from its **Feature** cell.
> - A failing row is a bug, unless a plan changed that feature on purpose — then update the row. Never edit a row just to make it pass.

| Feature | User reaches it by | Drive | Proof |
|---|---|---|---|
| API health | `GET /api/health` on the API port | `curl -s http://127.0.0.1:<api>/api/health`, and the same path on the web port (proxy) | Both answer `{"ok":true}`; `/api/nope` answers 404; `netstat` shows both ports listening on `127.0.0.1` only |
| Web shell | Open the web URL | Browser: open `http://127.0.0.1:<web>/`, then stop the API and reload | Heading "Pod Board" and "API health: ok"; with the API stopped, "API health: down (HTTP 502)" |
| [Board JSON](feature-details/server.md) | `GET /api/board` (the web app reads it) | Start with `POD_BOARD_CONFIG_DIR=<temp dir>`, then `curl -s http://127.0.0.1:<web>/api/board` | JSON with `gh` and `repos`; each repo has `name`, `source` (`registered`, `claim`, or `both`), `model.docs`, `model.plans`, `agents`, and `prs`; a run with a claim file in `<temp>/pod-ports/` shows `source: claim` with its port base |
| [Live updates](feature-details/server.md) | The web app's `EventSource('/api/events')` | `curl -sN http://127.0.0.1:<web>/api/events`, then change a slice status in a registered repo's sprint doc (use a temp copy, never a real repo) | An `event: board` at once, and another within 5 s of the edit; a rewrite with the same text sends none |
| [Add repo](feature-details/server.md) | Add repo (API now; screen 1's form in wave 3) | `POST /api/repos` with `Content-Type: application/json`, `Origin: http://127.0.0.1:<web>`, body `{"path":"<absolute folder>"}`; repeat it with other case or slashes; restart the server | `201`, then `409` for the same folder; `400` for a relative path, `415` for another content type; the repo is still listed after the restart, read back from `<config dir>/config.json` |
| [Request guard](feature-details/server.md) | Any request | `curl -H "Host: other.test:<api>" http://127.0.0.1:<api>/api/board`; a POST with `Origin: http://other.test` | `403 forbidden host` and `403 forbidden origin`; `netstat` shows both ports on `127.0.0.1` only |
| [Screen 1: runs list and pipeline](feature-details/runs-and-pipeline.md) | Open the web URL | Start with `POD_BOARD_CONFIG_DIR=<temp dir>` and register two repos (a temp copy of `packages/model/fixtures/chess-web` for a second run); open `http://127.0.0.1:<web>/` at 1280 px and at 375 px; click each run | Header `Runs · N active`; each run has a state chip and `<plan> · <sprint> · wave w/n`; clicking a run sets `#/<repoId>/<plan>` and shows its pipeline (Plan, one stage per sprint, Check, Ship) and slice log with confidence, minutes, and tokens; at 375 px the page is 375 px wide, the runs list stacks above, and the pipeline scrolls inside its own frame |
| Screen 1 live state | The `live` chip in the bar | Change a slice status in the temp repo copy (for example T1 → `blocked`); then stop the API, then start it again | The run's chip and wave step change with no reload, within 5 s; with the API stopped the chip shows `lost · retrying` with a banner and the last board stays; after restart the chip returns to `live` |
| Screen 1 Add repo | The Add a repo form | Submit a folder path; submit the same path again; press Escape | The repo appears in the list; the second submit shows "Already registered."; Escape clears the error |
| Theme | System / Light / Dark in the bar | Pick Dark on a light system, then reload | `data-theme="dark"`, the dark palette, and the choice kept after reload; Light and Dark colors match the plan's Look |
| PWA | Browser install offer | `curl` `/manifest.webmanifest` and `/icons/icon-192.png` on the web port | `200` with `application/manifest+json` and `image/png`; Chrome reports the app installable from `127.0.0.1` |

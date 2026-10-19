# Fixtures

Real pod-run docs from four repos, trimmed and scrubbed, for the run model's tests. Each folder mirrors its repo's root: `chess-web/pod-docs/plans/sparring-ladder.md` is `pod-docs/plans/sparring-ladder.md` in chess-web. Load one with `loadFixture('<repo>')` from `packages/model/test/load-fixture.ts`.

## Sources

Snapshot date: 2026-10-18. Each file is the committed text at the commit below, not the working tree.

| Folder | Source repo | Commit | Layout | Files |
|---|---|---|---|---|
| `chess-web` | `iamphduc/chess-web` | `18990f3` | `pod docs: 2` | `pod-docs/README.md`, `pod-docs/plans/*.md`, `pod-docs/sprints/*.md`, `pod-docs/sprints/archive/*.md`, `pod-docs/handoff-queue.md` |
| `ytb-feed` | `iamphduc/ytb-feed` | `f71171f` | `pod docs: 2` | the same set |
| `speak-out` | `iamphduc/speak-out` | `f942915` | older `docs/` layout, no `pod-docs/README.md` | `docs/handoff-queue.md` |
| `skyscraper-view` | `iamphduc/skyscraper-view` | `bff91df` | older `docs/` layout, no `pod-docs/README.md` | `docs/handoff-queue.md` |

chess-web is taken at `18990f3` ("wave 2 merged (#77), start wave 3") instead of its newest commit. There, the `ladder` sprint is still active in `pod-docs/sprints/ladder.md`, mid-run: waves 1 and 2 merged, wave 3 pending. A few minutes later the sprint finished and its doc moved to `pod-docs/sprints/archive/`.

## What was cut

Only the lines the parsers read are kept, each unchanged:

- Plans and sprint docs: the `# ` title, italic header lines (`_From plan: … · Status: …_`), the `<!-- autopilot-run: … -->` line, `Port base:` lines, `## ` headings, every table row, and the **Slice log** lines of `## Sprint summary`.
- chess-web's `ladder.md` also keeps, under `## Per-slice detail`, each `### <code>: <title>` heading and its `- **Files owned:**` line (with the indented lines under it), `- **One-way door:**` line, and `- **Model:**` line. The other sprint docs don't have them yet.
- `pod-docs/README.md`: the title and the `pod docs:` line.
- Handoff queues: the title, `## ` headings, and every entry line (`` - `[date · TYPE · from → to …]` … ``).
- speak-out's queue is cut further, to a sample: the title, the `## Currently pending` heading, and three neutral entry lines (231 entries, about 300 KB, before). The board only needs it to prove the old layout reads as unsupported, and the rest was another app's internal notes, some about auth and security. See `pod-docs/decisions.md` › "2026-10-19 — cut the speak-out fixture to a sample".

Everything else is cut. Each run of cut lines becomes one blank line. Files outside the list above (decisions, features, reports, research, design drafts, transcripts) aren't copied.

## Scrubbing

`packages/model/test/scrub.test.ts` checks every file here for emails, home paths, drive-letter paths, token shapes, and files that aren't `.md`. Before the speak-out queue was cut to a sample, two replacements were made in it: local seed-account logins became `admin (seed account)`, and the absolute path to the checkout became `<repo>`. None of the lines that had them are in the sample.

No other text was changed. GitHub links such as `https://github.com/iamphduc/chess-web/pull/76` are kept.

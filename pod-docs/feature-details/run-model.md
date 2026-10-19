# Run model

`buildRepoModel(files)` in `packages/model/src/run-model.ts` turns one repo's pod docs into plans → sprints → waves → slices, plus the handoff queue. The server reads the files; the model only gets their text as a `RepoFiles` map (repo-relative path → text). It never throws: a missing, empty, or odd file gives `unknown`, empty, or absent fields.

It builds on the ported pod-flow parsers (`packages/model/src/pod-flow/`, kept as a faithful copy) and the format readers (`packages/model/src/formats.ts`). Changes go in `run-model.ts` or new modules, never in the copy.

## Rules

- **Docs gate.** `docs` comes from the `pod docs: <N>` line of `pod-docs/README.md`. Any version other than 2, or no README, returns `plans: []` and `queue: []` with nothing else read. Why: an older or newer layout would parse into a wrong board, and a wrong board is worse than an empty one. The older `docs/` layout has no `pod-docs/README.md`, so it reads as unsupported.
- **Keys.** `\` in keys becomes `/` first, so a Windows snapshot gives the same model.
- **Plans.** Each `.md` directly in `pod-docs/plans/` or `pod-docs/plans/archive/`; slug from the file name; sorted by slug. Other files (`.gitkeep`, `.txt`) and deeper folders are ignored. The same slug in both folders → the archived copy. Title and status come from `parsePlan`; `portBase` and `go` from `planExtras` (`go` is always `'unknown'`: pod doesn't record it yet). A sprint-table row with an empty Sprint cell is skipped.
- **Sprint docs.** Each `.md` directly in `pod-docs/sprints/` (`isArchived: false`) and `pod-docs/sprints/archive/` (`isArchived: true`), keyed by the `Slug:` header, else the file name. The same slug in both → the archived copy, since archiving is the last step of a sprint.
- **Joining.** A doc joins the plan its `From plan:` names. With no `From plan:`, it joins the first plan (by slug) whose sprint table lists it. A doc whose `From plan:` names a plan that isn't there, or that no table lists, is dropped: the board can't place it.
- **Sprint order.** The plan's sprint-table order, then docs that name the plan but aren't in its table (by slug).
- **Sprint status.** Row `done` or archived doc → `done`; row `active` or a live doc → `active`; row `planned` → `planned`; anything else → `unknown`. A live doc wins over a `planned` row, because pod writes the doc when the sprint starts and may not have updated the plan yet. A row with no doc has `hasDoc: false` and `waves: []`.
- **Waves and slices.** Board rows grouped by wave number, waves ascending, slices in table order. A wave cell that isn't a number reads as wave 0 (the parser's rule). `pr` is `prRef(cell, status)`. `dependsOn` is `sliceDeps` of the board's `Depends on` cell (`parseSprint` drops that column, so it's read again from the same table, row for row); no such column → `[]`. Values are kept as written, even when they match no code on this board: older boards name slices by word (`geometry`), and a dependency may sit in an earlier sprint.
- **Current.** `currentSprint` is the first sprint, in sprint order, that isn't `done`; absent when all are done or the plan is `archived`. `currentWave` is the lowest wave with a slice that isn't `isDone` (a `blocked` or `skipped` status counts as not done, even with a merged PR cell); absent with no doc, no slices, or every slice done.
- **Queue.** The repo's `queue` is every entry of `pod-docs/handoff-queue.md` in file order, each with `needsYou`. A plan's `queue` holds entries whose `plan:` is its slug, or, with no `plan:`, whose `sprint:` is one of its sprints. Entries naming neither stay only on the repo. A missing queue file → `[]`.

## Watch out

- The ported `parseSprint` reads `Slug:` with `[\w-]+`, which takes `_`. A header that ends right after the slug (`· Slug: ladder_`) reads as `ladder_`. Real docs always have `· Status:` after it, so it hasn't bitten yet.
- `parsePlan` defaults a missing plan status to `active` and a missing sprint-row status to `planned`.
- Tests under `packages/model/src/` must build `RepoFiles` inline (the no-I/O test scans that folder). Tests that read fixtures go in `packages/model/test/fixtures.test.ts`.

## History

- 2026-10-18 — added in sprint bootstrap-model (slice R1).

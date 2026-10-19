# Run model

`buildRepoModel(files)` in `packages/model/src/run-model.ts` turns one repo's pod docs into plans → sprints → waves → slices, plus the handoff queue. The server reads the files; the model only gets their text as a `RepoFiles` map (repo-relative path → text). It never throws: a missing, empty, or odd file gives `unknown`, empty, or absent fields.

`parseAgentTranscript` in `packages/model/src/transcript.ts` turns one pod agent's transcript into an `AgentRun`, and `agentState` says whether the agent is still running. The board types the server sends (`Board`, `BoardRepo`, `AgentRun`, `PrStatus`, `Claim`) are in `packages/model/src/board.ts`.

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
- **Current.** `currentSprint` is the first sprint, in sprint order, that isn't `done`; absent when all are done or the plan is `archived`. `currentWave` is the lowest wave with a slice that isn't `isDone` (a `blocked` or `skipped` status counts as not done, even with a merged PR cell); absent with no doc, no slices, every slice done, or a sprint whose status is `done`. Why: a sprint that finished with a blocked or skipped slice is over, and pointing at that wave would show it as still running.
- **Per-slice detail.** Each slice reads its `### <code>: <title>` section of the sprint doc (the code before the colon must match exactly; the first such section wins). The section runs to the next `##` or `###` heading. Only top-level bullets count as fields, so a `**Model:**` inside the Scope text isn't the field. `model` is the first word of `- **Model:**`, lowercased (`sonnet 4.5` → `sonnet`). `filesOwned` is every backticked path in `- **Files owned:**` and the deeper lines under it, in order, without `(new)`; with no backticks, the text split on commas; a lone dash names no file. Paths are kept as written, even shorthand such as `SetupCard.css` that real docs write after a full path. `oneWayDoor` is the text of `- **One-way door:**`, absent when it's empty or starts with the word `none`. No section → no `model` or `oneWayDoor`, and `filesOwned: []`.
- **Queue.** The repo's `queue` is every entry of `pod-docs/handoff-queue.md` in file order, each with `needsYou`. A plan's `queue` holds entries whose `plan:` is its slug, or, with no `plan:`, whose `sprint:` is one of its sprints. Entries naming neither stay only on the repo. A missing queue file → `[]`.

## Transcripts

`parseAgentTranscript({ id, session, meta, jsonl })` gets the text of `agent-<id>.meta.json` and `agent-<id>.jsonl`; the server finds and reads the files. It never throws.

- **Pod agents only.** `undefined` when `meta` isn't a JSON object or its `agentType` doesn't start with `pod:`. `type` is `agentType`; `description` is cut to 80 characters (`''` when missing).
- **Dispatch.** `sprint`, `slice`, `branch`, `plan`, and `round` come from `parseDispatch` of the first `user` record that has a prompt: its string content, or its first text block. Later user records (tool results, follow-ups) are never read for fields.
- **Times.** `startedAt` and `lastAt` are the first and last `timestamp` that parses, in file order, over every record type.
- **Tokens.** `turnTokens` (input + output + cache writes; cache reads are left out) summed once per `message.id`. One message streams over several records with the same id, and only its last record has the final output count, so the last record's usage counts. Usage on a record with no `message.id` is skipped; a usage field that isn't a number counts as 0.
- **Model.** The `message.model` of the last assistant record that has one.
- **Ended.** Any `tool_use` block named `SubagentHandback`, or the last assistant record's `stop_reason` is `end_turn`. In real transcripts most agents end on the hand-back, whose record has `stop_reason: null`.
- **Bad input.** A line that isn't JSON, a partial last line, a record that isn't an object, or one missing fields is skipped.
- **No text kept.** Only the fields above leave the parser; transcript text, tool input, and tool output never do.
- **State.** `agentState(a, now)`: `ended` → `'ended'`; else `now - lastAt < STALE_MS` (30 minutes) → `'running'`; else, or with no `lastAt`, `'stale'`. A `lastAt` ahead of `now` (clock skew) reads as running.

## Tool timeline

`parseAgentTimeline({ agentId, jsonl, roots })` in `packages/model/src/timeline.ts` turns one agent's transcript into an `AgentTimeline`: one event per tool call and the agent's test progress. The server passes `roots: [repo.path]`. It never throws.

- **No text leaves it.** A summary is built only from the tool name, file paths, and fixed words. Assistant text, thinking, prompts, tool output, command arguments, search patterns, edit contents, and URLs beyond the host never do. Why: transcripts can hold secrets, and the board serves the timeline to a browser.
- **Events.** One per `tool_use` block in `assistant` records, deduped by `tool_use.id`, because a block repeats over a message's streamed records (a block with no id counts each time). `at` is the record's timestamp; a block in a record with no valid timestamp is skipped. `result` comes from the first `tool_result` with that `tool_use_id` that comes after the call: `is_error: true` → `failed`, else `ok`; none yet → absent. Events sort oldest first (file order on a tie) and the newest 300 are kept; `total` counts all.
- **Tool name.** Kept when it matches `^[\w:.-]{1,64}$`, else `tool`.
- **Paths** (`file_path`, `notebook_path`, `path`): `\` → `/`; after `/.claude/worktrees/<name>/` → the rest; else after a root (any case, on a `/` boundary) → the rest; else the base name. Over 60 characters → `…` and the last 59.
- **Summaries.** Read, Edit, Write, MultiEdit, NotebookEdit → `<Tool> <path>`. Grep, Glob → `<Tool>`, plus ` in <path>`. Task, Agent → `<Tool>: <subagent_type>`; Skill → `Skill: <skill>` (when it matches `^[\w:.-]{1,40}$`, else the tool name). WebFetch → `WebFetch <hostname>` (only `^[a-z0-9.-]+$`). SubagentHandback → `Hand-back`. Anything else → its name.
- **Shell** (Bash, PowerShell): `<Tool>: ` plus up to 3 segments joined by ` · ` (then ` …`). The command splits on `&&`, `||`, `;`, `|`, and newlines; tokens holding `=` are skipped; the program is the first token's base name without `.exe`, shown only when it's a known program (else `command`). Only programs that take subcommands show one: the first of that program's own subcommands among the next four tokens. Those programs are the package managers (pnpm, npm, yarn, bun), deno, cargo, go, git, gh, agent-browser, vitest, vite, and corepack, each with its own fixed list in `SUBCOMMANDS`. So `pnpm --filter x test` → `pnpm test`, `git -C test status` → `git status`, and `echo test`, `grep -r test src`, `ls test`, `cat test.md` → just the program. Why: a word after `echo` or `grep` is an argument, not a subcommand.
- **Runners and scripts.** After a package manager's `exec` or `dlx`, and after `npx` or `bunx`, the first token that isn't a flag is the program it runs; its base name shows when it's a known program (`pnpm exec vitest`, `npx jest`, `npx tsc`), else nothing more (`npx cowsay test` → `npx`). After a package manager's `run`, the first token that isn't a flag shows when it's one of the fixed script names (`test`, `build`, `dev`, `verify`, `typecheck`, `lint`, `start`, `vitest`): `npm run test`. Quoted arguments, and any word not on these fixed lists, never show.
- **Tests.** A test run is a shell event with a segment that runs `vitest` or `jest` (as the program, or after `exec`, `dlx`, `npx`, or `bunx`), or whose subcommand is `test`, `verify`, or `vitest` on a package manager, deno, cargo, or go, or whose script after `run` is one of those. Why: counting the test runner after `exec` or `npx` is the safest reading of test progress; git, gh, and every other program never run tests. `runs`, `failedRuns`, and `last` count finished runs only (those with a result). `testFiles` counts distinct edited paths (Write, Edit, MultiEdit) matching `.test.` or `.spec.` before a JS or TS extension, or under `__tests__/`. `testFirst` is absent with no test-file edit; else `true` unless a code file (not a test file, not `.md`, `.json`, `.yaml`, `.yml`, `.lock`) was edited first.

## Watch out

- Of the fixtures, only chess-web's `ladder.md` keeps its `### ` slice sections. Other fixture sprint docs read with no `model` and `filesOwned: []`.

- The ported `parseSprint` reads `Slug:` with `[\w-]+`, which takes `_`. A header that ends right after the slug (`· Slug: ladder_`) reads as `ladder_`. Real docs always have `· Status:` after it, so it hasn't bitten yet.
- `parsePlan` defaults a missing plan status to `active` and a missing sprint-row status to `planned`.
- A program not in `SUBCOMMANDS` never shows a subcommand and never counts as a test run. Add a program there (with its own list) before expecting its runs to count; a new word on any list must be safe to show.
- Scripts with other names don't count as test runs: `pnpm run test:unit` reads as `pnpm run`, and `npm run my-tests` too. A runner given a flag with a separate value (`npx -p pkg vitest`) reads `pkg` as the program, so it isn't counted. `node node_modules/vitest/vitest.mjs` reads as `node`.
- Tests under `packages/model/src/` must build `RepoFiles` and transcripts inline (the no-I/O test scans that folder). Tests that read fixtures go in `packages/model/test/fixtures.test.ts`.

## History

- 2026-10-18 — added in sprint bootstrap-model (slice R1).
- 2026-10-18 — sprint server-runs (slice M1): board types, transcript parser and `agentState`, per-slice `model`, `filesOwned`, `oneWayDoor`, and no `currentWave` on a done sprint.
- 2026-10-19 — sprint board-engineer (slice T1): tool timeline parser and test progress.
- 2026-10-19 — sprint board-engineer (wave 1 fix): subcommands only after programs that take them, so `echo test` and `grep … test` aren't test runs; test runners after `exec`, `dlx`, `npx`, `bunx`, and test scripts after `run`, count.

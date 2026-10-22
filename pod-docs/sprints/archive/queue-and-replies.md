# Sprint: Answer the queue, and copy the reply pod waits for

_From plan: pod-docs/plans/board-actions.md · Slug: queue-and-replies · Status: done · Generated: 2026-10-21_


## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | A1 | Queue answers: model fields, the safe queue write, the answer route, the wider action log | queue-and-replies-A1 | #29 | merged | medium | — |
| 1 | R1 | Replies: which reply pod waits for, the chat to paste it in, and copy-the-reply | queue-and-replies-R1 | #29 | merged | medium | — |
| 2 | U2 | Waiting on you: the needs-you list and the answer form in place | queue-and-replies-U2 | #30 | merged | medium | A1, R1 |

## Shared contract

Times are epoch ms. The merge-actions contract (token, action guard, `postAction`, merge routes, action log, Look classes) stands unless changed here. The answer format follows [decisions.md 2026-10-21 "build queue answers before pod reads them"](../decisions.md#2026-10-21--build-queue-answers-before-pod-reads-them): if claude-pod settles on another format, the writer follows it.

**Queue items** (A1, `packages/model/src/run-model.ts`, helpers in `packages/model/src/queue-answer.ts` re-exported from `run-model.ts`, so `index.ts` stays R1's). `QueueItem` gains:
- `line: string` — the entry's whole line as `parseQueue` reads it (trimmed). It is the entry's identity for writes.
- `date?: string` — the header's first part (`2026-10-21`).
- `answer?: string` — the text after the first `**Answer (human):**` on the line, trimmed, up to a `**Resolution:**` if one follows. `body` never holds the answer: text from `**Answer (human):**` on is cut from it too.
- `parseQueue` (the pod-flow copy) stays unchanged. The line list must match its count and order exactly (same line regex).

**Answer format.** The board appends ` **Answer (human):** <text>` at the **end of the entry's own line**, after `**Resolution:** …`. Why: the queue's rule is one line per entry; a new line wouldn't be part of the entry, and at the end `parseQueue`'s `body`, `isPending`, `latestHalt`, and the hand-back join read exactly as before.

**Answerable** (`isAnswerable(item)`): `isPending`, `needsYou`, type `PENDING` or `BLOCKED`, and no `answer`. `NOTE` and `SOLVED` never. An answer changes nothing else: the entry keeps `needsYou`, the run keeps `needs-you`, and an orchestrator `BLOCKED` keeps `isHalted`, because pod still waits until it reads the line (and resolves the entry itself).

**Answer text** (`cleanAnswer(text) → { ok: true; text } | { ok: false; error }`, used by the route and the form):
- Every run of whitespace (line breaks and tabs included) becomes one space; then trim. Other control characters (U+0000–U+001F, U+007F) are removed.
- Empty → `Write an answer first.` Over 2000 characters (after cleaning) → `Keep the answer under 2000 characters.` Holding `**Resolution:**` or `**Answer (` (any case) → `The answer can't contain **Resolution:** or **Answer (…):**.`

**Answer route** (A1, `POST /api/actions/answer` behind the action guard) `{ repoId: string, line: string, text: string }` → checks in order, nothing written or logged until step 4:
1. Shape wrong → `400 { error: 'bad request' }`; `cleanAnswer` fails → `400 { error: <its error> }`.
2. `repoId` not on the current Board, or no item on that repo's `model.queue` whose `line` equals `line` and `isAnswerable` → `404 { error: 'not waiting on you' }`. Any Board repo counts, registered or claim-only.
3. An answer already writing for that repo → `409 { error: 'answer in progress' }`.
4. Then `200 AnswerResult`, logged:
   - The file is exactly `path.join(repo.path, 'pod-docs/handoff-queue.md')`. Its realpath must sit under the repo's realpath, else `failed`, `queue file is outside the repo`. A missing file → `changed`. Never created.
   - Re-read the file. Exactly one line whose trim equals `line` → write. None → `changed`, `The entry changed since you looked.` Several → `changed`, `Two entries read the same. Answer it in the chat.`
   - The write changes only that line. It keeps the line's leading whitespace, the file's line endings (CRLF or LF, per line), a BOM, and whether it ends with a newline. Write a temp file in the same folder, re-read the queue, and if it changed since step 4's read → `changed`, temp removed. Else rename over it (retry up to 3 times over ~300 ms on `EPERM`/`EBUSY`). Still failing → `failed`, `Couldn't write the queue (<code>).`, temp removed, queue untouched.
   - After every logged request, rebuild the Board before the response.

```ts
type AnswerOutcome = 'answered' | 'changed' | 'failed'
type AnswerResult = { outcome: AnswerOutcome; message?: string; logged: boolean }
type ActionEntry = { at: number; repoId: string; repo: string; target: string; message?: string }
  & ({ action: 'merge'; result: MergeOutcome } | { action: 'answer'; result: AnswerOutcome })
```
Answer log entries: `target` is `<date> · <TYPE> · <from → to>` from the header; never the answer text or the body. The log file and its reader accept both actions; old merge lines still read. Result chips: answered → ok, changed → you, failed → bad.

**Replies** (R1, `packages/model/src/replies.ts`, exported from `index.ts`). The next sprint's Continue toggle and buttons build on these.
```ts
type ReplyWord = 'continue' | 'go' | 'try'
type ReplySignal = 'wave-waiting' | 'wave-merged' | 'sprint-done' | 'final-waiting' | 'final-merged' | 'fix-waiting' | 'fix-merged' | 'not-started'
type RunReply = { reply: ReplyWord; signal: ReplySignal; why: string; pr?: number }
runReplies(repo: BoardRepo, run: string, now: number): RunReply[]   // run: a plan slug or `fix-<slug>`
type ReplySession = { id: string; startedAt?: number; repoPath: string; resume?: string }
replySession(repo: BoardRepo, run: string, now: number): ReplySession | undefined
```
- **Plan run.** Not listed (`isRun` false), halted, or any plan agent running → `[]`. Else the first that applies:
  1. `final-waiting`: a pending hand-back PR N → `continue` (`Merge PR #N, then reply continue.`) and `try` (`Starts the app so you can try it.`).
  2. `final-merged`: the hand-back's PR is merged in `prs` and its entry still pending → `continue` (`PR #N merged: pod cleans up.`).
  3. `wave-waiting`: a current-sprint wave with `waveWaitingPr` N → `continue` (`Merge PR #N, then reply continue.`).
  4. `wave-merged`: a current-sprint wave, not blocked or done, every unfinished slice `pushed`, and an unfinished slice's PR that `gh` reports `merged` → `continue` (`PR #N merged.`). Unknown gh state is not merged.
  5. `sprint-done`: the current sprint has no doc and an earlier sprint is `done` → `continue` (`Sprint <slug> is done.`).
  6. `not-started`: the plan isn't archived, has at least one sprint, and every sprint is `planned` with no doc → `go` (`Only if pod asked for go.`). Never inferred from transcripts.
- **Fix run.** `fixWaitingPr` N → `fix-waiting` `continue` (`Merge PR #N, then reply continue.`). Its PR merged while the run is listed → `fix-merged` `continue` (`PR #N merged.`). A running agent of the run → `[]`.
- At most one entry per word. `pr` is set when the `why` names one.
- **Waiting only for `continue`** (plan Open question 2): only `wave-merged`, `sprint-done`, `final-merged`, and `fix-merged`. The `*-waiting` signals need your merge first, and `not-started` is never a send signal.
- **Session.** From the run's agents (plan: `isPlanAgent`; fix: the run's engineers and reviewers), the one with the newest `lastAt` (ties: newest `startedAt`, then id); agents with no `lastAt` don't count. `id` is its `session`. `startedAt` is the earliest `startedAt` of any repo agent in that session (the main chat is never read). `resume` is `claude --resume <id>` only when `id` matches `^[A-Za-z0-9-]{1,64}$`. No agent → `undefined`.
- Copying a reply is not an action: no request, nothing logged.

**Look.** No slice edits `packages/web/src/theme/`: `.inplace`, `textarea.input`, `.btn.quiet`, `.btn.primary`, and chips already cover these screens. Screen CSS uses tokens only, and follows the plan's `## Look`.

**Queue.** No `BLOCKED` pending. The closed hand-back PR entry (engineer → human, slice P1) stays on the value in use: a closed hand-back PR still counts as waiting. The other pending entries are someday or pod-side, so none is work here.

## Per-slice detail

### A1: Queue answers: model fields, the safe queue write, the answer route, the wider action log
- **Scope:** Build the contract's Queue items, Answer format, Answerable, Answer text, Answer route, and the action log widening.
  - `queue-answer.ts` (pure, model): `queueLines(md)`, `splitAnswer(rest)`, `isAnswerable(item)`, `cleanAnswer(text)`, `withAnswer(line, text) → string`. `run-model.ts` fills the new `QueueItem` fields and re-exports these.
  - `queue-writer.ts` (server): `writeAnswer({ repoPath, line, text }, fs?) → Promise<{ outcome, message? }>`, the file steps of route step 4. Its file operations (`realpath`, `readFile`, `writeFile`, `rename`, `unlink`) are an injectable dep with Node defaults, like `GhExec`, so the symlink and `EPERM` tests run through a fake on every CI OS (Windows CI can't make symlinks or hold a file open).
  - `answer-routes.ts`: `createAnswerRoutes(deps) → Hono`, with the merge routes' deps shape (`board`, `rebuild`, `log`). `main.ts` mounts it beside the merge routes under the one `actions` Hono.
  - Widen `ActionEntry` in `actions.ts`, `action-log.ts`'s reader, and `action-log-view.ts`'s chips together, so every package still typechecks.
  - Tests use temp folders only. Docs: add the route to `actions.md` and `server.md`. In `codebase-structure.md`, say the server now writes one file in a repo, and add a smoke line: on a fixture copy, take an entry's `line` from `/api/board`, POST an answer, then `grep "Answer (human)"` in the copy's queue. A repeat gives `404`, and no token gives `403`.
- **Files owned:** `packages/server/src/action-routes.test.ts` (added at wave 1, gate 1 exception), `packages/model/src/queue-answer.ts` (new), `packages/model/src/queue-answer.test.ts` (new), `packages/model/src/run-model.ts`, `packages/model/src/run-model.test.ts`, `packages/model/src/actions.ts`, `packages/model/test/fixtures.test.ts`, `packages/server/src/queue-writer.ts` (new), `packages/server/src/queue-writer.test.ts` (new), `packages/server/src/answer-routes.ts` (new), `packages/server/src/answer-routes.test.ts` (new), `packages/server/src/action-log.ts`, `packages/server/src/action-log.test.ts`, `packages/server/src/action-routes.ts`, `packages/server/src/main.ts`, `packages/web/src/screens/runs/action-log-view.ts`, `packages/web/src/screens/runs/action-log-view.test.ts`, `pod-docs/feature-details/actions.md`, `pod-docs/feature-details/server.md`, `pod-docs/feature-details/run-model.md`, `pod-docs/codebase-structure.md`
- **Success criteria:**
  - `[test] each item carries its trimmed line and date; the line list matches parseQueue's count and order on odd input — packages/model/src/queue-answer.test.ts › lines match parseQueue`
  - `[test] an answer at the line's end, or before Resolution, fills answer and stays out of body; no answer → undefined — packages/model/src/queue-answer.test.ts › reads the answer apart from the body`
  - `[test] withAnswer appends at the line's end; parseQueue gives the same body and isPending before and after, and latestHalt the same halt — packages/model/src/queue-answer.test.ts › the answer leaves the entry's reading unchanged`
  - `[test] answerable only when pending, needsYou, PENDING or BLOCKED, and unanswered; NOTE, SOLVED, resolved, and answered entries aren't — packages/model/src/queue-answer.test.ts › which entries can be answered`
  - `[test] whitespace and line breaks collapse to one space; control characters drop; empty, 2001 characters, and **Resolution:** or **Answer ( give their errors; exactly 2000 passes — packages/model/src/queue-answer.test.ts › cleans the answer text`
  - `[test] an answered entry keeps needsYou, its run reads needs-you, and an answered orchestrator BLOCKED keeps the plan halted — packages/model/src/run-model.test.ts › an answer doesn't clear what waits on you`
  - `[test] fixture queues still read the same bodies, and each item's line is a line of the file — packages/model/test/fixtures.test.ts › fixture queue items keep their lines`
  - `[test] the write changes only the target line; a CRLF file, a BOM, and a file with no final newline keep their bytes elsewhere — packages/server/src/queue-writer.test.ts › writes one line and keeps the rest byte for byte`
  - `[test] no matching line, or two equal lines → changed, file untouched; a missing file → changed and not created — packages/server/src/queue-writer.test.ts › refuses a changed entry`
  - `[test] a queue edit between the read and the rename → changed, temp gone — packages/server/src/queue-writer.test.ts › a write during the answer wins`
  - `[test] rename failing with EPERM retries, then failed with the code; no temp file left and the queue unchanged — packages/server/src/queue-writer.test.ts › a failed rename leaves nothing behind`
  - `[test] a queue file whose realpath (from the fake) is outside the repo → failed, and nothing is written — packages/server/src/queue-writer.test.ts › stays inside the repo`
  - `[test] bad shape → 400 bad request; a bad text → 400 with its error; nothing logged — packages/server/src/answer-routes.test.ts › validates the answer`
  - `[test] repo not on the Board, a line not on its queue, and a line not answerable → 404; a claim-only repo is answered — packages/server/src/answer-routes.test.ts › answers only entries waiting on you`
  - `[test] a second answer for the same repo while one writes → 409; another repo writes at once — packages/server/src/answer-routes.test.ts › one answer per repo at a time`
  - `[test] answered, changed, and failed each log one entry with the header target and no answer text; the Board is rebuilt before the response; a failed append gives logged false — packages/server/src/answer-routes.test.ts › every answer is logged`
  - `[test] without a token the answer route → 403 bad token — packages/server/src/answer-routes.test.ts › answer needs the token`
  - `[test] the reader keeps answer entries and old merge lines, and skips an unknown action or result — packages/server/src/action-log.test.ts › reads and appends the log`
  - `[test] answer rows get their chip: answered ok, changed you, failed bad; merge chips unchanged — packages/web/src/screens/runs/action-log-view.test.ts › action log rows`
- **Depends on:** —
- **One-way door:** none. This is the first write into a repo, but it only appends text to one existing line of a git-tracked file, and `git checkout pod-docs/handoff-queue.md` undoes it. The plan made this write a Key decision. Tests and smoke runs write only to temp copies.
- **Model:** opus

### R1: Replies: which reply pod waits for, the chat to paste it in, and copy-the-reply
- **Scope:** Build the contract's Replies in `replies.ts`, and export it from `index.ts`. Export the fix run's agent list from `fix-runs.ts` (`fixRunAgents(repo, name, now)`) without changing its rules.
  - On screen 1, for the selected plan or fix run, show a Reply panel under the bar, above the pipeline, when `runReplies` gives anything. For each reply, show the word in mono, its `why`, and a quiet `Copy` button. Then the chat to paste it in: `Session <id>`, `first agent HH:MM`, and the repo path, with `cd "<repo path>"` and `resume` each copyable. With no session: `No pod session found for this run. Paste it in the chat that runs it.` Without `resume`, show only the session id. Nothing shows for a repo row.
  - `reply-view.ts` (pure): the panel's rows and words. `copy.ts`: `copyText(text, deps?) → Promise<'copied' | 'failed'>` with the clipboard injected. `copied` shows `Copied` for 2 s. `failed` shows the text selected with `Copy failed. Press Ctrl+C.`
  - Use only the tokens and follow the plan's `## Look`. Document the rule in `queue-and-replies.md` and the panel in `runs-and-pipeline.md`.
- **Files owned:** `packages/model/src/replies.ts` (new), `packages/model/src/replies.test.ts` (new), `packages/model/src/fix-runs.ts`, `packages/model/src/fix-runs.test.ts`, `packages/model/src/index.ts`, `packages/web/src/copy.ts` (new), `packages/web/src/copy.test.ts` (new), `packages/web/src/screens/runs/reply-view.ts` (new), `packages/web/src/screens/runs/reply-view.test.ts` (new), `packages/web/src/screens/runs/ReplyPanel.tsx` (new), `packages/web/src/screens/runs/RunsScreen.tsx`, `packages/web/src/screens/runs/runs.css`, `pod-docs/feature-details/queue-and-replies.md` (new), `pod-docs/feature-details/runs-and-pipeline.md`
- **Success criteria:**
  - `[test] a pending hand-back gives continue and try with its PR; once merged and still pending, continue only — packages/model/src/replies.test.ts › final PR replies`
  - `[test] a wave PR waiting on you gives continue with Merge PR #N; gh merged gives PR #N merged; gh unknown is still waiting, not merged — packages/model/src/replies.test.ts › wave replies follow gh`
  - `[test] a current sprint with no doc after a done sprint gives continue; a current sprint with a doc and no handed-back wave gives nothing — packages/model/src/replies.test.ts › sprint done asks to continue`
  - `[test] every sprint planned with no doc gives go; one sprint with a doc, an archived plan, or a plan with no sprints doesn't — packages/model/src/replies.test.ts › go only on a plan not started`
  - `[test] a halted plan, a running plan agent (engineer, planner, or reviewer), and an unlisted plan give no reply — packages/model/src/replies.test.ts › no reply while pod works or is halted`
  - `[test] go is never given with a pending hand-back, a handed-back wave, or a done sprint, and never more than one entry per word — packages/model/src/replies.test.ts › go never comes from another signal`
  - `[test] a reviewed open fix PR, then its merge, give continue; a running fix agent gives nothing — packages/model/src/replies.test.ts › fix run replies`
  - `[test] the session is the newest-writing run agent's; startedAt is the session's earliest agent start; an id outside the pattern gets no resume; no agents → undefined — packages/model/src/replies.test.ts › finds the chat to paste in`
  - `[test] fixRunAgents lists the run's engineers and reviewers, as the pipeline uses them — packages/model/src/fix-runs.test.ts › fix run agents`
  - `[test] rows show the word, why, session line with time, cd and resume lines; the no-session text; nothing for a repo row — packages/web/src/screens/runs/reply-view.test.ts › reply panel rows`
  - `[test] copyText writes the exact text; a missing or throwing clipboard gives failed; it never calls fetch — packages/web/src/copy.test.ts › copies the reply`
  - `[manual] the Reply panel sits under the bar as a quiet panel, the word in mono, Copy as a quiet button, both themes — a fixture copy with a handed-back wave at 1280 px`
  - `[manual] at 375 px the panel stacks, buttons are at least 44 px tall, long session ids and paths wrap, and nothing scrolls sideways — same run at 375 px`
  - `[manual] Copy puts the exact text on the clipboard (paste it into a text field) and shows Copied — same run`
  - `[manual] the Merge button and confirm still open and cancel; Add repo still saves, shows "Already registered." on a repeat, and clears on Escape — screen 1`
- **Depends on:** —
- **One-way door:** none
- **Model:** opus

### U2: Waiting on you: the needs-you list and the answer form in place
- **Scope:** On screen 1, a `Waiting on you` list under the pipeline (or the fix pipeline, or a repo row's message), above Other activity. It holds the repo's `needsYou` entries: the selected plan's `queue` first, then the repo's entries that join no plan. Other plans' entries show under their own run.
  - Each row shows a type chip (BLOCKED bad, PENDING you, NOTE idle), the date, the route, and the body as plain text.
  - An answerable row has a quiet `Answer` button. It opens the form in place (`.inplace`) right under that row, with a `textarea.input`, a primary `Save answer`, a quiet Cancel, and the note `ANSWER_NOTE`: `pod reads board answers only once its pod plugin supports them. Until then, also give the answer in the chat.`
  - An answered row shows `Your answer: <answer>` and `Waiting for pod to read it.`
  - `answer-flow.ts`, a pure reducer and driver like `merge-flow.ts`: idle → editing → saving → result, or → error. Cancel and Escape close it, except while saving. One form is open at a time. While saving, Save is off, and a repeat press sends nothing. `cleanAnswer` errors show at once, and nothing is sent. Save sends `{ repoId, line, text }` with the row's `line`.
  - Result words: answered → `Saved to the queue.` with the note. changed → the server's message; the form stays open with the typed text. failed → the server's message, with the text kept. `logged: false` adds `Not saved to the action log.` Client errors show `postAction`'s message.
  - Use A1's model exports and S1's `postAction`. Use only the tokens and follow the plan's `## Look`. Add the list and form to `runs-and-pipeline.md`.
- **Files owned:** `packages/web/src/screens/runs/queue-view.ts` (new), `packages/web/src/screens/runs/queue-view.test.ts` (new), `packages/web/src/screens/runs/answer-flow.ts` (new), `packages/web/src/screens/runs/answer-flow.test.ts` (new), `packages/web/src/screens/runs/WaitingOnYou.tsx` (new), `packages/web/src/screens/runs/RunsScreen.tsx`, `packages/web/src/screens/runs/runs.css`, `pod-docs/feature-details/runs-and-pipeline.md`
- **Success criteria:**
  - `[test] the list holds the plan's needsYou entries, then the repo's unjoined ones; another plan's, resolved, and SOLVED entries are left out — packages/web/src/screens/runs/queue-view.test.ts › which entries wait on you`
  - `[test] chips per type; Answer only on answerable rows; an answered row shows its answer and the waiting text — packages/web/src/screens/runs/queue-view.test.ts › rows and their answer state`
  - `[test] the form's note is exactly ANSWER_NOTE and names that pod reads board answers only once its pod plugin supports them — packages/web/src/screens/runs/queue-view.test.ts › the form says pod may not read it yet`
  - `[test] open → editing; Cancel and Escape → idle; opening another row closes the first; Escape does nothing while saving — packages/web/src/screens/runs/answer-flow.test.ts › opens and cancels in place`
  - `[test] Save sends { repoId, line, text } once; a repeat press while saving sends nothing — packages/web/src/screens/runs/answer-flow.test.ts › saves the entry you saw, once`
  - `[test] an empty or too-long answer shows its error and sends nothing — packages/web/src/screens/runs/answer-flow.test.ts › checks the text before sending`
  - `[test] answered, changed, and failed give their words; changed and failed keep the typed text; logged false adds the note — packages/web/src/screens/runs/answer-flow.test.ts › shows the result`
  - `[test] client errors (reload, restarted, can't reach) show their message and keep the text — packages/web/src/screens/runs/answer-flow.test.ts › client errors are shown`
  - `[manual] the form opens right under its entry, not in a modal, in both themes; after Save the row shows the answer and the action log a new answered row — a fixture copy at 1280 px`
  - `[manual] at 375 px the list and form stack, the textarea is full width, buttons are at least 44 px tall, and nothing scrolls sideways — same copy at 375 px`
  - `[manual] after answering, only the queue file's one line changed in the copy (diff it against the fixture) — same copy`
  - `[manual] the Reply panel still copies, the Merge confirm still opens and cancels, and Add repo still saves, shows "Already registered.", and clears on Escape — screen 1`
- **Depends on:** A1, R1
- **One-way door:** none. Saving writes only through A1's route.
- **Model:** opus

## Sprint summary

- **Synced with merge-target:** up to date (`origin/pod-staging` had no new commits at the start of the sprint)
- **Slices shipped:** A1, R1 (wave 1, PR #29), U2 (wave 2, PR #30)
- **Queue entries:** resolved 1 (the gate-1 BLOCKED for the pod-side answer format: human chose to build the board side first), deferred 2 ([handoff-queue.md](../../handoff-queue.md): the closed hand-back PR question from merge-actions P1, and unlisted plans' entries from U2)
- **Slice log:**
  - A1: opus · medium · test-first yes · runtime answer route on a chess-web fixture copy (one-line diff, repeat 404, log after restart) · 8 NOTEs · time lost ~2 min (agent-browser hang). BLOCKED once on a one-line type change in `action-routes.test.ts`; gate 1 exception added it and the same engineer finished
  - R1: opus · medium · test-first yes · runtime reply logic on live `/api/board` through tsx; panel not opened (agent-browser hung twice) · 7 NOTEs · time lost ~3 min
  - U2: opus · medium · test-first yes · runtime `waitingRows` and the answer route on a fixture copy; UI not opened (agent-browser hung twice) · 6 NOTEs + 1 PENDING · time lost ~4 min
  - Wave 1 fix (`queue-and-replies-w1-fix`): opus · medium · CI failed on macOS and Windows in `queue-writer.test.ts › stays inside the repo` (test built paths from an unresolved temp folder); test-only fix, red reproduced behind a junction
  - Orchestrator wave checks: wave 1 on R1's fixture (Reply panel, Copy → `Copied`, 375 px; answer route one-line diff, repeat 404, Action log); wave 2 on the same fixture (answer form in the browser end to end, 375 px, Escape)
  - Stalls: none. A1 left background work after its report; stopped
- **Agent context at hand-back:** 601,475 tokens — *each agent's final context size, not tokens billed*

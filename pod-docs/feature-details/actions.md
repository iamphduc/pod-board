# Actions

## What it is

Board actions change something outside the board. The first one merges a PR that is waiting on you (a handed-back wave PR, a reviewed fix PR, or the final plan PR) with `gh pr merge`, and every merge request goes in the action log. The server side is `packages/server/src/action-routes.ts`, `gh-actions.ts`, and `action-log.ts`. The routes sit behind the action guard (see [server.md](server.md)). The page's confirm step is U1's (screen 1).

## How it works

- **Routes.** `POST /api/actions/merge-preview` `{ repoId, number }` and `POST /api/actions/merge` `{ repoId, number, headSha }`. The repo comes from the current Board by `repoId`. A path in the body is ignored. The PR must be in the model's `waitingPrs(repo, now)`.
- **Checks, in order.** Merge: `number` must be a positive integer and `headSha` 40 lowercase hex, else `400 bad request`. Preview: a string `repoId` and a positive integer `number`, else `400`. Then, for both routes: repo not on the Board or PR not waiting → `404 not waiting on you`. Then gh status not `ok` → `503 gh unavailable`. `unknown` (before the first `gh auth status`) counts as not ok. Then, for merge only: a merge already running for the same repo and PR → `409 merge in progress`. The slot is taken before the first gh read and freed when the request ends, failure included. No gh command runs before these checks pass.
- **The read.** `gh pr view <n> --json number,state,url,title,headRefOid,mergeable,mergeStateStatus,statusCheckRollup,autoMergeRequest`. The preview maps `headRefOid` → `headSha`, `mergeable` (`MERGEABLE`, `CONFLICTING`, anything else → `unknown`), `mergeStateStatus` → `mergeState`, and the checks rollup (the same rule as the Board's `checks`). It is not usable when gh fails, the JSON is bad, the state is unknown, `headRefOid` isn't a 40-char sha, or `url` isn't exactly `https://github.com/<owner>/<name>/pull/<number>` for this number. The preview answers `502` with gh's stderr, or `gh failed`.
- **The merge.** First a fresh read. If it fails, the result is `failed` with its text, and no merge runs. If its head isn't `headSha`, the result is `stale` with the current `headSha`, and no merge runs. Otherwise the server runs exactly `gh pr merge <url> --merge --match-head-commit <headSha>`. The `<url>` comes from that fresh read. The call has a 60 s timeout, and it never passes `--admin`, `--auto`, `--squash`, `--rebase`, or `--delete-branch`. Then the server always reads the PR again:
  - `MERGED` → `merged`.
  - Open with `autoMergeRequest` set → `auto-merge`.
  - Open, no auto-merge, and the call succeeded → `queued`. See **Why** for the reason.
  - Else, if the call failed (timeout included) → `failed` with gh's stderr: escape codes removed, trimmed, and at most 500 chars. An empty stderr reads `gh pr merge failed`.
  - `CLOSED` → `failed`, `PR is closed`.
  - The re-read failed after a successful call → `unconfirmed`, with a message to check GitHub.
- **After the merge call.** Once the merge call has run, the server drops the PR's gh cache entries (`GhCache.forget`: the entry by number, and any branch entry holding that number) and asks gh again. This happens before the response.
- **Action log.** One `ActionEntry` per merge request that passed the checks above: `stale` and `failed` too, but not `400`, `404`, `503`, `409`, or previews. `target` is `PR #N`, `repo` is the repo's name, and a stale entry's message is `head now <sha7>`. Each entry is one JSON line appended to `<config dir>/actions.jsonl` (the folder of `config.json`), owner-only on POSIX. The file appears with the first merge. At start the server reads the newest 50 good lines. It skips bad lines, and a missing or unreadable file gives an empty list. If the last line was cut short, the next entry starts on a new line. If the append fails, the response is the same except `logged: false`, and the entry isn't listed.
- **The Board.** `Board.actions` is the log's newest 50, newest first, read on every build. After every logged merge request, the server rebuilds the Board and sends it before the response, so it shows the new entry and the PR's fresh state.

## Why it's this way

- **`queued` for an open PR after a successful call.** gh 2.92's `pr view --json` has no merge-queue field (the fields include `autoMergeRequest`, `mergeable`, `mergeStateStatus`, and `headRefOid`, but nothing for a queue). Without a queue, a successful `gh pr merge --merge` merges at once, so an open PR after a successful call most likely went into a merge queue. The cost: if GitHub's re-read lags a plain merge, the result reads `Added to the merge queue` until the Board's next gh read shows `merged`.
- **`merged` only from the re-read.** gh's exit code doesn't say what happened. A timeout can still merge, and a success can mean queued. The re-read is the only proof.
- **`--match-head-commit`.** It refuses the merge if anything was pushed after you looked. That includes autopilot racing you on a wave PR.
- **No merge on a failed fresh read.** Without a read, the server can't check the head or the url, so it doesn't merge.
- **The url from the fresh read, checked.** The url passed to `gh pr merge` must be a GitHub pull url for that number, so a different host or PR is never passed.

## Watch out

- The real gh field names were taken from `gh pr view --json` (no fields), gh 2.92.0. A gh that adds a merge-queue field should be read for `queued` instead of the fallback.
- Tests and smoke runs never merge a real PR: tests use a fake gh exec, and the smoke recipe only checks the `404` and `403` previews.
- `actions.jsonl` is in the config folder, which the watcher watches. The config folder's filter keeps only `config.json`, so an append doesn't trigger a rebuild. The route rebuilds the Board itself.
- The whole log file is read once at start. It is never trimmed, so it grows by one line per merge.

## History

- 2026-10-21 · merge-actions M1: merge-preview and merge routes, gh merge with a re-read, and the action log on the Board.

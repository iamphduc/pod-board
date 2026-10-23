# Research: Pod Board phase 2 actions (localhost security, npx packaging, gh pr merge)

_Generated: 2026-10-21 · Depth: shallow · Researchers: 1 · Searches: 5 · Pages read: 7_

**Assumptions:** Shallow check. Question 2 (packaging) is thinly sourced: no tsup/Vite-specific page was fetched, so those parts are `no evidence found`.

## What exists
| Name | Link | What it does | Alive? | License | How close |
|------|------|--------------|--------|---------|-----------|
| Chrome Local Network Access (LNA) | [Chrome blog](https://developer.chrome.com/blog/local-network-access) | Permission prompt for public-site requests to local/loopback | Prompt launches in Chrome 142 | n/a | Context for browser threat |
| dynoxide advisory (CVE-2026-42559) | [RustSec](https://rustsec.org/advisories/RUSTSEC-2026-0140) | Localhost server with write tools: Host check was not enough | Fixed in 0.9.13 | n/a | Same shape as the plan |
| npm `bin` docs | [npm docs](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bin) | Rules for `bin`, shebang, `files`, Windows | Current (v11) | n/a | Packaging basics |
| `gh pr merge` manual | [man page](https://man.archlinux.org/man/gh-pr-merge.1.en) | Merge queue, `--auto`, `--admin`, `--match-head-commit` | Current | n/a | The action to run |

## Gaps and angles
- **Q1: Host check alone is not enough.** A `no-cors` cross-site request still carries the loopback Host header, so it passes. The fix was to validate both Host and Origin. The plan names Host and a token; add an Origin check. The token likely covers this, but Origin is a cheap second layer. — [RustSec](https://rustsec.org/advisories/RUSTSEC-2026-0140)
- **Q1: LNA does not break your own page.** LNA covers requests from the public network to local/loopback. A page served by the localhost server calling the same server is outside that scope. The page says future versions will extend to local-to-local. It also helps you: other sites now get a prompt. WebSockets were not gated yet. Do not rely on LNA as a defense; it is a prompt, and older or other browsers lack it. — [Chrome blog](https://developer.chrome.com/blog/local-network-access)
- **Q3: Merge queue.** If the branch requires a merge queue, no strategy flag is needed. If checks have not passed, auto-merge is enabled. If they passed, the PR joins the queue. `--admin` bypasses the queue. So `gh pr merge --merge` may not merge right away, and the UI should not say "merged". — [man page](https://man.archlinux.org/man/gh-pr-merge.1.en)
- **Q3: Known bug (2026).** With a merge queue set by ruleset and "Allow auto-merge" off, gh 2.92.0 fails with "Auto merge is not allowed for this repository". Reported in gh issue #13398 (May 2026); Cursor staff said in Sept 2026 the fallback still fails for blocked PRs. Fix status in gh unconfirmed. — [Cursor forum](https://forum.cursor.com/t/auto-merge-failure-for-repositories-with-merge-queues/163624)
- **Q3: Strategy.** `--merge` is an explicit flag ("Merge the commits with the base branch"), so repo defaults do not change the result. A repo that disallows merge commits will make it fail; no source fetched on that. — [man page](https://man.archlinux.org/man/gh-pr-merge.1.en)
- **Q2:** no evidence found for tsup/esbuild bundling, Vite asset lookup at runtime, opening the browser, or Windows path quirks.

## Best practices
- Validate Host and Origin, and fail closed — [RustSec](https://rustsec.org/advisories/RUSTSEC-2026-0140)
- Use `--match-head-commit <sha>` so the confirm step merges exactly what the user saw — [man page](https://man.archlinux.org/man/gh-pr-merge.1.en)
- `bin` file must start with `#!/usr/bin/env node`; on Windows npm makes a `.cmd` shim, so the shebang is not used there but is still needed for macOS/Linux. `bin` files are always packed even if `files` is set; use `files` to include the web build dir. — [npm docs](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bin)

## Ideas to consider
- Add an Origin check next to Host; reject missing Origin on POST. — grows from the dynoxide advisory
- Require a custom header plus JSON content type on actions, so simple cross-site forms fail. — (own idea)
- Show "queued" or "auto-merge enabled" as separate states after the merge call, not "merged". — grows from the merge queue gap
- Re-read the PR state with `gh pr view` after merging and show the real result. — (own idea)
- Limit the append action to one allowlisted Markdown path, resolved and checked against the repo root. — (own idea)
- Smoke-test the packed tarball (`npm pack`, then `npx` from it) on Windows in CI. — (own idea)

## Questions for the plan
- Is the token sent in a header (not a cookie or query string)? — why it matters: a cookie can be sent cross-site — options: header only / header plus Origin check
- What should happen when the repo uses a merge queue or disallows merge commits? — why it matters: queue handling and the 2026 auto-merge bug — options: show gh's error / retry with queue-aware flow / disable button
- Should the confirm step pin the head SHA? — why it matters: PR can change between view and click — options: use `--match-head-commit` / skip
- Do you accept that LNA gives no protection to the same-origin page and is not a defense? — options: yes, rely on token / add extra layer
- Which bundler and how does the server find the web assets after bundling? — why it matters: no evidence found, needs a spike — options: tsup / esbuild / ship unbundled with `files`

## Sources
- Local Network Access — https://developer.chrome.com/blog/local-network-access — 2025-06 (update notes Chrome 142)
- RUSTSEC-2026-0140 — https://rustsec.org/advisories/RUSTSEC-2026-0140 — 2026
- gh-pr-merge(1) — https://man.archlinux.org/man/gh-pr-merge.1.en — undated
- Cursor forum: auto-merge failure with merge queues — https://forum.cursor.com/t/auto-merge-failure-for-repositories-with-merge-queues/163624 — 2026-06 (updated 2026-09)
- npm package.json docs — https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bin — current

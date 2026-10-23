# Resume spike: headless `claude -p --resume` from the board

_Sprint resume-runs, slice K1 · Ran: 2026-10-22, Windows 11, Node 24.16.0, Claude Code 2.1.308_

This spike answers one question: can the board resume a Claude Code session headless, with the human's own login, safely enough to build the resume routes on? It ran only on a throwaway session made for it.

## How it ran

- Script: `packages/server/scripts/resume-spike.ts`. To rerun it (from `packages/server`): `pnpm exec tsx scripts/resume-spike.ts [--root <folder>] [--keep]`. It prints a JSON report.
- It makes a new empty folder (`pod-resume-spike-*/work`), writes a `.claude/settings.json` there that allows only `Bash(echo pod-spike-ok)`, and makes five small `claude -p` calls on the human's login:
  1. `claude -p hello --output-format json` creates the session and gives its id.
  2. The runner's `-p --resume <id> continue` resumes it once.
  3. Two runner resumes start at the same time.
  4. `claude -p --resume <id> "<run echo pod-spike-ok with Bash>" --output-format json` checks tools.
- Afterwards it removes the temp folder, the throwaway's `~/.claude/projects/<folder>` and `~/.claude/session-env/<id>`. A check afterwards found nothing named for the throwaway in `~/.claude.json` or `~/.claude/history.jsonl`.
- **Env the spawned `claude` saw.** The board's env minus `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`, as the runner does. The script also removes Claude Code's own session variables, because this engineer runs inside Claude Code and the board server doesn't. Removed: `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_EFFORT`, `CLAUDE_PID`. With those gone, no `CLAUDE*` or `ANTHROPIC*` variable reached the child. The nested launch caused no trouble, so no rerun was needed.
- **How `claude` is installed here.** `C:\Program Files\nodejs\claude.cmd`, an npm shim, next to an extensionless sh script that Windows can't run. The shim runs a native binary, `node_modules\@anthropic-ai\claude-code\bin\claude.exe`. The runner reads the shim and runs that `.exe` directly, with no shell.
- Your global `Stop` and `Notification` hooks in `~/.claude/settings.json` run for these calls too, because a `-p` run without `--bare` loads them. Expect one notification per call when you rerun the script.

## Check 1: Resume works headless on this OS: pass

- The create call exited 0. Its JSON output has `session_id` (`7890e639-…`), so `claude -p … --output-format json` really gives the id.
- The runner's resume exited 0 (`started`) after 13.6 s and added 17 lines to the transcript.
- **The id stays the same; nothing forks.** Every new line has `sessionId` equal to the throwaway's id. The project folder still holds exactly one `.jsonl`, and the resume's JSON output (check 4) reports the same `session_id`.
- **The transcript path the Idle session rule uses is right.** The transcript was at `<claude dir>/projects/<projectDirName(cwd)>/<session>.jsonl`. `projectDirName` is the same rule the board uses already, and it held for a long Windows temp path.
- **When the file is written.** Polled every 250 ms during the resume, the transcript's modified time first changed 1.8 s after the start. It changed again at 2.4, 5.8, 9.1, and 11.7 s. The run ended at 13.6 s.
- No workspace trust dialog blocked `-p` in a folder that had never been trusted, as the docs say.

## Check 2: Anthropic's current rules allow it: pass, with one tension for you to confirm

I read all pages on 2026-10-22.

- [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) (support, update of October 7, 2026): "You can still use the Claude Agent SDK, `claude -p`, and third-party apps with your subscription limits." The update of June 15, 2026 says "Claude Agent SDK, `claude -p`, and third-party app usage still draw from your subscription limits."
- [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance):
  - "**OAuth authentication** is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications."
  - "**Developers** building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication … Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens"
  - "Nor does it prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription"
  - "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK."
- [Run Claude Code programmatically](https://code.claude.com/docs/en/headless):
  - "It's available as a CLI for scripts and CI/CD"
  - "use `--resume` with a session ID to continue a specific conversation", with the example `claude -p "Continue that review" --resume "$session_id"`
  - "`--bare` is the recommended mode for scripted and SDK calls, and will become the default for `-p` in a future release." In bare mode "Claude Code never reads OAuth credentials or the system keychain."
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview): "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK."
- [Consumer Terms of Service](https://www.anthropic.com/legal/consumer-terms) (effective Oct 8, 2025), section 3, which forbids, "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it, to access the Services through automated or non-human means, whether through a bot, script, or otherwise."

**Reading.** The Consumer Terms forbid scripted access unless Anthropic "otherwise explicitly permit[s] it". The support article does that for `claude -p` on subscription limits, in so many words. The board runs the unmodified `claude` binary on the human's own machine, with the human's own login. It never reads, stores, or passes on credentials, and it offers no login to anyone. That fits "an end user … signing in to the unmodified Claude Code binary with their own Claude subscription", and none of the bans apply.

**Tension.** The legal page steers "products or services … including those using the Agent SDK" to API keys, and the headless page calls `claude -p` the Agent SDK's CLI. If pod-board were ever offered to other people as a product, that line would be the one to reread. For one person's own tool, I read it as allowed. That reading is mine, so it goes to you as a `PENDING`.

**Watch out.** If `--bare` becomes the default for `-p`, the board's resume stops using the subscription login: it would fail for lack of an API key. The runner never passes `--bare` and must not add an API key. A future Claude Code release may need an explicit opt-out flag, and that would change the contract's fixed arguments.

## Check 3: Two processes on one session: the conversation splits; the idle rule covers the board's own sends, with two gaps

- Two runner resumes started at the same moment. Both exited 0 and added 44 lines to the one transcript, with the same `sessionId`, and no second `.jsonl` appeared.
- **The conversation splits.** Afterwards one message had two children: both runs continued from the same last message, so the transcript holds two branches.
- **What the idle rule prevents.** A running turn wrote to the transcript within 1.8 s of starting and then every 3.4 s or sooner. A session last modified 60 s ago or more is not in a turn like that. The board also never starts a second run for a session while its request is in flight or its child is alive. So two board sends never overlap, and a board send doesn't land in the middle of an active turn that keeps writing.
- **Gap 1: a quiet active turn.** A turn that runs one long tool call, or waits on a foreground subagent (whose lines go to `<session>/subagents/`, not the main file), can leave the main transcript untouched for more than 60 s while it's still running. The idle rule would call it idle. This can only lead to a send if pod shows a sendable stop while that turn still runs. I couldn't measure that within the call budget. Suggestion for S1: treat the session as busy when its `<session>/subagents/` folder changed within 60 s too.
- **Gap 2: a terminal still open on the session.** An interactive `claude` left open on the session doesn't see the board's turn. If the human later types in that terminal, it continues from its own last message, and the conversation splits the same way. This isn't two runs at once, and U1 already tells the human to reopen with `claude --resume <id>`.

## Check 4: Tools in a resumed `-p` run: pass on this machine, with a condition

- The resumed run ran `echo pod-spike-ok` through Bash: `permission_denials` was empty, and the output is in the result and the transcript.
- **But the folder's allow rule wasn't what let it run.** `claude` printed: "Ignoring 1 permissions.allow entry from .claude/settings.json: this workspace has not been trusted." The command ran because the human's `~/.claude/settings.json` sets `"defaultMode": "auto"`, and auto mode's classifier approved it. I didn't mark the throwaway folder trusted, because that means editing the human's `~/.claude.json`.
- **What that means for pod.** A real pod repo has been opened in Claude Code before, so its trust is accepted and its `permissions.allow` rules load. The human's default mode also applies to the resumed run. The headless page says: "With Claude Code v2.1.302 or later, `claude -p` runs start in Manual mode when nothing sets a permission mode", and "In a Manual mode `claude -p` run, a call that needs approval is denied unless something approves it". So on this machine (auto mode) pod's tools run. On a machine with no default mode, every tool call outside the repo's allow rules would be denied, and the resumed orchestrator would stall. The runner may not pass a permission flag, so that is a setup requirement: a `PENDING` to write into `resume.md` and the UI's started hint.

## Not covered here

- macOS and Linux: the runner tests run there in CI with a fake `claude`, but this spike ran only on Windows. Rerun the script once on each (a `PENDING`).
- The runner's fallback for a `.cmd` shim it can't read goes through `cmd.exe`, and there the child's stderr doesn't reach the log, even with an inline redirect (a detached `cmd.exe` doesn't hand its handles on). The real npm shim never takes that path.

verdict: go

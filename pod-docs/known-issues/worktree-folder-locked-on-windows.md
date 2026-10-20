# Worktree folders can stay behind on Windows

_Found: 2026-10-19 · sprint server-runs, wave 3_

**Symptom:** `git worktree remove .claude/worktrees/<branch>` unregisters the worktree but fails to delete the folder with `Permission denied`. The folder keeps part of the checkout (for example `packages/`, `pod-docs/`, `README.md`). No process runs from it.

**Likely cause:** the editor's TypeScript server watches files in open worktrees (its diagnostics name files under `.claude/worktrees/`) and holds them open.

**What to do:** don't force it (no `--force`, no recursive delete). `git worktree prune`, name the folder under loose ends, and delete it by hand once the editor is closed. `.claude/` is excluded from git, so the leftover never reaches a commit.

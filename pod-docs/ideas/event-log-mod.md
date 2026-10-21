# Idea: Run event log mod

Status: parked

## The idea
A small mod in the pod plugin (TypeScript, the same mechanism as pod-flow) writes one JSON line per event to `<repo>/.claude/pod/events.jsonl`: `pod:*` skill prompts (run start and stage), `pod:*` agent start and end with the slice parsed from the dispatch, and `gh pr create` / `gh pr merge` calls. Each event carries the session id and a `v` format version. The folder self-ignores with a `.gitignore` holding `*`. See layer 2 in `docs/master-plan.md`.

## Why it's on hold
Phase 1 (`pod-docs/plans/board-read.md`) builds from Markdown and transcripts first, since that fallback must exist anyway, and mods are early access in Claude Code.

## What would make it worth building
Phase 1 in real use shows Markdown and transcripts are too slow (updates over 5 seconds) or ambiguous (wrong run or slice mapping).

# Idea: Shared parser package

Status: parked

## The idea
Move the pod file parsers (`parsePlan`, `parseSprint`, `parseQueue`, `readTable`, `parseDispatch`, `prState`, `tokenTotals`, and the rest) into one package that both `claude-pod/pod-flow` and the board's `model` package use, so a pod format change is fixed once.

## Why it's on hold
Phase 1 copies the parsers from `claude-pod/pod-flow/hooks/model.ts` with their tests. A shared package adds publishing and cross-repo releases before the board exists.

## What would make it worth building
The copies drift: a pod format change has to be fixed in both places more than once, or the board's extended parsers would also help pod-flow.

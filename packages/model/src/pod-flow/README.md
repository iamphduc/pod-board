# pod-flow parsers (copy)

This folder is a copy of the pod-flow parsers from the claude-pod repo, at commit `f668ddde46cc784f7d9b1b3acde59f731df63bf6`:

- `model.ts` — from `pod-flow/hooks/model.ts`
- `model.test.ts` — from `pod-flow/hooks/model.test.ts`
- `types.ts` — `Dispatch`, `TreeKind`, and `TreeLine` from `pod-flow/types/index.d.ts`, without its `declare module 'claude-code'` block

Only the imports changed, so a later shared package can diff the copy against the source:

- `ModelUsage` from `claude-code` is now the local `Usage` type in `types.ts`.
- Tests import `expect` and `test` from `vitest` instead of `claude-code/testing`.
- Local imports use the `.ts` extension.

One test was added at the end of `model.test.ts`: `parseSprint reads a real chess-web board row`.

Don't change the copied code. Put new behavior in new modules outside this folder that import from it.

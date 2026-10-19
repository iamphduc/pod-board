# Handoff Queue

_Shared: agents leave notes here for you and for each other. You answer the ones addressed to `human`._

**The human is the ultimate arbiter** — `BLOCKED` entries halt the orchestrator until acknowledged. **One line per entry.**

Format: `` - `[YYYY-MM-DD · TYPE · from → to · plan: <slug> · sprint: <slug> · slice: <code>]` <body> **Resolution:** pending `` (or `**Resolution:** <YYYY-MM-DD> — <what changed> [optional link to pod-docs/decisions.md#anchor]`).

Entries are **date-keyed and append-only** (newest at the tail) — reference one by its `[date · from → to]` header plus a few words of its body, never by position (a same-day header can repeat; the body disambiguates). `from`/`to` is a **role**, not an agent name — `engineer` / `reviewer` / `orchestrator` / `sprint-planner` / `planner` / `human` — so it stays stable when an agent is renamed. Omit `slice:` for sprint-wide entries, `sprint:` too for plan-wide ones, and `plan:` too for project-wide ones.

Types: `BLOCKED` halts · `PENDING` defers — someone has to act on it later · `SOLVED` informational, only emitted alongside a `BLOCKED` or `PENDING` to mark a related thing resolved inline. Pure FYI (`NOTE`) never lands here — it goes in the wave PR body. Reviewer entries start with when they matter: `now`, `before hosting`, or `someday`.

Resolve inline (do not delete prematurely); if decision-worthy, write a one-liner to `pod-docs/decisions.md` and link from the Resolution line. At plan end the orchestrator resolves entries that are obsolete (`**Resolution:** <date> — obsolete: <why>`), records a default in `pod-docs/decisions.md` for each choice the human never answered (`**Resolution:** <date> — default recorded: …; override anytime`), and sorts the rest for the human. When the next plan starts, the orchestrator moves each earlier plan's **resolved** entries to the `## Queue log` at the end of that plan's doc (`pod-docs/plans/<slug>.md`) and deletes resolved entries with no `plan:` (git history keeps them); unresolved entries (`Resolution: pending`) stay here.

---
- `[2026-10-18 · PENDING · engineer → human · plan: board-read · sprint: bootstrap-model · slice: F1]` before the repo goes public: `packages/model/fixtures/speak-out/docs/handoff-queue.md` is about 300 KB, with 233 full queue lines of speak-out's internal notes (some about auth and security). It passes every scrub rule, but the board only needs it to prove "unsupported", so check it or cut it to a sample. **Resolution:** pending

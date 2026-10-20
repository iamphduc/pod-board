# Sprint: Sparring ladder to Liem

_From plan: pod-docs/plans/sparring-ladder.md · Slug: ladder · Status: active · Generated: 2026-10-18_
<!-- autopilot-run: started=2026-10-18T10:31:18Z sprints=0 waves=3 -->

## Status board

| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |
|------|-------|-------|--------|----|--------|------------|------------|
| 1 | L1 | Look: sparring avatar style and token checks | ladder-L1 | #76 | merged | medium | — |
| 1 | H1 | Human baselines: rates module, `npm run baseline`, committed numbers | ladder-H1 | #76 | merged | medium | — |
| 1 | C1 | Chooser: mistake and blunder bands, new profile fields at zero | ladder-C1 | #76 | merged | medium | — |
| 2 | U1 | Sparring and Liem labels, page opens on vs Liem | ladder-U1 | #77 | merged | medium | L1 |
| 2 | M1 | `npm run calibrate -- --measure`: self-play from his book, graded | ladder-M1 | #77 | merged | high | H1, C1 |
| 3 | T1 | Tune the step table to 75 % of human rates; docs and results | ladder-T1 | — | pending | — | C1, H1, M1 |

## Shared contract

## Per-slice detail

### L1: Look: sparring avatar style and token checks

- **Files owned:** `src/styles/liem.css`, `src/index.css`, `tests/ladder-look.test.ts` (new)

- **One-way door:** none
- **Model:** opus

### H1: Human baselines: rates module, `npm run baseline`, committed numbers

- **Files owned:**
  - **Scripts:** `scripts/ladder/rates.ts` (new), `scripts/ladder/lichess.ts` (new), `scripts/ladder/baseline.ts` (new), `scripts/ladder/human-baselines.json` (new)
  - **Tests:** `scripts/ladder/__tests__/rates.test.ts` (new), `scripts/ladder/__tests__/lichess.test.ts` (new), `scripts/ladder/__tests__/baseline.test.ts` (new), `src/game/review/__tests__/grade.test.ts`
  - **Other:** `src/game/review/grade.ts`, `package.json`, `pod-docs/codebase-structure.md`

- **One-way door:** none (it reads the public Lichess API by hand. The committed numbers can be regenerated or deleted.)
- **Model:** opus

### C1: Chooser: mistake and blunder bands, new profile fields at zero

- **Files owned:**
  - **Code:** `src/game/opponent/human-move.ts`, `src/game/opponent/step-profiles.ts`, `src/game/opponent/engine/uci-engine.ts`
  - **Tests:** `src/game/opponent/__tests__/human-move.test.ts`, `src/game/opponent/__tests__/chooser-rates.test.ts` (new), `src/game/opponent/__tests__/step-profiles.test.ts`, `src/game/opponent/engine/__tests__/uci-engine.test.ts`

- **One-way door:** none
- **Model:** opus

### U1: Sparring and Liem labels, page opens on vs Liem

- **Files owned:**
  - **Liem feature:**
    - **Code:** `src/features/liem/levelView.ts` (new), `src/features/liem/matchSlice.ts`
    - **Components:** `src/features/liem/components/SetupCard.tsx`, `SetupCard.css`, `LiemCardDetail.tsx`, `BookNote.tsx`, `BookNote.css`
    - **Tests:** `src/features/liem/__tests__/level-view.test.ts` (new), `match-slice.test.ts`, `liem-actions.test.ts`, `setup-card.test.tsx`, `book-note-render.test.tsx`, `liem-turn.test.ts`
  - **Board:**
    - **Code:** `src/features/board/Board.tsx`, `Board.css`, `components/Player.tsx`, `components/Player.css`
    - **Tests:** `src/features/board/__tests__/board-modes.test.tsx`, `board-flip.test.tsx`, `board-new-position.test.tsx`, `sound-button.test.tsx`, `promotion-clock.test.tsx`, `game-end-stop.test.tsx`, `player.test.tsx`, `square.test.tsx`, `opponent-move.test.ts`
  - **Review:** `src/features/review/useGameReview.ts`, `src/features/review/__tests__/board-review.test.tsx`, `review-actions.test.ts`
  - **Root tests:** `tests/liem-theme.test.ts`, `tests/setup-card-css.test.ts`
  - **Docs:** `README.md`, `pod-docs/decisions.md`, `pod-docs/codebase-structure.md`

- **One-way door:** none
- **Model:** opus

### M1: `npm run calibrate -- --measure`: self-play from his book, graded

- **Files owned:**
  - **Code:** `scripts/calibrate/calibrate.ts`, `scripts/calibrate/measure.ts` (new), `scripts/calibrate/accuracy.ts` (new)
  - **Tests:** `scripts/calibrate/__tests__/measure.test.ts` (new), `scripts/calibrate/__tests__/cli.test.ts`

- **One-way door:** none
- **Model:** opus

### T1: Tune the step table to 75 % of human rates; docs and results

- **Files owned:**
  - **Code:** `src/game/opponent/step-profiles.ts`, `scripts/calibrate/accuracy.ts`
  - **Tests:** `src/game/opponent/__tests__/step-profiles.test.ts`, `src/game/opponent/__tests__/chooser-rates.test.ts`, `scripts/calibrate/__tests__/measure.test.ts`
  - **Docs:** `pod-docs/decisions.md`, `pod-docs/codebase-structure.md`

- **One-way door:** none
- **Model:** opus

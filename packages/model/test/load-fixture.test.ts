import { describe, expect, test } from 'vitest'

import { loadFixture } from './load-fixture.ts'

describe('loadFixture', () => {
  test('keys are repo-relative with forward slashes', () => {
    const files = loadFixture('chess-web')
    const keys = Object.keys(files)
    expect(keys).toContain('pod-docs/README.md')
    expect(keys).toContain('pod-docs/plans/sparring-ladder.md')
    expect(keys).toContain('pod-docs/sprints/archive/liem-opponent.md')
    for (const key of keys) {
      expect(key).not.toContain('\\')
      expect(key).not.toMatch(/^(\.|\/)/)
      expect(key.startsWith('chess-web')).toBe(false)
    }
    expect(files['pod-docs/README.md']).toMatch(/^pod docs: 2$/m)
  })

  test('each repo loads with its layout', () => {
    expect(Object.keys(loadFixture('ytb-feed'))).toContain('pod-docs/sprints/archive/digest-pipeline.md')
    for (const old of ['speak-out', 'skyscraper-view']) {
      expect(Object.keys(loadFixture(old))).toEqual(['docs/handoff-queue.md'])
    }
  })

  test('unknown fixture throws', () => {
    expect(() => loadFixture('no-such-repo')).toThrow(/unknown fixture "no-such-repo"/)
    expect(() => loadFixture('')).toThrow(/unknown fixture/)
    expect(() => loadFixture('README.md')).toThrow(/unknown fixture/)
    expect(() => loadFixture('../fixtures/chess-web')).toThrow(/unknown fixture/)
    expect(() => loadFixture('chess-web/pod-docs')).toThrow(/unknown fixture/)
  })

  test('chess-web ladder board is intact', () => {
    const files = loadFixture('chess-web')
    const ladder = files['pod-docs/sprints/ladder.md'] ?? ''
    expect(ladder).toContain(
      '_From plan: pod-docs/plans/sparring-ladder.md · Slug: ladder · Status: active · Generated: 2026-10-18_',
    )
    const board = ladder.split('\n').filter((line) => line.startsWith('|')).slice(0, 8)
    expect(board).toEqual([
      '| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |',
      '|------|-------|-------|--------|----|--------|------------|------------|',
      '| 1 | L1 | Look: sparring avatar style and token checks | ladder-L1 | #76 | merged | medium | — |',
      '| 1 | H1 | Human baselines: rates module, `npm run baseline`, committed numbers | ladder-H1 | #76 | merged | medium | — |',
      '| 1 | C1 | Chooser: mistake and blunder bands, new profile fields at zero | ladder-C1 | #76 | merged | medium | — |',
      '| 2 | U1 | Sparring and Liem labels, page opens on vs Liem | ladder-U1 | #77 | merged | medium | L1 |',
      '| 2 | M1 | `npm run calibrate -- --measure`: self-play from his book, graded | ladder-M1 | #77 | merged | high | H1, C1 |',
      '| 3 | T1 | Tune the step table to 75 % of human rates; docs and results | ladder-T1 | — | pending | — | C1, H1, M1 |',
    ])
    expect(files['pod-docs/sprints/archive/ladder.md']).toBeUndefined()
    expect(files['pod-docs/plans/sparring-ladder.md']).toMatch(/^\| ladder \| .* \| active \| — \|$/m)
  })
})

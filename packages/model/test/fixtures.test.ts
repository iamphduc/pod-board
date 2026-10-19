import { describe, expect, test } from 'vitest'

import { buildRepoModel, parseQueue } from '../src/index.ts'
import { loadFixture } from './load-fixture.ts'

const docKeys = (files: Record<string, string>, folder: string) =>
  Object.keys(files)
    .filter((key) => key.startsWith(folder) && key.endsWith('.md') && !key.slice(folder.length).includes('/'))
    .map((key) => key.slice(folder.length, -'.md'.length))

describe('run model on real-run fixtures', () => {
  test('chess-web run model', () => {
    const files = loadFixture('chess-web')
    const repo = buildRepoModel(files)
    expect(repo.docs).toEqual({ supported: true, version: 2 })

    const planSlugs = docKeys(files, 'pod-docs/plans/').sort()
    expect(planSlugs).toHaveLength(8)
    expect(repo.plans.map((p) => p.slug)).toEqual(planSlugs)

    // Every sprint doc joins a plan: 15 archived plus the active ladder.
    const sprints = repo.plans.flatMap((p) => p.sprints)
    const archived = docKeys(files, 'pod-docs/sprints/archive/')
    expect(archived).toHaveLength(15)
    for (const slug of archived) {
      expect(sprints.find((s) => s.slug === slug), slug).toMatchObject({ hasDoc: true, isArchived: true, status: 'done' })
    }

    const ladderPlan = repo.plans.find((p) => p.slug === 'sparring-ladder')
    expect(ladderPlan).toMatchObject({ title: 'Sparring ladder to Liem', status: 'active', go: 'unknown', currentSprint: 'ladder' })
    expect(ladderPlan).not.toHaveProperty('portBase')
    expect(ladderPlan?.sprints).toHaveLength(1)
    const ladder = ladderPlan?.sprints[0]
    expect(ladder).toMatchObject({ slug: 'ladder', status: 'active', hasDoc: true, isArchived: false, currentWave: 3 })
    expect(ladder?.goal).toMatch(/^Human baselines per level/)

    const table = ladder?.waves.map((w) => [
      w.wave,
      w.slices.map((s) => [s.code, s.branch, s.status, s.confidence, s.pr, s.dependsOn]),
    ])
    const merged = (n: number) => ({ state: 'merged', number: n })
    expect(table).toEqual([
      [1, [
        ['L1', 'ladder-L1', 'merged', 'medium', merged(76), []],
        ['H1', 'ladder-H1', 'merged', 'medium', merged(76), []],
        ['C1', 'ladder-C1', 'merged', 'medium', merged(76), []],
      ]],
      [2, [
        ['U1', 'ladder-U1', 'merged', 'medium', merged(77), ['L1']],
        ['M1', 'ladder-M1', 'merged', 'high', merged(77), ['H1', 'C1']],
      ]],
      [3, [['T1', 'ladder-T1', 'pending', '—', { state: 'none' }, ['C1', 'H1', 'M1']]]],
    ])
    expect(ladder?.waves[2]?.slices[0]?.title).toBe('Tune the step table to 75 % of human rates; docs and results')

    // Every other plan is archived or done, so it has no current sprint.
    for (const p of repo.plans.filter((p) => p.slug !== 'sparring-ladder')) {
      expect(p, p.slug).not.toHaveProperty('currentSprint')
    }

    // Older boards name slices instead of codes; their Depends on reads as written.
    const moveGen = sprints.find((s) => s.slug === 'move-generation')
    const dispatch = moveGen?.waves.at(-1)?.slices[0]
    expect(dispatch?.code).toBe('dispatch')
    expect(dispatch?.dependsOn).toEqual(['sliding', 'knight', 'king-step', 'pawn'])

    // The queue keeps every entry in file order.
    const queue = files['pod-docs/handoff-queue.md'] ?? ''
    expect(repo.queue.map((e) => e.body)).toEqual(parseQueue(queue).map((e) => e.body))
    expect(repo.queue.length).toBeGreaterThan(0)
  })

  test('ytb-feed run model', () => {
    const files = loadFixture('ytb-feed')
    const repo = buildRepoModel(files)
    expect(repo.docs).toEqual({ supported: true, version: 2 })
    expect(repo.plans.map((p) => [p.slug, p.status])).toEqual([
      ['feed-ux-rework', 'archived'],
      ['youtube-daily-digest', 'archived'],
    ])

    const sprints = repo.plans.flatMap((p) => p.sprints.map((s) => [p.slug, s.slug, s.status, s.isArchived, s.hasDoc]))
    expect(sprints).toEqual([
      ['feed-ux-rework', 'run-progress', 'done', true, true],
      ['feed-ux-rework', 'feed-and-channels', 'done', true, true],
      ['youtube-daily-digest', 'digest-pipeline', 'done', true, true],
      ['youtube-daily-digest', 'feed-web-app', 'done', true, true],
      ['youtube-daily-digest', 'nightly-autopilot', 'done', true, true],
    ])
    for (const p of repo.plans) {
      expect(p, p.slug).not.toHaveProperty('currentSprint')
      for (const s of p.sprints) {
        expect(s.waves.length, s.slug).toBeGreaterThan(0)
        expect(s, s.slug).not.toHaveProperty('currentWave')
      }
    }

    // Entries tagged with a plan land on that plan.
    const tagged = parseQueue(files['pod-docs/handoff-queue.md'] ?? '').filter((e) => e.plan === 'feed-ux-rework')
    expect(tagged.length).toBeGreaterThan(0)
    const rework = repo.plans.find((p) => p.slug === 'feed-ux-rework')
    for (const e of tagged) expect(rework?.queue.map((q) => q.body)).toContain(e.body)
    expect(rework?.queue.every((e) => e.plan === 'feed-ux-rework' || (!e.plan && e.sprint !== undefined))).toBe(true)
  })

  test('chess-web per-slice detail', () => {
    const repo = buildRepoModel(loadFixture('chess-web'))
    const ladder = repo.plans.find((p) => p.slug === 'sparring-ladder')?.sprints[0]
    const slices = Object.fromEntries((ladder?.waves ?? []).flatMap((w) => w.slices).map((s) => [s.code, s]))
    expect(Object.keys(slices)).toEqual(['L1', 'H1', 'C1', 'U1', 'M1', 'T1'])
    for (const s of Object.values(slices)) {
      expect(s.model, s.code).toBe('opus')
      expect(s, s.code).not.toHaveProperty('oneWayDoor')
      expect(s.filesOwned.length, s.code).toBeGreaterThan(0)
      expect(s.filesOwned.some((f) => f.includes('(new)') || f.includes('`')), s.code).toBe(false)
    }
    expect(slices.L1?.filesOwned).toEqual(['src/styles/liem.css', 'src/index.css', 'tests/ladder-look.test.ts'])
    // Sub-bullets under Files owned, in order, labels dropped.
    expect(slices.M1?.filesOwned).toEqual([
      'scripts/calibrate/calibrate.ts',
      'scripts/calibrate/measure.ts',
      'scripts/calibrate/accuracy.ts',
      'scripts/calibrate/__tests__/measure.test.ts',
      'scripts/calibrate/__tests__/cli.test.ts',
    ])
    expect(slices.H1?.filesOwned).toHaveLength(11)
  })

  test('old layout repos are unsupported', () => {
    for (const name of ['speak-out', 'skyscraper-view']) {
      expect(buildRepoModel(loadFixture(name)), name).toEqual({
        docs: { supported: false, version: undefined },
        plans: [],
        queue: [],
      })
    }
  })
})

import { describe, expect, test } from 'vitest'

import { buildPipeline, buildRepoModel, listRuns, parseAgentTranscript, parseQueue, type AgentRun, type BoardRepo, type Claim, type PrStatus } from '../src/index.ts'
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

// chess-web's ui-polish close-out at b0351dc: the plan archived, sprint `polish` done, a reporter
// writing, the claim file still there. The prompt below has the shape of pod's "Plan complete"
// reporter dispatch (the slug only in prose, a `Plan:` path item), not its text.
describe('a run in its close-out (chess-web ui-polish)', () => {
  const NOW = Date.parse('2026-10-20T08:00:00Z')
  const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()
  const CLAIM: Claim = { portBase: 3200, repoPath: 'E:\\Projects\\chess-web', plan: 'ui-polish' }
  const PROMPT = [
    'Plan complete: write the plan report and feature details for plan `ui-polish` in the parent repo.',
    '- Plan: pod-docs/plans/ui-polish.md (one sprint, `polish`, archived).',
    '- Final PR: https://github.com/o/r/pull/1, reviewer verdict `pass`.',
  ].join('\n')

  const reporter = () => {
    const record = (r: unknown) => JSON.stringify(r)
    const run = parseAgentTranscript({
      id: 'rep',
      session: 's',
      meta: JSON.stringify({ agentType: 'pod:reporter' }),
      jsonl: [
        record({ type: 'user', timestamp: at(12), message: { role: 'user', content: PROMPT } }),
        record({ type: 'assistant', timestamp: at(1), message: { id: 'm1', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'Write', input: {} }] } }),
      ].join('\n'),
    })
    if (!run) throw new Error('not a pod agent')
    return run
  }

  /**
   * The fixture, without the hand-back unless asked (the reporter runs before pod writes it), or with
   * it resolved, as the human leaves it after the merge.
   */
  const repo = (opts: { claims?: Claim[]; handBack?: boolean | 'resolved'; agents?: AgentRun[]; prs?: PrStatus[] } = {}): BoardRepo => {
    const files = loadFixture('chess-web-ui-polish')
    const queue = files['pod-docs/handoff-queue.md']!
    if (!opts.handBack) files['pod-docs/handoff-queue.md'] = '# Handoff Queue\n'
    if (opts.handBack === 'resolved') files['pod-docs/handoff-queue.md'] = queue.replace('**Resolution:** pending', '**Resolution:** 2026-10-20 — final PR merged')
    return {
      id: 'chess-web',
      name: 'chess-web',
      path: CLAIM.repoPath,
      source: 'claim',
      model: buildRepoModel(files),
      agents: opts.agents ?? [reporter()],
      prs: opts.prs ?? [],
      claims: opts.claims ?? [CLAIM],
    }
  }
  const runs = (r: BoardRepo) => listRuns({ generatedAt: NOW, gh: 'ok', repos: [r] }, NOW)

  test('the fixture is the close-out: plan archived, its one sprint done, port base 3200', () => {
    const plan = repo().model.plans.find((p) => p.slug === 'ui-polish')
    expect(plan).toMatchObject({ status: 'archived', portBase: 3200 })
    expect(plan?.sprints.map((s) => [s.slug, s.status])).toEqual([['polish', 'done']])
    expect(plan).not.toHaveProperty('currentSprint')
  })

  test('the reporter reads its plan from the dispatch', () => {
    expect(reporter()).toMatchObject({ type: 'pod:reporter', plan: 'ui-polish', ended: false })
  })

  test('with the claim and the reporter running, the run is closing out, not idle', () => {
    expect(runs(repo())).toEqual([
      { repoId: 'chess-web', repo: 'chess-web', plan: 'ui-polish', title: 'UI polish — calmer cards, resign, a clear game end, a compact review', where: 'closing out', state: 'running', portBase: 3200 },
    ])
  })

  test("once the hand-back exists, it's the final PR, waiting on you", () => {
    const r = repo({ handBack: true })
    expect(runs(r).map((x) => [x.plan, x.where, x.state])).toEqual([['ui-polish', 'final PR', 'needs-you']])
    const ship = buildPipeline(r, 'ui-polish', NOW)?.stages.find((s) => s.key === 'ship')?.steps
    expect(ship).toEqual([{ key: 'final-pr', label: 'Final PR', state: 'you', detail: 'PR #91 · you merge' }])
  })

  test('before the hand-back, Ship shows the final PR gh found by the plan branch', () => {
    const shipOf = (prs: PrStatus[]) => buildPipeline(repo({ prs }), 'ui-polish', NOW)?.stages.find((s) => s.key === 'ship')?.steps
    const pr = (state: PrStatus['state']): PrStatus => ({ number: 91, state, checks: 'pass', checkedAt: NOW, branch: 'ui-polish' })
    expect(shipOf([pr('open')])).toEqual([{ key: 'final-pr', label: 'Final PR', state: 'wait', detail: 'PR #91 · after review' }])
    expect(shipOf([pr('merged')])).toEqual([{ key: 'final-pr', label: 'Final PR', state: 'done', detail: 'merged PR #91' }])
    expect(shipOf([])).toEqual([{ key: 'final-pr', label: 'Final PR', state: 'wait', detail: 'not open yet' }])
  })

  test('after the merge, a leftover claim with nothing running leaves the list (hand-back resolved or deleted)', () => {
    const idle = [{ repoId: 'chess-web', repo: 'chess-web', where: 'no active plan', state: 'idle' }]
    const merged: PrStatus = { number: 91, state: 'merged', checks: 'pass', checkedAt: NOW }
    const done = { ...reporter(), ended: true, lastAt: NOW - 3 * 60 * 60_000 }
    expect(runs(repo({ handBack: 'resolved', agents: [done], prs: [merged] }))).toEqual(idle)
    expect(runs(repo({ handBack: false, agents: [done], prs: [merged] }))).toEqual(idle)
    expect(runs(repo({ handBack: 'resolved', agents: [] }))).toEqual(idle)
  })

  test('a resolved hand-back with the reporter still running stays closing out', () => {
    expect(runs(repo({ handBack: 'resolved' })).map((x) => [x.plan, x.where, x.state])).toEqual([['ui-polish', 'closing out', 'running']])
  })

  test('with no claim, the archived plan stays off the list', () => {
    expect(runs(repo({ claims: [] }))).toEqual([{ repoId: 'chess-web', repo: 'chess-web', where: 'no active plan', state: 'idle' }])
  })
})

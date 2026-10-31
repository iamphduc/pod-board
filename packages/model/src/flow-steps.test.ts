import { describe, expect, it } from 'vitest'
import type { AgentRun, BoardRepo, PrStatus } from './board.ts'
import { buildFlow, FLOW_STEPS, stagingBranches, type FlowStepDef } from './flow-steps.ts'
import type { Stage, Step } from './pipeline.ts'
import { buildRepoModel, type RepoFiles } from './run-model.ts'

// Every snapshot is built inline: test/no-io.test.ts scans this folder, so no file reads here.

const NOW = Date.UTC(2026, 9, 30, 12)
const MIN = 60_000
const README = '# pod docs\n\npod docs: 2\n'
const STAGING_DECISION = '# Decisions\n\n## 2026-10-18 — merge target: staging\n\nDecision: merges land on `pod-staging`; the human moves them to `main`.\n'

type PlanOpts = { grilled?: boolean; look?: string | null; links?: string; autopilot?: boolean; sprintStatus?: string }

function planDoc({ grilled = true, look = 'The human picked direction B.', links = '', autopilot = false, sprintStatus = 'active' }: PlanOpts = {}): string {
  return [
    '# Plan: Alpha',
    '',
    `_Generated: 2026-10-18 · Status: active${grilled ? ' · Grilled-with: grilling (fast)' : ''}_`,
    ...(autopilot ? ['<!-- autopilot-run: started=2026-10-18T10:00:00Z sprints=1 waves=2 -->'] : []),
    '',
    '## Goal',
    '',
    links,
    '',
    '## Sprint sequence',
    '',
    '| Sprint | Goal | Status | Depends on |',
    '|--------|------|--------|------------|',
    `| one | goal | ${sprintStatus} | — |`,
    '',
    ...(look === null ? [] : ['## Look', look, '']),
    '## Key decisions',
    '',
  ].join('\n')
}

const SPRINT = [
  '# Sprint: one',
  '',
  '_From plan: pod-docs/plans/alpha.md · Slug: one · Status: active · Generated: 2026-10-18_',
  '',
  '## Status board',
  '',
  '| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |',
  '|------|-------|-------|--------|----|--------|------------|------------|',
  '| 1 | A1 | Title A1 | one-A1 | #5 | merged | high | — |',
  '| 2 | B1 | Title B1 | one-B1 | — | pending | — | A1 |',
  '',
].join('\n')

type RepoOpts = PlanOpts & { research?: string[]; decisions?: string; agents?: AgentRun[]; prs?: PrStatus[] }

function repo(o: RepoOpts = {}): BoardRepo {
  // The active sprint doc decides autopilot, so it carries the marker too.
  const sprint = o.autopilot ? SPRINT.replace('\n\n## Status board', '\n<!-- autopilot-run: started=2026-10-18T10:00:00Z sprints=1 waves=2 -->\n\n## Status board') : SPRINT
  const files: RepoFiles = { 'pod-docs/README.md': README, 'pod-docs/plans/alpha.md': planDoc(o), 'pod-docs/sprints/one.md': sprint }
  for (const slug of o.research ?? []) files[`pod-docs/research/${slug}.md`] = '# Research\n'
  if (o.decisions !== undefined) files['pod-docs/decisions.md'] = o.decisions
  return { id: 'r', name: 'r', path: '/r', source: 'registered', model: buildRepoModel(files), agents: o.agents ?? [], prs: o.prs ?? [], claims: [] }
}

const gh = (number: number, state: PrStatus['state'], branch: string, base?: string, mergedAt?: number): PrStatus => ({
  number,
  state,
  checks: 'pass',
  checkedAt: NOW,
  branch,
  ...(base === undefined ? {} : { base }),
  ...(mergedAt === undefined ? {} : { mergedAt }),
})

let seq = 0
const researcher = (over: Partial<AgentRun>): AgentRun => {
  seq += 1
  return { id: `r${seq}`, session: 's', type: 'pod:researcher', tokens: 0, ended: true, startedAt: NOW - 60 * MIN, lastAt: NOW - 54 * MIN, ...over }
}

const flow = (r: BoardRepo, steps?: FlowStepDef[]): Stage[] => {
  const out = buildFlow(r, 'alpha', NOW, steps)
  expect(out, 'a flow').toBeDefined()
  return out!
}
const stepOf = (stages: Stage[], key: string): Step | undefined => stages.flatMap((s) => s.steps).find((s) => s.key === key)
const read = (r: BoardRepo, key: string) => {
  const s = stepOf(flow(r), key)
  return s && { state: s.state, detail: s.detail }
}

describe('buildFlow', () => {
  it('columns: Think, You, one Sprint column, Check, Ship', () => {
    const stages = flow(repo({ research: ['alpha'], decisions: STAGING_DECISION }))
    expect(stages.map((s) => s.caption)).toEqual(['Think', 'You', 'Sprint 1 of 1', 'Check', 'Ship'])
    expect(stages.map((s) => s.steps.map((x) => x.label))).toEqual([
      ['Research', 'Plan interview'],
      ['Look picked', 'Replied go'],
      ['Wave 1', 'Wave 2'],
      ['Final review', 'Fix pass'],
      ['Final PR', 'Staging → main'],
    ])
    expect(buildFlow(repo(), 'missing', NOW)).toBeUndefined()
  })

  it('every step in the registry has a unique id, a known column and a label', () => {
    expect(FLOW_STEPS.map((s) => s.id)).toEqual(['research', 'interview', 'look', 'go', 'review', 'fix', 'final-pr', 'staging'])
    expect(new Set(FLOW_STEPS.map((s) => s.id)).size).toBe(FLOW_STEPS.length)
    for (const s of FLOW_STEPS) {
      expect(['think', 'you', 'check', 'ship']).toContain(s.column)
      expect(s.label).not.toBe('')
    }
  })

  it('a new registry entry is all it takes to add a step; leaving one out removes it', () => {
    const extra: FlowStepDef = { id: 'demo', column: 'ship', label: 'Demo', read: () => ({ state: 'wait', detail: 'later' }) }
    const added = flow(repo(), [...FLOW_STEPS, extra])
    expect(added.at(-1)?.steps.map((s) => s.label)).toEqual(['Final PR', 'Demo'])
    expect(stepOf(added, 'demo')).toEqual({ key: 'demo', label: 'Demo', state: 'wait', detail: 'later' })
    // Without Research and Plan interview, the Think column goes away.
    const removed = flow(repo(), FLOW_STEPS.filter((s) => s.column !== 'think'))
    expect(removed.map((s) => s.caption)).toEqual(['You', 'Sprint 1 of 1', 'Check', 'Ship'])
    // A reader that returns nothing leaves its step out.
    const none = flow(repo(), FLOW_STEPS.map((s) => (s.id === 'look' ? { ...s, read: () => undefined } : s)))
    expect(stepOf(none, 'look')).toBeUndefined()
  })

  it('research: done only with a report; researchers give the detail', () => {
    // A report named after the plan.
    expect(read(repo({ research: ['alpha'] }), 'research')).toEqual({ state: 'done', detail: 'report' })
    // A report the plan doc links.
    expect(read(repo({ research: ['live-feed'], links: 'See [it](../research/live-feed.md).' }), 'research')).toEqual({ state: 'done', detail: 'report' })
    // The plan's researchers: their count and active minutes (overlapping spans count once).
    const two = [researcher({ plan: 'alpha' }), researcher({ plan: 'alpha', startedAt: NOW - 58 * MIN, lastAt: NOW - 52 * MIN })]
    expect(read(repo({ research: ['alpha'], agents: [...two, researcher({ plan: 'other' })] }), 'research')).toEqual({ state: 'done', detail: '2 researchers · 8 min' })
    // A researcher with no plan doesn't count.
    expect(read(repo({ research: ['alpha'], agents: [researcher({})] }), 'research')).toEqual({ state: 'done', detail: 'report' })
    // A link to a report that isn't there proves nothing.
    expect(read(repo({ links: 'See research/gone.md.' }), 'research')).toEqual({ state: 'unknown', detail: 'not recorded' })
    // No report and no link: skipped.
    expect(read(repo(), 'research')).toEqual({ state: 'skipped', detail: 'no research' })
    // Researchers still at work, no report yet: running.
    const live = researcher({ plan: 'alpha', ended: false, startedAt: NOW - 5 * MIN, lastAt: NOW - MIN })
    expect(read(repo({ agents: [live] }), 'research')).toEqual({ state: 'live', detail: '1 researcher · 5 min so far' })
  })

  it('plan interview: done with Grilled-with, else not recorded', () => {
    expect(read(repo(), 'interview')).toEqual({ state: 'done', detail: 'grilled with grilling (fast)' })
    expect(read(repo({ grilled: false }), 'interview')).toEqual({ state: 'unknown', detail: 'not recorded' })
  })

  it('look picked: the direction, a look with none named, no UI, or not recorded', () => {
    expect(read(repo(), 'look')).toEqual({ state: 'done', detail: 'direction B' })
    expect(read(repo({ look: '- **Thesis:** a quiet page.' }), 'look')).toEqual({ state: 'done', detail: 'look set' })
    expect(read(repo({ look: null }), 'look')).toEqual({ state: 'skipped', detail: 'no UI' })
    expect(read(repo({ look: 'None: no UI change.' }), 'look')).toEqual({ state: 'skipped', detail: 'no UI' })
    // An empty Look section proves nothing.
    expect(read(repo({ look: '' }), 'look')).toEqual({ state: 'unknown', detail: 'not recorded' })
  })

  it('replied go: the pipeline Go step; none on an autopilot run', () => {
    expect(read(repo(), 'go')).toEqual({ state: 'unknown', detail: 'not recorded yet' })
    const auto = flow(repo({ autopilot: true }))
    expect(stepOf(auto, 'go')).toBeUndefined()
    expect(auto[1]?.steps.map((s) => s.label)).toEqual(['Look picked'])
  })

  it('check and ship read the pipeline', () => {
    expect(read(repo(), 'review')).toEqual({ state: 'wait', detail: 'not started' })
    expect(read(repo(), 'fix')).toEqual({ state: 'wait', detail: 'only if review fails' })
    expect(read(repo(), 'final-pr')).toEqual({ state: 'wait', detail: 'not open yet' })
  })

  describe('staging → main', () => {
    // The final PR #80 merged into pod-staging an hour ago.
    const merged = gh(80, 'merged', 'alpha', 'pod-staging', NOW - 60 * MIN)

    it('is left out with no staging branch', () => {
      expect(stepOf(flow(repo()), 'staging')).toBeUndefined()
      // A final PR into main isn't staging.
      expect(stepOf(flow(repo({ prs: [gh(80, 'merged', 'alpha', 'main')] })), 'staging')).toBeUndefined()
    })

    it('waits for the final PR', () => {
      expect(read(repo({ decisions: STAGING_DECISION }), 'staging')).toEqual({ state: 'wait', detail: 'after the final PR' })
      expect(read(repo({ decisions: STAGING_DECISION, prs: [gh(80, 'open', 'alpha', 'pod-staging')] }), 'staging')).toEqual({ state: 'wait', detail: 'after the final PR' })
    })

    it('then needs you while the staging PR is open, and is done once it merges', () => {
      // The final PR's base alone names the staging branch.
      expect(read(repo({ prs: [merged] }), 'staging')).toEqual({ state: 'wait', detail: 'not open yet' })
      expect(read(repo({ prs: [merged, gh(91, 'open', 'pod-staging', 'main')] }), 'staging')).toEqual({ state: 'you', detail: 'PR #91 · you merge' })
      // No Merge here: the Next step card's rules are unchanged.
      expect(stepOf(flow(repo({ prs: [merged, gh(91, 'open', 'pod-staging', 'main')] })), 'staging')).not.toHaveProperty('merge')
      expect(read(repo({ prs: [merged, gh(91, 'merged', 'pod-staging', 'main', NOW - 5 * MIN)] }), 'staging')).toEqual({ state: 'done', detail: 'merged PR #91' })
    })

    it('an open staging PR always counts, even one pod reused from an earlier plan', () => {
      // Gate 7 reuses the open pod-staging → main PR, so its number is below this plan's final PR.
      expect(read(repo({ prs: [merged, gh(13, 'open', 'pod-staging', 'main')] }), 'staging')).toEqual({ state: 'you', detail: 'PR #13 · you merge' })
    })

    it('a merged staging PR counts only when it merged after the final PR', () => {
      // The reused #13 merged after #80: done.
      expect(read(repo({ prs: [merged, gh(13, 'merged', 'pod-staging', 'main', NOW - 5 * MIN)] }), 'staging')).toEqual({ state: 'done', detail: 'merged PR #13' })
      // The last plan's staging PR merged before this plan's final PR: not this plan's.
      expect(read(repo({ prs: [merged, gh(70, 'merged', 'pod-staging', 'main', NOW - 120 * MIN)] }), 'staging')).toEqual({ state: 'wait', detail: 'not open yet' })
      // A higher number proves nothing without times.
      expect(read(repo({ prs: [merged, gh(91, 'merged', 'pod-staging', 'main')] }), 'staging')).toEqual({ state: 'wait', detail: 'not open yet' })
      expect(read(repo({ prs: [gh(80, 'merged', 'alpha', 'pod-staging'), gh(91, 'merged', 'pod-staging', 'main', NOW)] }), 'staging')).toEqual({ state: 'wait', detail: 'not open yet' })
    })

    it("a closed staging PR isn't shown as this plan's: no time says which plan it was", () => {
      expect(read(repo({ prs: [merged, gh(91, 'closed', 'pod-staging', 'main')] }), 'staging')).toEqual({ state: 'wait', detail: 'not open yet' })
    })

    it("uses the final PR's own staging base over the decision", () => {
      const prs = [gh(80, 'merged', 'alpha', 'alpha-staging'), gh(91, 'open', 'alpha-staging', 'main'), gh(92, 'open', 'pod-staging', 'main')]
      expect(read(repo({ decisions: STAGING_DECISION, prs }), 'staging')).toEqual({ state: 'you', detail: 'PR #91 · you merge' })
    })
  })
})

/** A plan with three sprints: `zero`, `one`, `two`, with these statuses in the plan's table. */
function threeSprints(statuses: [string, string, string], over: Partial<BoardRepo> = {}): BoardRepo {
  const rows = ['zero', 'one', 'two'].map((slug, i) => `| ${slug} | goal | ${statuses[i]} | — |`)
  const plan = planDoc().replace(/^\| one \| goal \| active \| — \|$/m, rows.join('\n'))
  const zero = SPRINT.replaceAll('one', 'zero').replace('| 2 | B1 | Title B1 | zero-B1 | — | pending |', '| 2 | B1 | Title B1 | zero-B1 | #6 | merged |')
  const files: RepoFiles = { 'pod-docs/README.md': README, 'pod-docs/plans/alpha.md': plan, 'pod-docs/sprints/zero.md': zero, 'pod-docs/sprints/one.md': SPRINT }
  return { id: 'r', name: 'r', path: '/r', source: 'registered', model: buildRepoModel(files), agents: [], prs: [], claims: [], ...over }
}
const sprintColumn = (stages: Stage[]) => {
  expect(stages.map((s) => s.caption)).toHaveLength(5)
  const col = stages[2]!
  return { caption: col.caption, cards: col.steps.map((s) => [s.label, s.state, s.detail]) }
}

describe('buildFlow: every sprint in one column', () => {
  it('a done sprint folds to one card, the current one shows its waves, a future one waits by name', () => {
    const stages = flow(threeSprints(['done', 'active', 'planned']))
    expect(stages.map((s) => s.caption)).toEqual(['Think', 'You', 'Sprint 2 of 3', 'Check', 'Ship'])
    expect(sprintColumn(stages)).toEqual({
      caption: 'Sprint 2 of 3',
      cards: [
        ['zero', 'done', '2 waves'],
        ['Wave 1', 'done', expect.any(String)],
        ['Wave 2', 'live', expect.any(String)],
        ['two', 'wait', 'not drafted'],
      ],
    })
    // Keys stay unique, so each card keeps its place.
    const keys = stages[2]!.steps.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('the first sprint current: Sprint 1 of 3, the later two waiting', () => {
    const stages = flow(threeSprints(['active', 'planned', 'planned']))
    const col = sprintColumn(stages)
    expect(col.caption).toBe('Sprint 1 of 3')
    expect(col.cards.map((c) => c[0])).toEqual(['Wave 1', 'Wave 2', 'one', 'two'])
    expect(col.cards.slice(2).map((c) => c[1])).toEqual(['wait', 'wait'])
  })

  it('every sprint done: Sprint 3 of 3, three folded cards', () => {
    const col = sprintColumn(flow(threeSprints(['done', 'done', 'done'])))
    expect(col.caption).toBe('Sprint 3 of 3')
    expect(col.cards).toEqual([
      ['zero', 'done', '2 waves'],
      ['one', 'done', '2 waves'],
      ['two', 'done', 'done'],
    ])
  })

  it('an archived plan has no current sprint: M of M', () => {
    const r = threeSprints(['done', 'active', 'planned'])
    const plan = r.model.plans[0]!
    const archived: BoardRepo = { ...r, model: { ...r.model, plans: [{ ...plan, status: 'archived', currentSprint: undefined }] } }
    expect(sprintColumn(flow(archived)).caption).toBe('Sprint 3 of 3')
  })
})

describe('stagingBranches', () => {
  it('asks gh about the staging branch only once a plan reaches its final PR', () => {
    // Mid-sprint: nothing to ask.
    expect(stagingBranches(repo({ decisions: STAGING_DECISION }))).toEqual([])
    // Every sprint done: the decision's branch.
    expect(stagingBranches(repo({ decisions: STAGING_DECISION, sprintStatus: 'done' }))).toEqual(['pod-staging'])
    // A final PR found with a staging base names it, decision or not.
    expect(stagingBranches(repo({ prs: [gh(80, 'merged', 'alpha', 'alpha-staging')] }))).toEqual(['alpha-staging'])
    // No staging at all.
    expect(stagingBranches(repo({ sprintStatus: 'done' }))).toEqual([])
  })
})

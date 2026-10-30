import { describe, expect, it } from 'vitest'
import { buildFlow, buildPipeline, buildRepoModel, listRuns, type BoardRepo, type Claim, type RunSummary, type Stage, type Step } from '@pod-board/model'
import { loadFixture } from '../../../../model/test/load-fixture.ts'
import { flowColumns, foldLine, runHeader } from './plan-view.ts'

const NOW = Date.UTC(2026, 9, 20, 12)
const PLAN = 'pod-docs/plans/sparring-ladder.md'
const LADDER = 'pod-docs/sprints/ladder.md'

/** chess-web as the fixture has it: plan sparring-ladder, an autopilot run on wave 3 of 3 of sprint ladder. */
function chess(edit: (files: Record<string, string>) => void = () => {}, extra: Partial<BoardRepo> = {}): BoardRepo {
  const files = loadFixture('chess-web')
  edit(files)
  return { id: 'chess', name: 'chess-web', path: '/c', source: 'registered', model: buildRepoModel(files), agents: [], prs: [], claims: [], ...extra }
}
/** The same run started with /pod:code: no autopilot line, so the pipeline has a Go step. */
const manual = (files: Record<string, string>) => {
  // The plan doc and the sprint doc both carry pod's autopilot line.
  for (const doc of [PLAN, LADDER]) files[doc] = files[doc]!.replace(/^<!-- autopilot-run.*-->\r?\n/m, '')
}
const runOf = (repo: BoardRepo, plan?: string) => listRuns({ generatedAt: NOW, gh: 'ok', repos: [repo] }, NOW).find((r) => r.plan === plan)
const ladderRun = { repoId: 'chess', repo: 'chess-web', plan: 'sparring-ladder', where: 'x', state: 'idle' } satisfies RunSummary

const step = (key: string, state: Step['state'], label = key): Step => ({ key, label, state, detail: `${key} detail` })
const stage = (key: string, caption: string, steps: Step[]): Stage => ({ key, caption, steps })

describe('plan view', () => {
  it('flow columns', () => {
    const stages = [
      stage('plan', 'Plan', [step('plan', 'done', 'Plan'), step('go', 'unknown', 'Go')]),
      stage('sprint:one', 'Sprint 1 of 2', [step('one/wave-1', 'done', 'Wave 1'), step('one/wave-2', 'live', 'Wave 2'), step('one/wave-3', 'wait', 'Wave 3')]),
      stage('empty', 'Empty', []),
      stage('check', 'Check', [step('review', 'blocked', 'Final review')]),
      stage('ship', 'Ship', [step('final-pr', 'you', 'Final PR')]),
    ]
    const cols = flowColumns(stages)
    // One column per stage with steps, in order; a stage with no steps leaves no empty column.
    expect(cols.map((c) => [c.key, c.caption])).toEqual([
      ['plan', 'Plan'],
      ['sprint:one', 'Sprint 1 of 2'],
      ['check', 'Check'],
      ['ship', 'Ship'],
    ])
    const steps = cols.flatMap((c) => c.steps)
    expect(steps.map((s) => [s.label, s.detail])).toEqual([
      ['Plan', 'plan detail'],
      ['Go', 'go detail'],
      ['Wave 1', 'one/wave-1 detail'],
      ['Wave 2', 'one/wave-2 detail'],
      ['Wave 3', 'one/wave-3 detail'],
      ['Final review', 'review detail'],
      ['Final PR', 'final-pr detail'],
    ])
    // Each state has its mark (an icon name) and word, so a state never rests on colour alone.
    expect(steps.map((s) => [s.state, s.mark, s.word])).toEqual([
      ['done', 'check', 'done'],
      ['unknown', 'circle', 'unknown'],
      ['done', 'check', 'done'],
      ['live', 'dot', 'running'],
      ['wait', 'circle', 'waiting'],
      ['blocked', 'blocked', 'blocked'],
      ['you', 'alert', 'needs you'],
    ])
    // Running, needs you and blocked steps get the highlighted border; waiting and unknown ones are dim.
    expect(steps.filter((s) => s.highlight).map((s) => s.label)).toEqual(['Wave 2', 'Final review', 'Final PR'])
    expect(steps.filter((s) => s.dim).map((s) => s.label)).toEqual(['Go', 'Wave 3'])
    // Keys stay unique across columns, so React keeps each card.
    expect(new Set(steps.map((s) => s.key)).size).toBe(steps.length)
    expect(flowColumns([])).toEqual([])
  })

  it('flow columns from a real pipeline', () => {
    // /pod:code: the Plan column has Plan and Go.
    const code = flowColumns(buildPipeline(chess(manual), 'sparring-ladder', NOW)!.stages)
    expect(code.map((c) => [c.caption, c.steps.map((s) => `${s.label} ${s.word}`)])).toEqual([
      ['Plan', ['Plan done', 'Go unknown']],
      ['Sprint 1 of 1', ['Wave 1 done', 'Wave 2 done', 'Wave 3 running']],
      ['Check', ['Final review waiting', 'Fix pass waiting']],
      ['Ship', ['Final PR waiting']],
    ])
    expect(code[1]?.steps[2]).toMatchObject({ detail: '1 slice', highlight: true })
    // Autopilot records no Go, so its Plan column has one card.
    const auto = flowColumns(buildPipeline(chess(), 'sparring-ladder', NOW)!.stages)
    expect(auto[0]?.steps.map((s) => s.label)).toEqual(['Plan'])
    expect(auto.map((c) => c.caption)).toEqual(['Plan', 'Sprint 1 of 1', 'Check', 'Ship'])
  })

  it('flow columns: a skipped step is dim with a ring', () => {
    const cols = flowColumns([stage('think', 'Think', [step('research', 'skipped', 'Research')])])
    expect(cols[0]?.steps[0]).toMatchObject({ state: 'skipped', mark: 'circle', word: 'skipped', dim: true, highlight: false })
  })

  it('flow columns from the full flow', () => {
    const cols = flowColumns(buildFlow(chess(manual), 'sparring-ladder', NOW) ?? [])
    expect(cols.map((c) => c.caption)).toEqual(['Think', 'You', 'Sprint 1 of 1', 'Check', 'Ship'])
    expect(cols.map((c) => c.steps.map((s) => `${s.label} ${s.word}`))).toEqual([
      // The fixture has no research report, and its Look section is empty (scrubbed).
      ['Research skipped', 'Plan interview done'],
      ['Look picked unknown', 'Replied go unknown'],
      ['Wave 1 done', 'Wave 2 done', 'Wave 3 running'],
      ['Final review waiting', 'Fix pass waiting'],
      ['Final PR waiting'],
    ])
  })

  it('fold line: the current step with its mark', () => {
    const cols = (states: Step['state'][]) => flowColumns([stage('s', 'S', states.map((st, i) => step(`s${i}`, st, `Step ${i}`)))])
    // The first blocked, needs-you or running step wins, even after a waiting one.
    expect(foldLine(cols(['done', 'wait', 'you', 'blocked']))).toEqual({ label: 'Step 2', detail: 's2 detail', mark: 'alert', word: 'needs you', state: 'you' })
    expect(foldLine(cols(['done', 'live']))).toMatchObject({ label: 'Step 1', mark: 'dot', state: 'live' })
    // Else the first waiting step; skipped and unknown ones are passed over.
    expect(foldLine(cols(['done', 'skipped', 'unknown', 'wait', 'wait']))).toMatchObject({ label: 'Step 3', state: 'wait' })
    // Everything done: the last step.
    expect(foldLine(cols(['done', 'done']))).toMatchObject({ label: 'Step 1', mark: 'check', state: 'done' })
    expect(foldLine([])).toBeUndefined()
    // The real run: wave 3, running.
    expect(foldLine(flowColumns(buildFlow(chess(), 'sparring-ladder', NOW) ?? []))).toMatchObject({ label: 'Wave 3', detail: '1 slice', state: 'live' })
  })

  it('run header', () => {
    // Autopilot: Research skipped and Look unknown count as done once a later step started; the live wave is current.
    const auto = chess()
    expect(runHeader(runOf(auto, 'sparring-ladder'), auto, NOW)).toEqual({
      crumb: 'chess-web',
      name: 'sparring-ladder',
      segments: ['done', 'done', 'done', 'done', 'done', 'current', 'rest', 'rest', 'rest'],
      wave: 'Wave 3 of 3',
    })
    // /pod:code: one more step, Go, unknown, done once a later step started.
    const code = chess(manual)
    expect(runHeader(runOf(code, 'sparring-ladder'), code, NOW)?.segments).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'current', 'rest', 'rest', 'rest'])
    // A fresh plan: the sprint has no doc, so it is the first waiting step; nothing after Look started, so Look and Go aren't done.
    const fresh = chess((f) => {
      manual(f)
      f[PLAN] = f[PLAN]!.replace(/^(\| ladder \|.*\|) active (\| — \|)$/m, '$1 planned $2')
      delete f[LADDER]
    })
    const header = runHeader(ladderRun, fresh, NOW)
    expect(header?.segments).toEqual(['done', 'done', 'rest', 'rest', 'current', 'rest', 'rest', 'rest'])
    expect(header).not.toHaveProperty('wave')
  })

  it('run header for a fix run, a repo row, and no run', () => {
    const name = 'fix-scroll'
    const claim: Claim = { portBase: 3100, repoPath: '/c', plan: name }
    const repo = chess(() => {}, { claims: [claim] })
    const fix = { repoId: 'chess', repo: 'chess-web', plan: name, fix: 'scroll', where: 'working', state: 'running' } satisfies RunSummary
    expect(runHeader(fix, repo, NOW)).toEqual({ crumb: 'chess-web', name: 'fix · scroll', segments: [] })

    const row = { repoId: 'chess', repo: 'chess-web', where: 'no active plan', state: 'idle' } satisfies RunSummary
    expect(runHeader(row, repo, NOW)).toEqual({ crumb: 'chess-web', name: 'chess-web', segments: [] })
    // A plan the repo doesn't have: its name, no strip.
    expect(runHeader({ ...row, plan: 'gone' }, repo, NOW)).toEqual({ crumb: 'chess-web', name: 'gone', segments: [] })

    expect(runHeader(undefined, repo, NOW)).toBeUndefined()
    expect(runHeader(row, undefined, NOW)).toBeUndefined()
    // Another repo's run never reads as this repo's.
    expect(runHeader({ ...row, repoId: 'other' }, repo, NOW)).toBeUndefined()
  })
})

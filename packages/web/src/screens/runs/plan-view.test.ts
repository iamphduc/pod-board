import { describe, expect, it } from 'vitest'
import { buildPipeline, buildRepoModel, listRuns, type BoardRepo, type Claim, type RunSummary, type Stage, type Step } from '@pod-board/model'
import { loadFixture } from '../../../../model/test/load-fixture.ts'
import { planLines, runHeader } from './plan-view.ts'

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
/** Sets the ladder sprint's row in the plan's Sprint sequence to `status`, and adds `extra` rows after it. */
const ladderStatus = (files: Record<string, string>, status: string, extra = '') => {
  files[PLAN] = files[PLAN]!.replace(/^(\| ladder \|.*\|) active (\| — \|)$/m, `$1 ${status} $2${extra}`)
}
const runOf = (repo: BoardRepo, plan?: string) => listRuns({ generatedAt: NOW, gh: 'ok', repos: [repo] }, NOW).find((r) => r.plan === plan)
const ladderRun = { repoId: 'chess', repo: 'chess-web', plan: 'sparring-ladder', where: 'x', state: 'idle' } satisfies RunSummary

const step = (key: string, state: Step['state'], label = key): Step => ({ key, label, state, detail: `${key} detail` })
const stage = (key: string, caption: string, steps: Step[]): Stage => ({ key, caption, steps })

describe('plan view', () => {
  it('plan lines', () => {
    const stages = [
      stage('plan', 'Plan', [step('plan', 'done', 'Plan'), step('go', 'unknown', 'Go')]),
      stage('sprint:one', 'Sprint 1 of 2', [step('one/wave-1', 'done', 'Wave 1'), step('one/wave-2', 'wait', 'Wave 2'), step('one/wave-3', 'you', 'Wave 3')]),
      stage('check', 'Check', [step('review', 'blocked', 'Final review')]),
    ]
    const lines = planLines(stages)
    // One line per step, in order; a doubled caption shows once.
    expect(lines.map((l) => l.label)).toEqual(['Plan', 'Plan · Go', 'Sprint 1 of 2 · Wave 1', 'Sprint 1 of 2 · Wave 2', 'Sprint 1 of 2 · Wave 3', 'Check · Final review'])
    expect(lines.map((l) => [l.state, l.word])).toEqual([
      ['done', 'done'],
      ['unknown', 'unknown'],
      ['done', 'done'],
      ['wait', 'waiting'],
      ['you', 'needs you'],
      ['blocked', 'blocked'],
    ])
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length)
    // The first blocked / you / live step is current, even with a wait before it and a blocked one after it.
    expect(lines.map((l) => l.current)).toEqual([false, false, false, false, true, false])
    // Only the current line has a detail, the step's own.
    expect(lines.filter((l) => l.detail !== undefined)).toEqual([expect.objectContaining({ label: 'Sprint 1 of 2 · Wave 3', detail: 'one/wave-3 detail' })])

    // With no blocked / you / live, the first wait is current.
    const waits = planLines([stage('s', 'Sprint 1 of 1', [step('a', 'done'), step('b', 'wait'), step('c', 'wait')])])
    expect(waits.map((l) => [l.label, l.current, l.detail])).toEqual([
      ['Sprint 1 of 1 · a', false, undefined],
      ['Sprint 1 of 1 · b', true, 'b detail'],
      ['Sprint 1 of 1 · c', false, undefined],
    ])
    // live reads running and beats an earlier wait.
    expect(planLines([stage('s', 'S', [step('w', 'wait'), step('l', 'live')])]).map((l) => [l.word, l.current])).toEqual([
      ['waiting', false],
      ['running', true],
    ])
    // Everything done or unknown: no step is current, and no line has a detail.
    const done = planLines([stage('s', 'S', [step('a', 'done'), step('b', 'unknown')])])
    expect(done.map((l) => l.current)).toEqual([false, false])
    expect(done.some((l) => 'detail' in l)).toBe(false)
    expect(planLines([])).toEqual([])
  })

  it('plan lines from a real pipeline', () => {
    const lines = planLines(buildPipeline(chess(manual), 'sparring-ladder', NOW)!.stages)
    expect(lines.map((l) => [l.label, l.word, l.current])).toEqual([
      ['Plan', 'done', false],
      ['Plan · Go', 'unknown', false],
      ['Sprint 1 of 1 · Wave 1', 'done', false],
      ['Sprint 1 of 1 · Wave 2', 'done', false],
      ['Sprint 1 of 1 · Wave 3', 'running', true],
      ['Check · Final review', 'waiting', false],
      ['Check · Fix pass', 'waiting', false],
      ['Ship · Final PR', 'waiting', false],
    ])
    expect(lines[4]?.detail).toBe('1 slice')
  })

  it('run header', () => {
    // Autopilot: no Go step. Done waves, the live wave current, the rest after it.
    const auto = chess()
    expect(runHeader(runOf(auto, 'sparring-ladder'), auto, NOW)).toEqual({
      crumb: 'chess-web',
      name: 'sparring-ladder',
      segments: ['done', 'done', 'done', 'current', 'rest', 'rest', 'rest'],
      wave: 'Wave 3 of 3',
    })

    // /pod:code: the Go step is unknown (not recorded yet) and counts as done once a later step started.
    const code = chess(manual)
    expect(runHeader(runOf(code, 'sparring-ladder'), code, NOW)?.segments).toEqual(['done', 'done', 'done', 'done', 'current', 'rest', 'rest', 'rest'])

    // Every wave merged but the sprint still active: no current wave, so N is the last wave.
    const merged = chess((f) => {
      manual(f)
      f[LADDER] = f[LADDER]!.replace('| ladder-T1 | — | pending | — |', '| ladder-T1 | #78 | merged | high |')
    })
    expect(merged.model.plans.find((p) => p.slug === 'sparring-ladder')?.sprints[0]).not.toHaveProperty('currentWave')
    expect(runHeader(ladderRun, merged, NOW)?.wave).toBe('Wave 3 of 3')

    // Between sprints (the next one not drafted): its step is the first wait, so current; no wave.
    const between = chess((f) => {
      manual(f)
      ladderStatus(f, 'done', '\n| polish | Polish the ladder | planned | ladder |')
    })
    expect(between.model.plans.find((p) => p.slug === 'sparring-ladder')?.currentSprint).toBe('polish')
    const header = runHeader(ladderRun, between, NOW)
    expect(header?.segments).toEqual(['done', 'done', 'done', 'current', 'rest', 'rest', 'rest'])
    expect(header).not.toHaveProperty('wave')

    // A fresh plan: nothing after Go started, so Go isn't done; the sprint has no doc, so no wave.
    const fresh = chess((f) => {
      manual(f)
      ladderStatus(f, 'planned')
      delete f[LADDER]
    })
    const freshHeader = runHeader(ladderRun, fresh, NOW)
    expect(freshHeader?.segments).toEqual(['done', 'rest', 'current', 'rest', 'rest', 'rest'])
    expect(freshHeader).not.toHaveProperty('wave')
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

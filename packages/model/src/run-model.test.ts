import { describe, expect, it } from 'vitest'
import * as model from './index.ts'
import { buildRepoModel, sliceDetail, type RepoFiles, type SprintModel } from './run-model.ts'

// Every snapshot is built inline: test/no-io.test.ts scans this folder, so no file reads here.

const README = '# pod docs\n\npod docs: 2\n'

function plan(title: string, rows: string[][], opts: { status?: string; extra?: string } = {}): string {
  return [
    `# Plan: ${title}`,
    '',
    `_Generated: 2026-10-18 · Status: ${opts.status ?? 'active'} · Grilled-with: grilling_`,
    opts.extra ?? '',
    '',
    '## Sprint sequence',
    '',
    '| Sprint | Goal | Status | Depends on |',
    '|--------|------|--------|------------|',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    '',
    '## Look',
  ].join('\n')
}

type Board = [wave: number, code: string, pr: string, status: string, deps?: string][]

function sprint(slug: string, board: Board, opts: { from?: string; status?: string } = {}): string {
  const from = opts.from === undefined ? '' : `From plan: pod-docs/plans/${opts.from}.md · `
  return [
    `# Sprint: ${slug}`,
    '',
    `_${from}Slug: ${slug} · Status: ${opts.status ?? 'active'} · Generated: 2026-10-18_`,
    '',
    '## Status board',
    '',
    '| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |',
    '|------|-------|-------|--------|----|--------|------------|------------|',
    ...board.map(([w, code, pr, status, deps]) =>
      `| ${w} | ${code} | Title ${code} | ${slug}-${code} | ${pr} | ${status} | medium | ${deps ?? '—'} |`,
    ),
    '',
    '## Shared contract',
  ].join('\n')
}

const sprintOf = (files: RepoFiles, planSlug: string, sprintSlug: string): SprintModel | undefined =>
  buildRepoModel(files)
    .plans.find((p) => p.slug === planSlug)
    ?.sprints.find((s) => s.slug === sprintSlug)

describe('buildRepoModel', () => {
  it('unsupported version parses nothing', () => {
    const files: RepoFiles = {
      'pod-docs/README.md': '# pod docs\n\npod docs: 3\n',
      'pod-docs/plans/alpha.md': plan('Alpha', [['one', 'goal', 'active', '—']]),
      'pod-docs/sprints/one.md': sprint('one', [[1, 'A1', '—', 'pending']], { from: 'alpha' }),
      'pod-docs/handoff-queue.md': '- `[2026-10-18 · BLOCKED · engineer → orchestrator · plan: alpha]` stuck **Resolution:** pending\n',
    }
    expect(buildRepoModel(files)).toEqual({ docs: { supported: false, version: 3 }, plans: [], queue: [] })
    // No README at all reads the same way, with no version.
    const { 'pod-docs/README.md': _readme, ...noReadme } = files
    expect(buildRepoModel(noReadme)).toEqual({ docs: { supported: false, version: undefined }, plans: [], queue: [] })
  })

  it('reads every plan file, sorted by slug, ignoring other files', () => {
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/zeta.md': plan('Zeta', []),
      'pod-docs/plans/archive/beta.md': plan('Beta', [], { status: 'archived' }),
      'pod-docs/plans/alpha.md': plan('Alpha', []),
      'pod-docs/plans/.gitkeep': '',
      'pod-docs/plans/notes.txt': '# Plan: Not a plan',
      'pod-docs/plans/deeper/nested.md': plan('Nested', []),
    }
    const plans = buildRepoModel(files).plans
    expect(plans.map((p) => [p.slug, p.title, p.status])).toEqual([
      ['alpha', 'Alpha', 'active'],
      ['beta', 'Beta', 'archived'],
      ['zeta', 'Zeta', 'active'],
    ])
  })

  it('same plan slug in plans and plans/archive → the archived copy', () => {
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha live', []),
      'pod-docs/plans/archive/alpha.md': plan('Alpha archived', [], { status: 'archived' }),
    }
    const plans = buildRepoModel(files).plans
    expect(plans).toHaveLength(1)
    expect(plans[0]?.title).toBe('Alpha archived')
  })

  it('sprint docs join their plan', () => {
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', [['by-from', 'g', 'active', '—']]),
      'pod-docs/plans/beta.md': plan('Beta', [['by-table', 'g', 'active', '—']]),
      // From plan names alpha, though beta's table doesn't matter here.
      'pod-docs/sprints/by-from.md': sprint('by-from', [[1, 'A1', '—', 'pending']], { from: 'alpha' }),
      // No From plan: joins the plan whose table lists it.
      'pod-docs/sprints/by-table.md': sprint('by-table', [[1, 'B1', '—', 'pending']]),
      // From plan names alpha, but alpha's table doesn't list it: still joins alpha, after its table rows.
      'pod-docs/sprints/extra.md': sprint('extra', [[1, 'E1', '—', 'pending']], { from: 'alpha' }),
      // Matches no plan: dropped.
      'pod-docs/sprints/orphan.md': sprint('orphan', [[1, 'O1', '—', 'pending']]),
      // Names a plan that doesn't exist: dropped too, even if a table lists it.
      'pod-docs/sprints/ghost.md': sprint('ghost', [[1, 'G1', '—', 'pending']], { from: 'missing' }),
    }
    const plans = buildRepoModel(files).plans
    const alpha = plans.find((p) => p.slug === 'alpha')
    const beta = plans.find((p) => p.slug === 'beta')
    expect(alpha?.sprints.map((s) => [s.slug, s.hasDoc])).toEqual([
      ['by-from', true],
      ['extra', true],
    ])
    expect(beta?.sprints.map((s) => [s.slug, s.hasDoc])).toEqual([['by-table', true]])
    const all = plans.flatMap((p) => p.sprints.map((s) => s.slug))
    expect(all).not.toContain('orphan')
    expect(all).not.toContain('ghost')
    expect(alpha?.sprints[0]?.waves[0]?.slices[0]?.code).toBe('A1')
  })

  it('archived copy wins', () => {
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', [['one', 'g', 'active', '—']]),
      'pod-docs/sprints/one.md': sprint('one', [[1, 'LIVE', '—', 'pending']], { from: 'alpha' }),
      'pod-docs/sprints/archive/one.md': sprint('one', [[1, 'ARCH', '#4', 'done']], { from: 'alpha', status: 'archived' }),
    }
    const one = sprintOf(files, 'alpha', 'one')
    expect(one?.isArchived).toBe(true)
    expect(one?.status).toBe('done')
    expect(one?.waves[0]?.slices.map((s) => s.code)).toEqual(['ARCH'])
    expect(buildRepoModel(files).plans[0]?.sprints).toHaveLength(1)
  })

  it('sprint status rules', () => {
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', [
        ['row-done', 'g', 'done', '—'],
        ['archived-doc', 'g', 'active', '—'],
        ['row-active', 'g', 'active', '—'],
        ['live-doc', 'g', 'planned', '—'],
        ['row-planned', 'g', 'planned', '—'],
        ['odd', 'g', 'someday', '—'],
      ]),
      'pod-docs/sprints/archive/archived-doc.md': sprint('archived-doc', [[1, 'A1', '#1', 'done']]),
      'pod-docs/sprints/live-doc.md': sprint('live-doc', [[1, 'L1', '—', 'pending']]),
    }
    const alpha = buildRepoModel(files).plans[0]
    expect(alpha?.sprints.map((s) => [s.slug, s.status, s.hasDoc, s.isArchived])).toEqual([
      ['row-done', 'done', false, false],
      ['archived-doc', 'done', true, true],
      ['row-active', 'active', false, false],
      ['live-doc', 'active', true, false],
      ['row-planned', 'planned', false, false],
      ['odd', 'unknown', false, false],
    ])
    // A row with no doc has no waves.
    expect(alpha?.sprints[0]?.waves).toEqual([])
    expect(alpha?.sprints.find((s) => s.slug === 'row-done')?.goal).toBe('g')
  })

  it('waves and slices: grouped by wave, ascending, table order, PR refs and dependsOn', () => {
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', [['one', 'g', 'active', '—']]),
      'pod-docs/sprints/one.md': sprint(
        'one',
        [
          [2, 'U1', '[#77](https://github.com/o/r/pull/77) merged', 'merged', 'L1'],
          [1, 'L1', '#76', 'merged'],
          [1, 'H1', 'https://github.com/o/r/pull/12', 'pushed'],
          [3, 'T1', '—', 'pending', '`H1`, M9'],
          [2, 'M1', 'skipped — verification failed', 'blocked', 'H1, L1'],
        ],
        { from: 'alpha' },
      ),
    }
    const one = sprintOf(files, 'alpha', 'one')
    expect(one?.waves.map((w) => [w.wave, w.slices.map((s) => s.code)])).toEqual([
      [1, ['L1', 'H1']],
      [2, ['U1', 'M1']],
      [3, ['T1']],
    ])
    const slices = Object.fromEntries((one?.waves ?? []).flatMap((w) => w.slices).map((s) => [s.code, s]))
    expect(slices.L1).toEqual({
      code: 'L1',
      title: 'Title L1',
      branch: 'one-L1',
      status: 'merged',
      confidence: 'medium',
      pr: { state: 'merged', number: 76 },
      dependsOn: [],
      filesOwned: [],
    })
    expect(slices.H1?.pr).toEqual({ state: 'open', number: 12, url: 'https://github.com/o/r/pull/12' })
    expect(slices.U1?.pr).toEqual({ state: 'merged', number: 77, url: 'https://github.com/o/r/pull/77' })
    expect(slices.U1?.dependsOn).toEqual(['L1'])
    expect(slices.M1?.pr.state).toBe('skipped')
    expect(slices.M1?.dependsOn).toEqual(['H1', 'L1'])
    // A code that matches no slice on this board is kept as written.
    expect(slices.T1?.dependsOn).toEqual(['H1', 'M9'])
    expect(slices.T1?.pr).toEqual({ state: 'none' })
  })

  it('a board with no Depends on column gives dependsOn []', () => {
    const doc = [
      '_From plan: pod-docs/plans/alpha.md · Slug: one · Status: active_',
      '',
      '| Wave | Slice | Title | Branch | PR | Status |',
      '|---|---|---|---|---|---|',
      '| 1 | A1 | t | b | #3 | done |',
    ].join('\n')
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', [['one', 'g', 'active', '—']]),
      'pod-docs/sprints/one.md': doc,
    }
    const slice = sprintOf(files, 'alpha', 'one')?.waves[0]?.slices[0]
    expect(slice?.dependsOn).toEqual([])
    expect(slice?.confidence).toBe('—')
    expect(slice?.pr).toEqual({ state: 'merged', number: 3 })
  })

  it('current sprint and wave', () => {
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      // Mid-run: first sprint done, second mid-wave-2, third planned with no doc.
      'pod-docs/plans/mid.md': plan('Mid', [
        ['m-one', 'g', 'done', '—'],
        ['m-two', 'g', 'active', 'm-one'],
        ['m-three', 'g', 'planned', 'm-two'],
      ]),
      'pod-docs/sprints/archive/m-one.md': sprint('m-one', [[1, 'A1', '#1', 'done']], { from: 'mid' }),
      'pod-docs/sprints/m-two.md': sprint(
        'm-two',
        [
          [1, 'B1', '#2', 'merged'],
          [1, 'B2', '#2 merged', 'pushed'],
          [2, 'C1', '#3', 'done'],
          [2, 'C2', '—', 'pending'],
          [3, 'D1', '—', 'pending'],
        ],
        { from: 'mid' },
      ),
      // All done.
      'pod-docs/plans/fin.md': plan('Fin', [['f-one', 'g', 'done', '—']]),
      'pod-docs/sprints/archive/f-one.md': sprint('f-one', [[1, 'A1', '#1', 'done']], { from: 'fin' }),
      // Archived plan, even with a sprint row not done.
      'pod-docs/plans/old.md': plan('Old', [['o-one', 'g', 'planned', '—']], { status: 'archived' }),
      // Planned first sprint with no doc.
      'pod-docs/plans/new.md': plan('New', [['n-one', 'g', 'planned', '—']]),
      // Active sprint whose doc has no slices yet.
      'pod-docs/plans/bare.md': plan('Bare', [['b-one', 'g', 'active', '—']]),
      'pod-docs/sprints/b-one.md': sprint('b-one', [], { from: 'bare' }),
    }
    const plans = Object.fromEntries(buildRepoModel(files).plans.map((p) => [p.slug, p]))
    expect(plans.mid?.currentSprint).toBe('m-two')
    const sprints = Object.fromEntries((plans.mid?.sprints ?? []).map((s) => [s.slug, s]))
    expect(sprints['m-two']?.currentWave).toBe(2)
    expect(sprints['m-one']).not.toHaveProperty('currentWave')
    expect(sprints['m-three']).not.toHaveProperty('currentWave')
    expect(plans.fin).not.toHaveProperty('currentSprint')
    expect(plans.fin?.sprints[0]).not.toHaveProperty('currentWave')
    expect(plans.old).not.toHaveProperty('currentSprint')
    expect(plans.new?.currentSprint).toBe('n-one')
    expect(plans.new?.sprints[0]).not.toHaveProperty('currentWave')
    expect(plans.bare?.currentSprint).toBe('b-one')
    expect(plans.bare?.sprints[0]).not.toHaveProperty('currentWave')
  })

  it('a blocked or skipped slice keeps its wave current, even with a merged PR cell', () => {
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', [['one', 'g', 'active', '—']]),
      'pod-docs/sprints/one.md': sprint(
        'one',
        [
          [1, 'A1', '#1 merged', 'blocked'],
          [2, 'B1', '—', 'pending'],
        ],
        { from: 'alpha' },
      ),
    }
    expect(sprintOf(files, 'alpha', 'one')?.currentWave).toBe(1)
  })

  it('queue entries attach to plans', () => {
    const queue = [
      '# Handoff Queue',
      '',
      '- `[2026-10-18 · PENDING · engineer → human · plan: alpha · sprint: b-one]` by plan wins **Resolution:** pending',
      '- `[2026-10-18 · BLOCKED · engineer → orchestrator · sprint: a-one · slice: A1]` by sprint **Resolution:** pending',
      '- `[2026-10-18 · PENDING · engineer → orchestrator · sprint: b-one]` beta by sprint **Resolution:** pending',
      '- `[2026-10-18 · PENDING · orchestrator → human]` names neither **Resolution:** pending',
      '- `[2026-10-18 · PENDING · reviewer → human · plan: alpha]` resolved **Resolution:** 2026-10-18 — fixed',
      '- `[2026-10-18 · SOLVED · engineer → human · sprint: a-one]` solved **Resolution:** pending',
      '- `[2026-10-18 · PENDING · engineer → human · plan: nowhere]` unknown plan **Resolution:** pending',
      '- `[2026-10-18 · PENDING · engineer → human · sprint: nowhere]` unknown sprint **Resolution:** pending',
    ].join('\n')
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', [['a-one', 'g', 'active', '—']]),
      'pod-docs/plans/beta.md': plan('Beta', [['b-one', 'g', 'planned', '—']]),
      'pod-docs/handoff-queue.md': queue,
    }
    const repo = buildRepoModel(files)
    expect(repo.queue.map((e) => [e.body, e.needsYou])).toEqual([
      ['by plan wins', true],
      ['by sprint', true],
      ['beta by sprint', false],
      ['names neither', true],
      ['resolved', false],
      ['solved', false],
      ['unknown plan', true],
      ['unknown sprint', true],
    ])
    expect(repo.queue[1]).toMatchObject({ type: 'BLOCKED', sprint: 'a-one', slice: 'A1', isPending: true })
    const [alpha, beta] = repo.plans
    expect(alpha?.queue.map((e) => e.body)).toEqual(['by plan wins', 'by sprint', 'resolved', 'solved'])
    expect(beta?.queue.map((e) => e.body)).toEqual(['beta by sprint'])
    expect(alpha?.queue[0]?.needsYou).toBe(true)
  })

  it("an orchestrator's untagged hand-back joins the plan it names as complete", () => {
    const entry = (route: string, tags: string, body: string) => `- \`[2026-10-20 · PENDING · ${route}${tags}]\` ${body} **Resolution:** pending`
    const queue = [
      '# Handoff Queue',
      '',
      entry('orchestrator → human', '', 'plan alpha complete — final PR https://github.com/o/r/pull/9, review pass, 2 open entries.'),
      entry('orchestrator → human', '', 'Plan `beta` complete — final PR https://github.com/o/r/pull/8, review pass.'),
      // Not a hand-back of alpha: another slug that starts with it, the words mid-body, another sender, or tagged elsewhere.
      entry('orchestrator → human', '', 'plan alpha-two complete — final PR https://github.com/o/r/pull/7.'),
      entry('orchestrator → human', '', 'note: plan alpha complete soon.'),
      entry('engineer → human', '', 'plan alpha complete — final PR https://github.com/o/r/pull/6.'),
      entry('orchestrator → human', ' · plan: beta', 'plan alpha complete — final PR https://github.com/o/r/pull/5.'),
      entry('orchestrator → human', ' · sprint: b-one', 'plan alpha complete — final PR https://github.com/o/r/pull/4.'),
    ].join('\n')
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', [['a-one', 'g', 'done', '—']]),
      'pod-docs/plans/beta.md': plan('Beta', [['b-one', 'g', 'done', '—']]),
      'pod-docs/handoff-queue.md': queue,
    }
    const [alpha, beta] = buildRepoModel(files).plans
    expect(alpha?.queue.map((e) => e.body)).toEqual(['plan alpha complete — final PR https://github.com/o/r/pull/9, review pass, 2 open entries.'])
    expect(beta?.queue.map((e) => /pull\/(\d+)/.exec(e.body)?.[1])).toEqual(['8', '5', '4'])
  })

  it('a missing queue file gives an empty queue', () => {
    const files: RepoFiles = { 'pod-docs/README.md': README, 'pod-docs/plans/alpha.md': plan('Alpha', []) }
    const repo = buildRepoModel(files)
    expect(repo.queue).toEqual([])
    expect(repo.plans[0]?.queue).toEqual([])
  })

  it('plan extras', () => {
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', []),
      'pod-docs/plans/beta.md': plan('Beta', [], { extra: 'Port base: 3200' }),
    }
    const [alpha, beta] = buildRepoModel(files).plans
    expect(alpha).not.toHaveProperty('portBase')
    expect(alpha?.go).toBe('unknown')
    expect(beta?.portBase).toBe(3200)
    expect(beta?.go).toBe('unknown')
  })

  it('tolerates malformed docs', () => {
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/empty.md': '',
      'pod-docs/plans/random.md': '\u0000 lorem | ipsum |\n|||\n# \n| Sprint |\n',
      'pod-docs/plans/no-body.md': '# Plan: No body\n\n| Sprint | Goal | Status |\n|---|---|---|\n',
      'pod-docs/plans/thin.md': '# Plan: Thin\n\n| Sprint |\n|---|\n| thin-one |\n| |\n',
      'pod-docs/sprints/thin-one.md': [
        '_From plan: pod-docs/plans/thin.md · Slug: thin-one · Status: active_',
        '| Wave | Slice |',
        '|---|---|',
        '| x | A1 |',
        '| 2 |',
        '|',
      ].join('\n'),
      'pod-docs/sprints/empty.md': '',
      'pod-docs/sprints/archive/random.md': 'Slug: \n| Wave\n|',
      'pod-docs/handoff-queue.md': '- `[` broken\n- [only date]\n- `[2026 · PENDING]` no route **Resolution:** pending\n',
    }
    let repo: ReturnType<typeof buildRepoModel> | undefined
    expect(() => {
      repo = buildRepoModel(files)
    }).not.toThrow()
    const plans = Object.fromEntries((repo?.plans ?? []).map((p) => [p.slug, p]))
    expect(Object.keys(plans)).toEqual(['empty', 'no-body', 'random', 'thin'])
    expect(plans.empty).toMatchObject({ title: 'empty', sprints: [], queue: [], go: 'unknown' })
    expect(plans['no-body']?.sprints).toEqual([])
    // A sprint row with an empty Sprint cell is skipped.
    expect(plans.thin?.sprints.map((s) => s.slug)).toEqual(['thin-one'])
    const thin = plans.thin?.sprints[0]
    expect(thin?.status).toBe('active')
    expect(thin?.goal).toBe('')
    const slices = (thin?.waves ?? []).flatMap((w) => w.slices)
    expect(slices[0]).toMatchObject({ code: 'A1', title: '', branch: '', dependsOn: [], pr: { state: 'none' } })
    expect(repo?.queue.every((e) => typeof e.needsYou === 'boolean')).toBe(true)
  })

  it('never throws on random text in every file', () => {
    const junk = ['', '|', '| Wave |\n|', '# Plan:\n_Status: _', 'Slug: x\nFrom plan: pod-docs/plans/x.md', '\r\n\r\n| Sprint | Status |\r\n|-|-|\r\n| x | done |']
    for (const a of junk) {
      for (const b of junk) {
        const files: RepoFiles = {
          'pod-docs/README.md': README,
          'pod-docs/plans/x.md': a,
          'pod-docs/sprints/x.md': b,
          'pod-docs/sprints/archive/x.md': a,
          'pod-docs/handoff-queue.md': b,
        }
        expect(() => buildRepoModel(files)).not.toThrow()
      }
    }
  })

  it('windows path keys', () => {
    const slash: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', [['one', 'g', 'done', '—'], ['two', 'g', 'active', '—']]),
      'pod-docs/plans/archive/beta.md': plan('Beta', [], { status: 'archived' }),
      'pod-docs/sprints/archive/one.md': sprint('one', [[1, 'A1', '#1', 'done']], { from: 'alpha' }),
      'pod-docs/sprints/two.md': sprint('two', [[1, 'B1', '—', 'pending']], { from: 'alpha' }),
      'pod-docs/handoff-queue.md': '- `[2026-10-18 · PENDING · engineer → human · sprint: two]` hi **Resolution:** pending\n',
    }
    const backslash = Object.fromEntries(Object.entries(slash).map(([k, v]) => [k.replaceAll('/', '\\'), v]))
    const expected = buildRepoModel(slash)
    expect(expected.plans.map((p) => p.slug)).toEqual(['alpha', 'beta'])
    expect(buildRepoModel(backslash)).toEqual(expected)
  })

  it('per-slice detail fields', () => {
    const detail = [
      '## Per-slice detail',
      '',
      '### A1: Title A1',
      '- **Scope:** Build it. **Model:** inline mentions are not the field.',
      '- **Files owned:** `src/a.ts` (new), `src/a.test.ts` (new), `pod-docs/x.md`',
      '- **Success criteria:**',
      '  - `[test] something — src/a.test.ts › works`',
      '- **Depends on:** —',
      '- **One-way door:** none. It only reads files.',
      '- **Model:** Opus',
      '',
      '### A10: A longer code that starts with A1',
      '- **Model:** haiku',
      '- **Files owned:** `src/ten.ts`',
      '',
      '### B1: Title B1',
      '- **Files owned:** src/b.ts (new), src/b.test.ts ,  docs/b.md',
      '- **One-way door:** drops the old table; undo: restore from backup',
      '- **Model:** sonnet 4.5',
      '',
      '### B2: Title B2',
      '- **Files owned:**',
      '  - **Code:** `src/c.ts`, `src/d.ts` (new)',
      '  - **Tests:** `src/c.test.ts` (new)',
      '- **One-way door:** None',
      '',
      '### C1: Title C1',
      '- **Files owned:** —',
      '- **One-way door:** ',
      '- **Model:**',
      '',
      '## Sprint summary',
      '- **Model:** sonnet',
    ].join('\n')
    const doc = sprint('one', [
      [1, 'A1', '—', 'pending'],
      [1, 'B1', '—', 'pending'],
      [1, 'B2', '—', 'pending'],
      [2, 'C1', '—', 'pending'],
      [2, 'D1', '—', 'pending'],
    ], { from: 'alpha' }) + '\n\n' + detail
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', [['one', 'g', 'active', '—']]),
      'pod-docs/sprints/one.md': doc,
    }
    const slices = Object.fromEntries((sprintOf(files, 'alpha', 'one')?.waves ?? []).flatMap((w) => w.slices).map((s) => [s.code, s]))
    expect(slices.A1).toMatchObject({ model: 'opus', filesOwned: ['src/a.ts', 'src/a.test.ts', 'pod-docs/x.md'] })
    expect(slices.A1).not.toHaveProperty('oneWayDoor')
    expect(slices.B1).toMatchObject({
      model: 'sonnet',
      filesOwned: ['src/b.ts', 'src/b.test.ts', 'docs/b.md'],
      oneWayDoor: 'drops the old table; undo: restore from backup',
    })
    expect(slices.B2).toMatchObject({ filesOwned: ['src/c.ts', 'src/d.ts', 'src/c.test.ts'] })
    expect(slices.B2).not.toHaveProperty('model')
    expect(slices.B2).not.toHaveProperty('oneWayDoor')
    // Empty fields read as absent; a dash names no file; the summary's lines belong to no slice.
    expect(slices.C1?.filesOwned).toEqual([])
    expect(slices.C1).not.toHaveProperty('model')
    expect(slices.C1).not.toHaveProperty('oneWayDoor')
    // No section → absent or [].
    expect(slices.D1?.filesOwned).toEqual([])
    expect(slices.D1).not.toHaveProperty('model')
    expect(slices.D1).not.toHaveProperty('oneWayDoor')

    // A doc with no detail at all still gives [] for every slice.
    const bare: RepoFiles = { ...files, 'pod-docs/sprints/one.md': sprint('one', [[1, 'A1', '—', 'pending']], { from: 'alpha' }) }
    expect(sprintOf(bare, 'alpha', 'one')?.waves[0]?.slices[0]?.filesOwned).toEqual([])
  })

  it('files named in a parenthetical after an item are not owned files', () => {
    // The E1 and W1 lines of the board-engineer sprint doc, as written.
    const md = [
      '### W1: Screen 2: wave board, dependency lines, critical path, filters, routes',
      '',
      '- **Files owned:** `packages/web/src/screens/board/**` (new, incl. `board-view.ts`, `board-view.test.ts`, `geometry.ts`, `geometry.test.ts`, `BoardScreen.tsx`, `board.css`), `packages/web/src/selection.ts`, `packages/web/src/selection.test.ts`, `packages/web/src/App.tsx`, `packages/web/src/screens/runs/RunsScreen.tsx`, `packages/web/src/screens/runs/runs.css`, `pod-docs/feature-details/wave-board.md` (new), `pod-docs/codebase-structure.md`',
      '',
      '### E1: Screen 3: engineer view with a live tool timeline',
      '',
      '- **Files owned:** `packages/web/src/screens/engineer/**` (new, incl. `view.ts`, `view.test.ts`, `EngineerView.tsx`, `engineer.css`), `packages/web/src/timeline-loader.ts` (new), `packages/web/src/timeline-loader.test.ts` (new), `packages/web/src/screens/board/BoardScreen.tsx`, `pod-docs/feature-details/engineer-view.md` (new), `pod-docs/codebase-structure.md`',
      '',
      '### P1: Paths with brackets',
      '',
      '- **Files owned:** `app/(group)/page.tsx` (new), `src/x.ts` (shared (with `y.ts`) for now)',
      '',
      '### P2: No backticks',
      '',
      '- **Files owned:** src/** (incl. a.ts, b.ts), src/c.ts (new), app/(group)/d.ts',
      '',
      '### P3: Unclosed bracket',
      '',
      '- **Files owned:** `src/a.ts` (new, `src/b.ts`',
    ].join('\n')
    expect(sliceDetail(md, 'W1').filesOwned).toEqual([
      'packages/web/src/screens/board/**',
      'packages/web/src/selection.ts',
      'packages/web/src/selection.test.ts',
      'packages/web/src/App.tsx',
      'packages/web/src/screens/runs/RunsScreen.tsx',
      'packages/web/src/screens/runs/runs.css',
      'pod-docs/feature-details/wave-board.md',
      'pod-docs/codebase-structure.md',
    ])
    expect(sliceDetail(md, 'E1').filesOwned).toEqual([
      'packages/web/src/screens/engineer/**',
      'packages/web/src/timeline-loader.ts',
      'packages/web/src/timeline-loader.test.ts',
      'packages/web/src/screens/board/BoardScreen.tsx',
      'pod-docs/feature-details/engineer-view.md',
      'pod-docs/codebase-structure.md',
    ])
    // Brackets inside a path are part of it; a nested parenthetical drops out whole.
    expect(sliceDetail(md, 'P1').filesOwned).toEqual(['app/(group)/page.tsx', 'src/x.ts'])
    // Without backticks, a parenthetical's commas don't split off files.
    expect(sliceDetail(md, 'P2').filesOwned).toEqual(['src/**', 'src/c.ts', 'app/(group)/d.ts'])
    // An unclosed bracket doesn't swallow the files after it.
    expect(sliceDetail(md, 'P3').filesOwned).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('currentWave on a done sprint', () => {
    const board: Board = [
      [1, 'A1', '#1 merged', 'merged'],
      [2, 'B1', '—', 'blocked'],
      [2, 'B2', '—', 'skipped'],
    ]
    const files: RepoFiles = {
      'pod-docs/README.md': README,
      'pod-docs/plans/alpha.md': plan('Alpha', [
        ['archived-one', 'g', 'active', '—'],
        ['row-done', 'g', 'done', '—'],
        ['live', 'g', 'active', '—'],
      ]),
      // Archived doc → done, even with a blocked slice and an active row.
      'pod-docs/sprints/archive/archived-one.md': sprint('archived-one', board, { from: 'alpha' }),
      // Row done with a live doc → done.
      'pod-docs/sprints/row-done.md': sprint('row-done', board, { from: 'alpha' }),
      'pod-docs/sprints/live.md': sprint('live', board, { from: 'alpha' }),
    }
    const sprints = Object.fromEntries((buildRepoModel(files).plans[0]?.sprints ?? []).map((s) => [s.slug, s]))
    expect(sprints['archived-one']).toMatchObject({ status: 'done' })
    expect(sprints['archived-one']).not.toHaveProperty('currentWave')
    expect(sprints['row-done']).toMatchObject({ status: 'done' })
    expect(sprints['row-done']).not.toHaveProperty('currentWave')
    expect(sprints.live).toMatchObject({ status: 'active', currentWave: 2 })
  })

  it('public exports', () => {
    for (const name of ['buildRepoModel', 'docsVersion', 'prRef', 'sliceDeps', 'needsYou', 'planExtras', 'parsePlan', 'parseSprint', 'parseQueue', 'readTable', 'isDone']) {
      expect(typeof (model as Record<string, unknown>)[name], name).toBe('function')
    }
    for (const name of ['parseAgentTranscript', 'agentState']) {
      expect(typeof (model as Record<string, unknown>)[name], name).toBe('function')
    }
    expect(model.STALE_MS).toBe(30 * 60_000)
    expect(model.SUPPORTED_DOCS_VERSION).toBe(2)
  })
})

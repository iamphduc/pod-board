import { describe, expect, it } from 'vitest'
import type { BoardRepo } from './board.ts'
import { buildPipeline, listRuns, parseAgentTranscript, readDispatch } from './index.ts'
import { buildRepoModel, type RepoFiles } from './run-model.ts'

// Prompts and transcripts are built inline in the shape real pod dispatches use:
// test/no-io.test.ts scans this folder, so no file reads here.

const REVIEWER = [
  'Dispatched by /pod:autopilot to review the final PR of plan alpha.',
  '',
  '- **kind:** plan',
  '- **PR URL:** https://github.com/o/r/pull/15',
  '- **merge-target:** alpha',
  '- **plan:** alpha',
  '- **parent-repo path:** /r',
  '- **worktree path:** /r/.claude/worktrees/alpha-review',
  '- **dev ports:** 3010 / 3011',
  '- **browser:** agent-browser',
  '- **round:** 1',
].join('\n')

const PLANNER = 'Draft the next sprint doc for plan `alpha`. Read pod-docs/plans/alpha.md first.'

const ENGINEER = [
  '- **sprint slug:** one',
  '- **slice code:** A1',
  '- **branch name:** one-A1',
  '- **merge-target branch:** alpha',
  '',
  'Context: the sprint planner was told to draft the next sprint doc for plan `beta`.',
].join('\n')

describe('readDispatch', () => {
  it('reads the plan and round from a reviewer dispatch', () => {
    expect(readDispatch(REVIEWER, 'pod:reviewer')).toMatchObject({ plan: 'alpha', round: 1 })
  })

  it('reads the plan from a sprint planner prompt', () => {
    expect(readDispatch(PLANNER, 'pod:sprint-planner').plan).toBe('alpha')
  })

  it('reads the prose form only for sprint planners', () => {
    expect(readDispatch(ENGINEER, 'pod:engineer')).toMatchObject({ plan: undefined, sprint: 'one', slice: 'A1', branch: 'one-A1' })
    expect(readDispatch(PLANNER, 'pod:reviewer').plan).toBeUndefined()
  })

  it('keeps a plan slug field first', () => {
    expect(readDispatch('- **plan slug:** gamma\n- **plan:** alpha', 'pod:reviewer').plan).toBe('gamma')
  })

  it('reads the plan field only as a list field, not a word in prose or a queue line', () => {
    expect(readDispatch('Fix the plan: alpha is late.', 'pod:reviewer').plan).toBeUndefined()
    expect(readDispatch('`[2026-10-18 · PENDING · engineer → human · plan: alpha]` text', 'pod:reviewer').plan).toBeUndefined()
    expect(readDispatch('Plan `alpha` is next; see the plan `beta` doc.', 'pod:sprint-planner').plan).toBeUndefined()
  })

  it('accepts a backticked value', () => {
    expect(readDispatch('- **plan:** `alpha`', 'pod:reviewer').plan).toBe('alpha')
  })
})

// ---- End to end: a transcript through parseAgentTranscript, listRuns, and buildPipeline ----

const NOW = Date.UTC(2026, 9, 18, 12)
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString()
const jsonl = (...records: unknown[]) => records.map((r) => JSON.stringify(r)).join('\n') + '\n'

/** A running agent: its prompt ten minutes ago, its last turn a minute ago, not ended. */
function transcript(agentType: string, prompt: string) {
  const run = parseAgentTranscript({
    id: 'a1',
    session: 's1',
    meta: JSON.stringify({ agentType, description: 'Review plan alpha' }),
    jsonl: jsonl(
      { type: 'user', timestamp: at(10), message: { role: 'user', content: prompt } },
      {
        type: 'assistant',
        timestamp: at(1),
        message: {
          id: 'm1',
          role: 'assistant',
          model: 'claude-opus-5-5',
          stop_reason: 'tool_use',
          usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }],
        },
      },
    ),
  })
  if (!run) throw new Error('not a pod agent')
  return run
}

function planFiles(sprints: [string, string][]): RepoFiles {
  return {
    'pod-docs/README.md': '# pod docs\n\npod docs: 2\n',
    'pod-docs/plans/alpha.md': [
      '# Plan: ALPHA',
      '',
      '_Generated: 2026-10-18 · Status: active · Grilled-with: grilling_',
      '',
      '## Sprint sequence',
      '',
      '| Sprint | Goal | Status | Depends on |',
      '|--------|------|--------|------------|',
      ...sprints.map(([slug, status]) => `| ${slug} | goal of ${slug} | ${status} | — |`),
      '',
    ].join('\n'),
    'pod-docs/handoff-queue.md': '',
    'pod-docs/sprints/archive/one.md': [
      '# Sprint: one',
      '',
      '_From plan: pod-docs/plans/alpha.md · Slug: one · Status: done · Generated: 2026-10-18_',
      '',
      '## Status board',
      '',
      '| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |',
      '|------|-------|-------|--------|----|--------|------------|------------|',
      '| 1 | A1 | Title A1 | one-A1 | [#3](https://github.com/o/r/pull/3) merged | done | medium | — |',
      '',
    ].join('\n'),
  }
}

const repo = (files: RepoFiles, agentType: string, prompt: string): BoardRepo => ({
  id: 'id-r',
  name: 'r',
  path: '/r',
  source: 'registered',
  model: buildRepoModel(files),
  agents: [transcript(agentType, prompt)],
  prs: [],
  claims: [],
})

const stage = (r: BoardRepo, key: string) =>
  buildPipeline(r, 'alpha', NOW)
    ?.stages.filter((s) => s.key === key)
    .flatMap((s) => s.steps.map((x) => [x.label, x.state, x.detail]))

describe('a real-shaped dispatch, end to end', () => {
  it('keeps a plan in final review in the runs list while its reviewer runs', () => {
    const r = repo(planFiles([['one', 'done']]), 'pod:reviewer', REVIEWER)
    expect(listRuns({ generatedAt: NOW, gh: 'ok', repos: [r] }, NOW).map((x) => [x.plan, x.where, x.state])).toEqual([['alpha', 'final review', 'running']])
    expect(stage(r, 'check')?.[0]).toEqual(['Final review', 'live', 'round 1'])
  })

  it('shows a running sprint planner as drafting', () => {
    const r = repo(planFiles([['one', 'done'], ['two', 'planned']]), 'pod:sprint-planner', PLANNER)
    expect(listRuns({ generatedAt: NOW, gh: 'ok', repos: [r] }, NOW).map((x) => [x.plan, x.where, x.state])).toEqual([['alpha', 'two · drafting', 'running']])
    expect(stage(r, 'sprint:two')).toEqual([['two', 'live', 'drafting']])
  })
})

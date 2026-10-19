import { describe, expect, it } from 'vitest'
import type { RunSummary } from '@pod-board/model'
import { barTitle, emptyMessage, groupChip, rowFigures, runChip, streamChip } from './view.ts'

const run = (over: Partial<RunSummary>): RunSummary => ({ repoId: 'r', repo: 'chess-web', where: 'x', state: 'idle', ...over })

describe('screen 1 view helpers', () => {
  it('every run state gets a chip class and a label', () => {
    expect(runChip('blocked')).toEqual({ cls: 's-bad', label: 'blocked' })
    expect(runChip('needs-you')).toEqual({ cls: 's-you', label: 'needs you' })
    expect(runChip('running')).toEqual({ cls: 's-run', label: 'running' })
    expect(runChip('idle')).toEqual({ cls: 's-idle', label: 'idle' })
    expect(runChip('unsupported')).toEqual({ cls: 's-you', label: 'update pod' })
    expect(runChip('error')).toEqual({ cls: 's-bad', label: 'error' })
  })

  it('every stream state gets a chip', () => {
    expect(streamChip('live')).toEqual({ cls: 's-ok', label: 'live' })
    expect(streamChip('connecting')).toEqual({ cls: 's-idle', label: 'connecting' })
    expect(streamChip('lost')).toEqual({ cls: 's-bad', label: 'lost · retrying' })
  })

  it('log group statuses map to chips', () => {
    expect(groupChip('merged PR #41').cls).toBe('s-ok')
    expect(groupChip('merged').cls).toBe('s-ok')
    expect(groupChip('PR #42 open').cls).toBe('s-you')
    expect(groupChip('running').cls).toBe('s-run')
    expect(groupChip('blocked').cls).toBe('s-bad')
    expect(groupChip('planned').cls).toBe('s-idle')
    expect(groupChip('merged PR #41').label).toBe('merged PR #41')
  })

  it('row figures join what is known and skip the rest', () => {
    expect(rowFigures({ code: 'B1', title: 't', confidence: 'high', minutes: 22, tokens: 248_000, live: false })).toBe('high · 22 min · 248k tok')
    expect(rowFigures({ code: 'B1', title: 't', minutes: 14, live: true })).toBe('14 min')
    expect(rowFigures({ code: 'B1', title: 't', live: false })).toBe('')
    expect(rowFigures({ code: 'B1', title: 't', minutes: 0, tokens: 0, live: false })).toBe('0 min')
  })

  it('the bar title names the repo and plan', () => {
    expect(barTitle(run({ plan: 'board-read' }))).toBe('chess-web · board-read')
    expect(barTitle(run({}))).toBe('chess-web')
  })

  it('runs with no pipeline say why, and what to do', () => {
    expect(emptyMessage(run({ state: 'idle' }))).toMatch(/no active plan/i)
    expect(emptyMessage(run({ state: 'unsupported' }))).toMatch(/update pod/i)
    expect(emptyMessage(run({ state: 'error', where: 'repo folder not found' }))).toMatch(/repo folder not found/)
    expect(emptyMessage(run({ state: 'running', plan: 'p' }))).toMatch(/can.t find plan p/i)
  })
})

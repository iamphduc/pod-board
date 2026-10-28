import { describe, expect, it } from 'vitest'
import type { AnswerState } from './answer-flow.ts'
import type { MergeState } from './merge-flow.ts'
import type { NextItem } from './next-step.ts'
import type { WaitingRow } from './queue-view.ts'
import { answerAnchor, keepOpen, mergeAnchor, rowMeta, toggleOpen } from './waiting-tab.ts'

const row = (line: string, over: Partial<WaitingRow> = {}): WaitingRow => ({
  key: `0:${line}`,
  line,
  chip: { cls: 's-you', label: 'PENDING' },
  route: 'engineer → human',
  body: line,
  answerable: true,
  ...over,
})
const entry = (line: string, over: Partial<WaitingRow> = {}): NextItem => ({
  key: `entry:${line}`,
  tier: 'pending',
  status: 'needs-you',
  title: line,
  entry: row(line, over),
  action: { kind: 'answer', repoId: 'r', line },
})
const pr = (number: number): NextItem => ({
  key: `pr:${number}`,
  tier: 'merge',
  status: 'needs-you',
  title: `Merge PR #${number}`,
  action: { kind: 'merge', repoId: 'r', number },
})

const editing = (line: string, repoId = 'r'): AnswerState => ({ kind: 'editing', seq: 1, target: { repoId, line }, text: '' })
const loading = (number: number, repoId = 'r'): MergeState => ({ kind: 'loading', seq: 1, target: { repoId, number } })

describe('waiting tab', () => {
  it('open rows', () => {
    const keys = ['entry:a', 'pr:7', 'entry:b']
    // Opens, then closes, by key.
    const one = toggleOpen(new Set(), 'entry:a', keys)
    expect([...one]).toEqual(['entry:a'])
    const two = toggleOpen(one, 'pr:7', keys)
    expect([...two].sort()).toEqual(['entry:a', 'pr:7'])
    expect([...toggleOpen(two, 'entry:a', keys)]).toEqual(['pr:7'])
    // The set given is never changed.
    expect([...one]).toEqual(['entry:a'])

    // A toggle drops the keys whose item left the list, and a key not in the list doesn't open.
    expect([...toggleOpen(two, 'entry:b', ['entry:b', 'pr:7'])].sort()).toEqual(['entry:b', 'pr:7'])
    expect([...toggleOpen(new Set(), 'entry:gone', keys)]).toEqual([])

    // keepOpen prunes keys whose item left; with nothing to drop it hands back the same set, so no re-render.
    expect([...keepOpen(two, ['pr:7'])]).toEqual(['pr:7'])
    expect(keepOpen(two, keys)).toBe(two)
    expect([...keepOpen(two, [])]).toEqual([])

    // A repeated line keeps its own key: opening the second doesn't open the first.
    const twice = ['entry:x', 'entry:x#2']
    expect([...toggleOpen(new Set(), 'entry:x#2', twice)]).toEqual(['entry:x#2'])
  })

  it('row meta: route and date on one line', () => {
    expect(rowMeta(row('a', { date: '2026-10-19' }))).toBe('engineer → human · 2026-10-19')
    expect(rowMeta(row('a'))).toBe('engineer → human')
    expect(rowMeta(row('a', { route: '', date: '2026-10-19' }))).toBe('2026-10-19')
  })

  it('the answer form sits under its entry, or after the list once the entry left', () => {
    const items = [pr(7), entry('a'), entry('b')]
    expect(answerAnchor({ kind: 'idle', seq: 0 }, items, 'r')).toBeUndefined()
    expect(answerAnchor(editing('b'), items, 'r')).toBe('entry:b')
    // Another repo's form isn't shown here.
    expect(answerAnchor(editing('b', 'other'), items, 'r')).toBeUndefined()
    // Answered: the Board's line now carries the answer, so the answered row is the anchor.
    const answered = entry('b **Answer (human):** 50', { yourAnswer: 'Your answer: 50', answerable: false })
    expect(answerAnchor({ kind: 'saving', seq: 1, target: { repoId: 'r', line: 'b' }, text: '50' }, [pr(7), answered], 'r')).toBe(answered.key)
    // Gone from the list: after it, so a result is never lost.
    expect(answerAnchor(editing('b'), [pr(7)], 'r')).toBe('end')
    expect(answerAnchor(editing('b'), [], 'r')).toBe('end')
  })

  it('the merge confirm sits under its PR, or after the list once the PR left', () => {
    const items = [entry('a'), pr(7), pr(8)]
    expect(mergeAnchor({ kind: 'idle', seq: 0 }, items, 'r')).toBeUndefined()
    expect(mergeAnchor(loading(8), items, 'r')).toBe('pr:8')
    expect(mergeAnchor(loading(8, 'other'), items, 'r')).toBeUndefined()
    expect(mergeAnchor(loading(9), items, 'r')).toBe('end')
  })
})

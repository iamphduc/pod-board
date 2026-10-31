import { describe, expect, it } from 'vitest'
import type { AnswerState } from './answer-flow.ts'
import type { MergeState } from './merge-flow.ts'
import type { NextItem } from './next-step.ts'
import type { WaitingRow } from './queue-view.ts'
import type { EntryKind } from './entry-kind.ts'
import { answerAnchor, groupOpen, kindChip, keepOpen, mergeAnchor, replyGhost, replySeen, rowMeta, toggleOpen, waitGroups } from './waiting-tab.ts'

const row = (line: string, over: Partial<WaitingRow> = {}): WaitingRow => ({
  key: `0:${line}`,
  line,
  chip: { cls: 's-you', label: 'PENDING' },
  route: 'engineer → human',
  body: line,
  text: line,
  kind: 'other',
  kindLabel: 'other',
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
/** A pending entry of the given kind. */
const kinded = (line: string, kind: EntryKind): NextItem => entry(line, { kind, kindLabel: kind })
const info = (line: string): NextItem => ({ ...entry(line, { yourAnswer: 'Your answer: x', answerable: false }), tier: 'info', status: 'idle', action: { kind: 'none' } })
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

  it('a sent reply keeps its row until you close its result', () => {
    const target = { repoId: 'r', run: 'alpha' }
    const reply: NextItem = { key: 'reply:alpha', tier: 'reply', status: 'ready', title: 'Send continue', action: { kind: 'reply', panel: { target, rows: [] } } }
    expect(replySeen([pr(7), reply])).toEqual({ key: 'reply:alpha', target })
    expect(replySeen([pr(7)])).toBeUndefined()
    // While listed, the row is the item itself; once it left, the last one seen stays as a ghost row.
    expect(replyGhost([pr(7), reply], { key: 'reply:alpha', target })).toBeUndefined()
    expect(replyGhost([pr(7)], { key: 'reply:alpha', target })).toEqual({ key: 'reply:alpha', target })
    expect(replyGhost([pr(7)], undefined)).toBeUndefined()
  })

  it('the kind dot and word: amber now and before, blue decision, grey other and someday', () => {
    expect(kindChip(row('a', { kind: 'now', kindLabel: 'now (pod side)' }))).toEqual({ cls: 's-you', label: 'now (pod side)' })
    expect(kindChip(row('a', { kind: 'before', kindLabel: 'before hosting' }))).toEqual({ cls: 's-you', label: 'before hosting' })
    expect(kindChip(row('a', { kind: 'decision', kindLabel: 'decision' }))).toEqual({ cls: 's-run', label: 'decision' })
    expect(kindChip(row('a', { kind: 'someday', kindLabel: 'someday' }))).toEqual({ cls: 's-idle', label: 'someday' })
    expect(kindChip(row('a'))).toEqual({ cls: 's-idle', label: 'other' })
    // A BLOCKED entry with no kind word reads blocked, never other.
    expect(kindChip(row('a', { chip: { cls: 's-bad', label: 'BLOCKED' } }))).toEqual({ cls: 's-bad', label: 'blocked' })
  })

  it('groups: the urgent rows, then pending by kind with a count, then the rest', () => {
    const blocked: NextItem = { ...entry('b0'), tier: 'blocked', status: 'blocked' }
    const items = [blocked, pr(7), kinded('n', 'now'), kinded('d1', 'decision'), kinded('d2', 'decision'), kinded('x', 'before'), kinded('o', 'other'), kinded('s', 'someday'), info('i')]
    const groups = waitGroups(items)
    expect(groups.map((g) => [g.key, g.label, g.items.map((i) => i.key), g.startsOpen])).toEqual([
      ['group:top', undefined, ['entry:b0', 'pr:7'], true],
      ['group:now', 'Now', ['entry:n'], true],
      ['group:decision', 'Decisions', ['entry:d1', 'entry:d2'], true],
      ['group:before', 'Before a step', ['entry:x'], true],
      ['group:other', 'Other', ['entry:o'], true],
      ['group:someday', 'Someday', ['entry:s'], false],
      ['group:info', 'No answer needed', ['entry:i'], true],
    ])
    // Every item lands in one group, in list order.
    expect(groups.flatMap((g) => g.items)).toEqual(items)
    // Empty groups are left out; the top group too.
    expect(waitGroups([kinded('s', 'someday')]).map((g) => g.key)).toEqual(['group:someday'])
    expect(waitGroups([])).toEqual([])
  })

  it('someday starts closed; its state is kept by key across Boards', () => {
    const items = [kinded('d', 'decision'), kinded('s', 'someday')]
    const [decision, someday] = waitGroups(items)
    const keys = waitGroups(items).map((g) => g.key)
    const none = new Set<string>()
    expect(groupOpen(decision!, none, [])).toBe(true)
    expect(groupOpen(someday!, none, [])).toBe(false)
    // A toggle flips a group from its start state, both ways.
    const flipped = toggleOpen(none, 'group:someday', keys)
    expect(groupOpen(someday!, flipped, [])).toBe(true)
    expect(groupOpen(decision!, toggleOpen(none, 'group:decision', keys), [])).toBe(false)
    // A new Board with the same groups keeps the state; a new entry in the group doesn't reset it.
    const next = waitGroups([...items, kinded('s2', 'someday')])
    const kept = keepOpen(flipped, next.map((g) => g.key))
    expect(kept).toBe(flipped)
    expect(groupOpen(next[1]!, kept, [])).toBe(true)
    // The group left (its last entry answered); when it comes back it starts closed again.
    const gone = keepOpen(flipped, waitGroups([kinded('d', 'decision')]).map((g) => g.key))
    expect(groupOpen(someday!, gone, [])).toBe(false)
  })

  it('a closed group opens while it holds the open answer form or merge confirm', () => {
    const [someday] = waitGroups([kinded('s', 'someday')])
    expect(groupOpen(someday!, new Set(), ['entry:s'])).toBe(true)
    expect(groupOpen(someday!, new Set(), [undefined, 'end', 'entry:other'])).toBe(false)
  })
})

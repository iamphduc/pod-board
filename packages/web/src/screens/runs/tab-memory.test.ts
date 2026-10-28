import { describe, expect, it } from 'vitest'
import { readTab, saveTab, shownTab, TAB_KEY, toggleTab, type TabStorage } from './tab-memory.ts'

/** A plain-object storage; `fail` makes each call throw, as a browser with blocked site data does. */
function store(initial: Record<string, string> = {}, fail = false): TabStorage & { data: Record<string, string> } {
  const data = { ...initial }
  const guard = () => {
    if (fail) throw new Error('SecurityError')
  }
  return {
    data,
    getItem: (k) => (guard(), data[k] ?? null),
    setItem: (k, v) => {
      guard()
      data[k] = v
    },
    removeItem: (k) => {
      guard()
      delete data[k]
    },
  }
}

describe('tab memory', () => {
  it('remembers one open tab', () => {
    expect(TAB_KEY).toBe('pod-board-tab')

    // Read: each known value; nothing stored, an unknown value, or a throwing storage → closed.
    for (const tab of ['waiting', 'plan', 'log'] as const) expect(readTab(store({ [TAB_KEY]: tab }))).toBe(tab)
    expect(readTab(store())).toBeUndefined()
    expect(readTab(store({ [TAB_KEY]: 'board' }))).toBeUndefined()
    expect(readTab(store({ [TAB_KEY]: '' }))).toBeUndefined()
    expect(readTab(store({ [TAB_KEY]: 'Plan' }))).toBeUndefined()
    expect(readTab(store({ [TAB_KEY]: 'plan' }, true))).toBeUndefined()
    expect(readTab(undefined)).toBeUndefined()
    expect(readTab(null)).toBeUndefined()

    // Save: a tab is stored under the key; undefined removes the key; other keys stay.
    const s = store({ 'pod-board-theme': 'dark' })
    saveTab(s, 'plan')
    expect(s.data).toEqual({ 'pod-board-theme': 'dark', [TAB_KEY]: 'plan' })
    saveTab(s, 'log')
    expect(readTab(s)).toBe('log')
    saveTab(s, undefined)
    expect(s.data).toEqual({ 'pod-board-theme': 'dark' })
    // A throwing storage (set or remove), or none, is ignored.
    expect(() => saveTab(store({}, true), 'plan')).not.toThrow()
    expect(() => saveTab(store({ [TAB_KEY]: 'plan' }, true), undefined)).not.toThrow()
    expect(() => saveTab(undefined, 'plan')).not.toThrow()

    // Toggle: clicking the open tab closes it; another tab, or none open, opens the clicked one.
    expect(toggleTab('plan', 'plan')).toBeUndefined()
    expect(toggleTab('plan', 'log')).toBe('log')
    expect(toggleTab(undefined, 'waiting')).toBe('waiting')

    // Shown: the stored tab, except an engineer's view always shows Log, and a plan-less row has no Plan tab.
    expect(shownTab('plan', { view: 'pipeline', hasPlan: true })).toBe('plan')
    expect(shownTab('waiting', { view: 'pipeline', hasPlan: false })).toBe('waiting')
    expect(shownTab('log', { view: 'pipeline', hasPlan: false })).toBe('log')
    expect(shownTab(undefined, { view: 'pipeline', hasPlan: true })).toBeUndefined()
    expect(shownTab('plan', { view: 'pipeline', hasPlan: false })).toBeUndefined()
    expect(shownTab('plan', { view: 'board', hasPlan: true })).toBe('plan')
    expect(shownTab(undefined, { view: 'agent', hasPlan: true })).toBe('log')
    expect(shownTab('plan', { view: 'agent', hasPlan: false })).toBe('log')
    expect(shownTab('waiting', { view: 'agent', hasPlan: true })).toBe('log')
  })

  it('an engineer view shows Log without saving it', () => {
    // shownTab reads only; the stored value stays what the user picked.
    const s = store({ [TAB_KEY]: 'waiting' })
    expect(shownTab(readTab(s), { view: 'agent', hasPlan: true })).toBe('log')
    expect(s.data[TAB_KEY]).toBe('waiting')
  })
})

import { describe, expect, it } from 'vitest'
import { THEME_KEY, applyTheme, readChoice, saveChoice } from './theme.ts'

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('SecurityError: storage is blocked')
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError')
  },
}

function fakeRoot() {
  const attrs = new Map<string, string>()
  return {
    attrs,
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
  }
}

describe('theme', () => {
  it('readChoice falls back to system', () => {
    expect(THEME_KEY).toBe('pod-board-theme')
    expect(readChoice(memoryStorage({ [THEME_KEY]: 'light' }))).toBe('light')
    expect(readChoice(memoryStorage({ [THEME_KEY]: 'dark' }))).toBe('dark')
    expect(readChoice(memoryStorage({ [THEME_KEY]: 'system' }))).toBe('system')
    expect(readChoice(memoryStorage())).toBe('system')
    expect(readChoice(memoryStorage({ [THEME_KEY]: 'sepia' }))).toBe('system')
    expect(readChoice(memoryStorage({ [THEME_KEY]: 'Dark' }))).toBe('system')
    expect(readChoice(memoryStorage({ [THEME_KEY]: '' }))).toBe('system')
    expect(readChoice(memoryStorage({ 'other-key': 'dark' }))).toBe('system')
    expect(readChoice(throwing)).toBe('system')
    expect(readChoice(undefined)).toBe('system')
    expect(readChoice(null)).toBe('system')
  })

  it('applyTheme and saveChoice', () => {
    const root = fakeRoot()
    applyTheme('dark', root)
    expect(root.attrs.get('data-theme')).toBe('dark')
    applyTheme('light', root)
    expect(root.attrs.get('data-theme')).toBe('light')
    applyTheme('system', root)
    expect(root.attrs.has('data-theme')).toBe(false)
    // Applying system twice stays clean.
    applyTheme('system', root)
    expect(root.attrs.has('data-theme')).toBe(false)

    const storage = memoryStorage()
    for (const choice of ['light', 'dark', 'system'] as const) {
      saveChoice(storage, choice)
      expect(storage.data.get(THEME_KEY)).toBe(choice)
      expect(readChoice(storage)).toBe(choice)
    }
    // A storage that refuses writes, or no storage at all, never breaks the page.
    expect(() => saveChoice(throwing, 'dark')).not.toThrow()
    expect(() => saveChoice(undefined, 'dark')).not.toThrow()
  })
})

export type ThemeChoice = 'system' | 'light' | 'dark'
export type ChoiceStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type ThemeRoot = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void }

export const THEME_KEY = ''

export function readChoice(_storage: ChoiceStorage | null | undefined): ThemeChoice {
  return 'system'
}

export function saveChoice(_storage: ChoiceStorage | null | undefined, _choice: ThemeChoice): void {}

export function applyTheme(_choice: ThemeChoice, _root: ThemeRoot): void {}

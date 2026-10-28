// The one open tab under the Next step card (Waiting, Plan or Log), remembered per browser, not per run.
// Nothing stored means every tab is closed. Pure; the screen passes `localStorage`.

import type { View } from '../../selection.ts'

export type Tab = 'waiting' | 'plan' | 'log'

/** The part of `Storage` the tab memory needs, so tests can pass a plain object. */
export type TabStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const TAB_KEY = 'pod-board-tab'

export function readTab(_storage: TabStorage | null | undefined): Tab | undefined {
  return undefined
}

export function saveTab(_storage: TabStorage | null | undefined, _tab: Tab | undefined): void {}

export function toggleTab(_open: Tab | undefined, _clicked: Tab): Tab | undefined {
  return undefined
}

export function shownTab(_stored: Tab | undefined, _at: { view: View; hasPlan: boolean }): Tab | undefined {
  return undefined
}

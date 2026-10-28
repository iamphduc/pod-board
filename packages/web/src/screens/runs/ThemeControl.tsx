import { useState } from 'react'
import { applyTheme, readChoice, saveChoice, type ChoiceStorage, type ThemeChoice } from '../../theme/theme.ts'

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

const storage = (): ChoiceStorage | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** The System / Dark / Light choice. `store` and `onPick` are for the ⋯ menu and tests; the page's storage is the default. */
export function ThemeControl({ storage: store, onPick }: { storage?: ChoiceStorage; onPick?: () => void } = {}) {
  const [choice, setChoice] = useState<ThemeChoice>(() => readChoice(store ?? storage()))
  const pick = (c: ThemeChoice) => {
    setChoice(c)
    saveChoice(store ?? storage(), c)
    applyTheme(c, document.documentElement)
    onPick?.()
  }
  return (
    <div className="seg" role="group" aria-label="Theme">
      {CHOICES.map((c) => (
        <button key={c.value} type="button" className="btn" aria-pressed={choice === c.value} onClick={() => pick(c.value)}>
          {c.label}
        </button>
      ))}
    </div>
  )
}

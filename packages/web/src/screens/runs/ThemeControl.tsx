import { useState } from 'react'
import { applyTheme, readChoice, saveChoice, type ThemeChoice } from '../../theme/theme.ts'

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const storage = () => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function ThemeControl() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readChoice(storage()))
  const pick = (c: ThemeChoice) => {
    setChoice(c)
    saveChoice(storage(), c)
    applyTheme(c, document.documentElement)
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

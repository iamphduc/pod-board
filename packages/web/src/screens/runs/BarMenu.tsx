import { useEffect, useRef, useState, type RefObject } from 'react'
import { Icon } from '../../theme/icons.tsx'
import type { ChoiceStorage } from '../../theme/theme.ts'
import { AutoContinueSwitch } from './AutoContinueSwitch.tsx'
import { reduceMenu, runKey, type MenuEvent } from './menu-view.ts'
import type { RunTarget } from './resume-flow.ts'
import { ThemeControl } from './ThemeControl.tsx'
import './menu.css'

type AutoContinue = { target: RunTarget; on: boolean }

export type BarMenuViewProps = {
  open: boolean
  onToggle: () => void
  /** Called when a theme is picked or the switch is pressed; the menu stays open. */
  onThemePick?: () => void
  onSwitchPress?: () => void
  autoContinue?: AutoContinue
  portBase?: number
  /** Where the theme is read from and saved; the page's local storage when not given. */
  storage?: ChoiceStorage
  triggerRef?: RefObject<HTMLButtonElement | null>
  menuRef?: RefObject<HTMLDivElement | null>
}

/** The trigger and, when open, the menu. */
export function BarMenuView({ open, onToggle, onThemePick, onSwitchPress, autoContinue, portBase, storage, triggerRef, menuRef }: BarMenuViewProps) {
  return (
    <div className="bar-menu">
      <button ref={triggerRef} type="button" className="btn sm icon" aria-label="Menu" aria-expanded={open} onClick={onToggle}>
        <Icon name="more" />
      </button>
      {open && (
        <div ref={menuRef} className="menu bar-menu-panel" role="group" aria-label="Menu">
          {autoContinue && (
            <>
              <div className="mi">
                <AutoContinueSwitch target={autoContinue.target} on={autoContinue.on} onPress={onSwitchPress} />
                <span className="mi-note">this run</span>
              </div>
              <hr />
            </>
          )}
          <div className="mi mi-block">
            <ThemeControl storage={storage} onPick={onThemePick} />
          </div>
          {portBase !== undefined && (
            <div className="mi">
              <span>Ports</span>
              <span className="mi-note mono">{portBase}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** The bar's ⋯ menu: the run's auto-continue switch, the theme, and the run's port base. */
export function BarMenu({ autoContinue, portBase }: { autoContinue?: AutoContinue; portBase?: number }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const send = (event: MenuEvent) => {
    const next = reduceMenu(open, event)
    setOpen(next.open)
    if (next.focusTrigger) triggerRef.current?.focus()
  }

  const key = runKey(autoContinue)
  const lastKey = useRef(key)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    send('run-change')
  }, [key])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') send('escape')
    }
    const onPress = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) send('outside')
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPress)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPress)
    }
  }, [open])

  return (
    <BarMenuView
      open={open}
      onToggle={() => send('toggle')}
      onThemePick={() => send('pick-theme')}
      onSwitchPress={() => send('press-switch')}
      autoContinue={autoContinue}
      portBase={portBase}
      triggerRef={triggerRef}
      menuRef={menuRef}
    />
  )
}

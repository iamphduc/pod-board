import { useEffect, useMemo, useState } from 'react'
import { TOGGLE_INITIAL, createToggleFlow, toggleView, type RunTarget, type ToggleState } from './resume-flow.ts'

/** The run's auto-continue switch, beside its state chip. Off while saving; a failure shows its message beside it. */
export function AutoContinueSwitch({ target, on }: { target: RunTarget; on: boolean }) {
  const [state, setState] = useState<ToggleState>(TOGGLE_INITIAL)
  const flow = useMemo(() => createToggleFlow(target, setState), [target.repoId, target.run])
  useEffect(() => flow.board(on), [flow, on])
  const view = toggleView(on, state)
  return (
    <span className="auto-switch">
      <button className="switch" type="button" role="switch" aria-checked={view.on} disabled={view.disabled} aria-describedby={view.error ? 'auto-switch-error' : undefined} onClick={() => flow.press()}>
        auto-continue
      </button>
      {view.error && (
        <span id="auto-switch-error" className="auto-switch-error" role="alert">
          {view.error}
        </span>
      )}
    </span>
  )
}

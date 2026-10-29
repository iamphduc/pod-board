import type { ReactNode } from 'react'
import type { RunHeader as Header } from './plan-view.ts'

/** The run's header: the repo crumb, the plan's name, and `actions` (the ⋯ menu) at the right end. The flow under it shows the steps. */
export function RunHeader({ header, actions }: { header: Header; actions?: ReactNode }) {
  return (
    <header className="run-header">
      <div className="run-top">
        <div className="run-title">
          <p className="run-crumb mono">{header.crumb} /</p>
          <h1 className="run-name">{header.name}</h1>
        </div>
        {actions}
      </div>
    </header>
  )
}

import type { ReactNode } from 'react'
import type { RunHeader as Header } from './plan-view.ts'

/** The run's header: the repo crumb, the plan's name, and `actions` (the ⋯ menu) at the right end; then the progress strip and `Wave N of M`. */
export function RunHeader({ header, actions }: { header: Header; actions?: ReactNode }) {
  const done = header.segments.filter((s) => s === 'done').length
  const total = header.segments.length
  return (
    <header className="run-header">
      <div className="run-top">
        <div className="run-title">
          <p className="run-crumb mono">{header.crumb} /</p>
          <h1 className="run-name">{header.name}</h1>
        </div>
        {actions}
      </div>
      {(total > 0 || header.wave !== undefined) && (
        <div className="run-meta">
          {total > 0 && (
            <span className="strip" role="img" aria-label={`${done} of ${total} steps done`}>
              {header.segments.map((s, i) => (
                <i key={i} className={s} />
              ))}
            </span>
          )}
          {header.wave !== undefined && <span className="mono muted run-wave">{header.wave}</span>}
        </div>
      )}
    </header>
  )
}

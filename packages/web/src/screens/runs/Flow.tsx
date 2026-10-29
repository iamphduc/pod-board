import { Fragment } from 'react'
import type { Stage } from '@pod-board/model'
import { Icon } from '../../theme/icons.tsx'
import { flowColumns } from './plan-view.ts'

type Props = { stages: Stage[]; boardHref?: string }

/** The run's flow: a column of step cards per stage, arrows between columns; then the wave board link. */
export function Flow({ stages, boardHref }: Props) {
  const columns = flowColumns(stages)
  if (columns.length === 0) return null
  return (
    // The box scrolls sideways on narrow screens, so it takes focus for the keyboard.
    <section className="flow-frame" aria-label="Run flow" tabIndex={0}>
      <ol className="flow">
        {columns.map((col, i) => (
          <Fragment key={col.key}>
            {i > 0 && (
              <li className="flow-arrow" aria-hidden="true">
                <Icon name="arrow-right" />
              </li>
            )}
            <li className="flow-col">
              <h2 className="flow-cap">{col.caption}</h2>
              <ol className="flow-steps">
                {col.steps.map((s) => (
                  <li key={s.key} className={`flow-step ${s.state}${s.highlight ? ' hi' : ''}${s.dim ? ' dim' : ''}`}>
                    <span className="flow-mark" aria-hidden="true">
                      <Icon name={s.mark} />
                    </span>
                    <span className="flow-label">
                      {s.label}
                      <span className="sr-only"> ({s.word})</span>
                    </span>
                    <span className="flow-detail">{s.detail}</span>
                  </li>
                ))}
              </ol>
            </li>
          </Fragment>
        ))}
      </ol>
      {boardHref !== undefined && (
        <p className="flow-board">
          <a href={boardHref}>Open the wave board</a>
        </p>
      )}
    </section>
  )
}

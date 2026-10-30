import { Fragment, useId, useState } from 'react'
import type { Stage } from '@pod-board/model'
import { Icon } from '../../theme/icons.tsx'
import { flowColumns, foldLine } from './plan-view.ts'

type Props = { stages: Stage[] }

/**
 * The run's flow: a column of step cards per stage, arrows between columns.
 * On phones (CSS, ≤ 480 px) it starts folded to one line naming the current step; the line opens and
 * folds it. Nothing is remembered: the caller keys it by run, so every load and run starts folded.
 */
export function Flow({ stages }: Props) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const columns = flowColumns(stages)
  const fold = foldLine(columns)
  if (columns.length === 0) return null
  return (
    <section className={open ? 'flow-frame open' : 'flow-frame'} aria-label="Run flow">
      {fold && (
        <button className="flow-fold" data-state={fold.state} type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
          <span className="flow-mark" aria-hidden="true">
            <Icon name={fold.mark} />
          </span>
          <span className="flow-fold-text">
            {`${fold.label} · ${fold.detail}`}
            <span className="sr-only">{` (${fold.word}), all steps`}</span>
          </span>
          <span className="flow-fold-chevron" aria-hidden="true">
            <Icon name="chevron-down" />
          </span>
        </button>
      )}
      {/* The columns scroll sideways on narrow screens, so their box takes focus for the keyboard. */}
      <div className="flow-scroll" id={listId} tabIndex={0}>
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
      </div>
    </section>
  )
}

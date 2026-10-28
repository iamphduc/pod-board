import type { Stage, StepState } from '@pod-board/model'
import { Icon } from '../../theme/icons.tsx'
import { planLines } from './plan-view.ts'
import './tabs.css'

/** A step's state as the status dot's class. */
const DOT: Record<StepState, string> = { done: 's-ok', live: 's-run', you: 's-you', blocked: 's-bad', wait: 's-idle', unknown: 's-idle' }

type Props = { stages: Stage[]; boardHref?: string }

/** The Plan tab: one line per pipeline step. Done lines show a check; only the current line shows its detail. */
export function PlanTab({ stages, boardHref }: Props) {
  const lines = planLines(stages)
  return (
    <div className="tab-panel plan-tab">
      {lines.length === 0 ? (
        <p className="muted tab-empty">No plan steps yet.</p>
      ) : (
        <ol className="plan-lines">
          {lines.map((l) => {
            const done = l.state === 'done'
            return (
              <li key={l.key} className={`plan-line${done ? ' done' : ''}${l.current ? ' current' : ''}`} aria-current={l.current ? 'step' : undefined}>
                <span className="plan-mark">{done ? <Icon name="check" /> : <span className="plan-dot" aria-hidden="true" />}</span>
                <span className="plan-label">{l.label}</span>
                {done ? <span className="sr-only">{l.word}</span> : <span className={`status ${DOT[l.state]}`}>{l.word}</span>}
                {l.current && l.detail && <span className="plan-detail mono">{l.detail}</span>}
              </li>
            )
          })}
        </ol>
      )}
      {boardHref !== undefined && (
        <p className="plan-board">
          <a href={boardHref}>Open the wave board</a>
        </p>
      )}
    </div>
  )
}

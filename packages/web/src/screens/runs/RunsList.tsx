import type { RunSummary } from '@pod-board/model'
import { hashFor } from '../../selection.ts'
import { runChip, runLabel } from './view.ts'

type Props = { runs: RunSummary[]; selected: RunSummary | undefined }

/** The runs: one row each with its label, the `fix` tag, and its state as a dot and a word. */
export function RunsList({ runs, selected }: Props) {
  return (
    <nav className="runs" aria-label="Runs">
      <span className="eyebrow runs-head">Runs</span>
      {runs.length > 0 && (
        <ul className="run-list">
          {runs.map((r) => {
            const key = hashFor(r)
            const state = runChip(r.state)
            return (
              <li key={key}>
                <a className="run" href={key} aria-current={r === selected ? 'true' : undefined}>
                  <span className="run-head">
                    <b>{runLabel(r, runs)}</b>
                    {r.fix !== undefined && <span className="chip tag">fix</span>}
                  </span>
                  <span className={`status ${state.cls}`}>{state.label}</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}

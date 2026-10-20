import type { RunSummary } from '@pod-board/model'
import { hashFor } from '../../selection.ts'
import { Chip } from './Chip.tsx'
import { runChip, runLine } from './view.ts'

type Props = { runs: RunSummary[]; active: number; selected: RunSummary | undefined }

export function RunsList({ runs, active, selected }: Props) {
  return (
    <nav className="runs" aria-label="Runs">
      <span className="eyebrow">Runs · {active} active</span>
      {runs.length > 0 && (
        <ul className="run-list">
          {runs.map((r) => {
            const key = hashFor(r)
            return (
              <li key={key}>
                <a className="run" href={key} aria-current={r === selected ? 'true' : undefined}>
                  <span className="run-head">
                    <b>{r.repo}</b>
                    {r.fix !== undefined && <span className="chip tag">fix</span>}
                  </span>
                  <span className="mono">{runLine(r)}</span>
                  <Chip chip={runChip(r.state)} />
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </nav>
  )
}

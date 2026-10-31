import type { BoardRepo, RunSummary } from '@pod-board/model'
import { hashFor } from '../../selection.ts'
import { runCard, runChip } from './view.ts'

type Props = { runs: RunSummary[]; selected: RunSummary | undefined; repos: BoardRepo[] }

/** The runs: one card each with the run header's name, its repo as a muted line with the `fix` tag, and its state as a dot and a word. */
export function RunsList({ runs, selected, repos }: Props) {
  return (
    <nav className="runs" aria-label="Runs">
      <span className="eyebrow runs-head">Runs</span>
      {runs.length > 0 && (
        <ul className="run-list">
          {runs.map((r) => {
            const key = hashFor(r)
            const state = runChip(r.state)
            const card = runCard(r, repos.find((x) => x.id === r.repoId))
            const fix = r.fix !== undefined
            return (
              <li key={key}>
                <a className="run" href={key} aria-current={r === selected ? 'true' : undefined}>
                  <span className="run-head">
                    <b>{card.name}</b>
                    {card.repo !== undefined && <span className="run-repo muted">{card.repo}</span>}
                    {fix && <span className="chip tag">fix</span>}
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

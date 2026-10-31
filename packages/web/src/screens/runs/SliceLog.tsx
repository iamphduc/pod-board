import type { LogGroup } from '@pod-board/model'
import { Chip } from './Chip.tsx'
import { DocTitle } from './DocTitle.tsx'
import { groupChip, rowFigures } from './view.ts'

export function SliceLog({ log }: { log: LogGroup[] }) {
  if (log.length === 0) return <p className="muted note">No slice log yet. It fills in once a sprint is drafted.</p>
  return (
    <div className="log-frame" role="region" aria-label="Slice log" tabIndex={0}>
      {/* One block per wave: a faint fill groups its header and its slices, with no lines between rows. */}
      {log.map((g) => (
        <div className="log-group" key={`${g.sprint}/${g.wave}`}>
          <table className="slice-log">
            <tbody>
              <tr className="grp">
                <th scope="rowgroup">{g.label}</th>
                <td>
                  <Chip chip={groupChip(g.status)} />
                </td>
              </tr>
              {g.rows.map((row) => (
                <tr key={row.code}>
                  <td>
                    <span className="code">{row.code}</span> · <DocTitle text={row.title} />
                    {row.model && <span className="muted"> · {row.model}</span>}
                  </td>
                  <td>
                    {row.live && <Chip chip={{ cls: 's-run', label: 'running' }} />}
                    {rowFigures(row) && <span className="figures">{rowFigures(row)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

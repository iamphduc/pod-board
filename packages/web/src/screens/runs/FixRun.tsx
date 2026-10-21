import { useEffect, useRef } from 'react'
import type { BoardRepo, FixPipeline, RunSummary } from '@pod-board/model'
import { EngineerView } from '../engineer/EngineerView.tsx'
import { Chip } from './Chip.tsx'
import { Pipeline } from './Pipeline.tsx'
import { agentChip, agentLogRows } from './view.ts'

type Props = { repo: BoardRepo; run: RunSummary; pipeline: FixPipeline; agent: string | undefined; now: number }

/** A fix run: its pipeline, its agent log, and the open engineer's view below them. */
export function FixRun({ repo, run, pipeline, agent, now }: Props) {
  const rows = agentLogRows(run, pipeline.log)
  // A resumed engineer has a row per turn; its view shows the latest one.
  const open = pipeline.log.findLast((x) => x.agentId === agent && x.engineer)
  const engineer = open && repo.agents.find((a) => a.id === open.agentId)

  const viewRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) viewRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [open?.agentId]) // the open agent, not the row object, which every Board event replaces

  return (
    <>
      <Pipeline pipeline={pipeline} />
      {rows.length === 0 ? (
        <p className="muted note">No agent has started on this fix yet.</p>
      ) : (
        <div className="log-frame" role="region" aria-label="Agent log" tabIndex={0}>
          <table className="slice-log agent-log">
            <tbody>
              <tr className="grp">
                <th scope="rowgroup">Agents</th>
                <td />
              </tr>
              {rows.map((r) => (
                <tr key={r.key} aria-current={r.agentId === open?.agentId ? 'true' : undefined}>
                  <td>{r.href ? <a href={r.href}>{r.label}</a> : r.label}</td>
                  <td>
                    <Chip chip={r.chip} />
                    <span className="figures">{r.time}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <div ref={viewRef}>
          <EngineerView key={open.agentId} repo={repo} code={open.role} title={pipeline.slug} chip={agentChip(open.state)} agent={engineer} now={now} />
        </div>
      )}
    </>
  )
}

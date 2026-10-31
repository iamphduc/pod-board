import { useEffect, useRef } from 'react'
import { otherActivity, type ActionEntry, type BoardRepo, type FixPipeline, type Pipeline, type RunSummary } from '@pod-board/model'
import { EngineerView } from '../engineer/EngineerView.tsx'
import { ActionLog } from './ActionLog.tsx'
import { Chip } from './Chip.tsx'
import { OtherActivity } from './OtherActivity.tsx'
import { SliceLog } from './SliceLog.tsx'
import { agentChip, agentLogRows } from './view.ts'
import './tabs.css'

type Props = { repo: BoardRepo; run: RunSummary; pipeline?: Pipeline; fixPipeline?: FixPipeline; agent?: string; now: number; actions: ActionEntry[] }

/** The Log tab: the slice log for a plan, or the agent log and the open engineer for a fix run; then Other activity and the Action log. */
export function LogTab({ repo, run, pipeline, fixPipeline, agent, now, actions }: Props) {
  return (
    <div className="tab-panel log-tab">
      {fixPipeline ? <FixLog repo={repo} run={run} pipeline={fixPipeline} agent={agent} now={now} /> : pipeline && <SliceLog log={pipeline.log} />}
      <OtherActivity list={otherActivity(repo, now)} />
      <ActionLog entries={actions} now={now} />
    </div>
  )
}

/** A fix run's agent log, and the open engineer's view below it. */
function FixLog({ repo, run, pipeline, agent, now }: { repo: BoardRepo; run: RunSummary; pipeline: FixPipeline; agent: string | undefined; now: number }) {
  const rows = agentLogRows(run, pipeline.log)
  // A resumed engineer has a row per turn; its view shows the latest one.
  const open = agent === undefined ? undefined : pipeline.log.findLast((x) => x.agentId === agent && x.engineer)
  const engineer = open && repo.agents.find((a) => a.id === open.agentId)

  const viewRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) viewRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [open?.agentId]) // the open agent, not the row object, which every Board event replaces

  return (
    <>
      {rows.length === 0 ? (
        <p className="muted note">No agent has started on this fix yet.</p>
      ) : (
        <div className="log-frame" role="region" aria-label="Agent log" tabIndex={0}>
          <div className="log-group">
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

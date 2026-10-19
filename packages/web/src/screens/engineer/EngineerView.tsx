import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AgentRun, BoardRepo } from '@pod-board/model'
import { createTimelineLoader, fetchJsonVia, type TimelineState } from '../../timeline-loader.ts'
import { cardChip, type Card } from '../board/board-view.ts'
import { Chip } from '../runs/Chip.tsx'
import { DocTitle } from '../runs/DocTitle.tsx'
import { engineerDetails, timelineRows } from './view.ts'
import './engineer.css'

type Props = { repo: BoardRepo; card: Card; agent: AgentRun | undefined; now: number }

export function EngineerView({ repo, card, agent, now }: Props) {
  const [state, setState] = useState<TimelineState>({ kind: 'idle' })
  const loader = useRef<ReturnType<typeof createTimelineLoader>>(undefined)

  useEffect(() => {
    const l = createTimelineLoader(fetchJsonVia(), setState)
    loader.current = l
    return () => l.stop()
  }, [])

  const lastAt = agent?.lastAt
  const ended = agent?.ended ?? false
  useEffect(() => {
    const l = loader.current
    if (!l) return
    l.show(agent ? { repoId: repo.id, agentId: agent.id, ended, ...(lastAt === undefined ? {} : { lastAt }) } : undefined)
  }, [repo.id, agent?.id, lastAt, ended]) // the key's parts, not the agent object, which every Board event replaces

  const timeline = state.kind === 'ready' || state.kind === 'loading' || state.kind === 'error' ? state.timeline : undefined
  const details = engineerDetails(card.slice, agent, now, timeline?.tests)
  const view = timeline ? timelineRows(timeline) : undefined

  // Keep the newest row in sight while the reader is at the bottom of the log.
  const logRef = useRef<HTMLOListElement>(null)
  const atBottom = useRef(true)
  useLayoutEffect(() => {
    const el = logRef.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [view?.rows.length])

  return (
    <div className="frame ev" aria-label={`Engineer for ${card.code}`} role="region">
      <div className="ev-side">
        <div className="ev-bar">
          <span className="ev-title">
            {card.code} · <DocTitle text={card.title} />
          </span>
          <Chip chip={cardChip(card.state)} />
        </div>
        <dl className="ev-details">
          {details.map((d) => (
            <div key={d.label}>
              <dt>{d.label}</dt>
              <dd className={d.mono ? 'mono' : undefined}>{d.value}</dd>
            </div>
          ))}
        </dl>
        <div className="ev-actions">
          <button className="btn" type="button" disabled title="Phase 3">
            Step in (phase 3)
          </button>
        </div>
      </div>
      <div className="ev-side">
        <span className="eyebrow">Live timeline</span>
        {!agent ? (
          <p className="muted ev-note">No engineer has started on this slice yet.</p>
        ) : state.kind === 'missing' ? (
          <p className="muted ev-note">No transcript found for this engineer.</p>
        ) : !view ? (
          <p className="muted ev-note">{state.kind === 'error' ? "Can't load the timeline. It retries when the engineer writes again." : 'Loading the timeline…'}</p>
        ) : (
          <>
            {state.kind === 'error' && (
              <p className="ev-warn" role="status">
                <span className="chip s-you">stale</span> Can't load the newest steps. Showing the last ones read.
              </p>
            )}
            {view.rows.length === 0 ? (
              <p className="muted ev-note">No tool calls yet.</p>
            ) : (
              <ol
                className="ev-log"
                ref={logRef}
                tabIndex={0}
                aria-label="Tool calls, oldest first"
                onScroll={(e) => {
                  const el = e.currentTarget
                  atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8
                }}
              >
                {view.earlier && <li className="ev-earlier">{view.earlier}</li>}
                {view.rows.map((r) => (
                  <li key={r.key}>
                    <b>{r.time}</b>
                    <span className="ev-sum">{r.summary}</span>
                    {r.result && <span className={`ev-res ${r.result.cls}`}>{r.result.label}</span>}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  )
}

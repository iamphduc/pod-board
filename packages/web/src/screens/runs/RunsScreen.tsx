import { activeRuns, buildPipeline, type Board, type RunSummary } from '@pod-board/model'
import type { StreamState } from '../../board-stream.ts'
import { hashFor, type View } from '../../selection.ts'
import { BoardScreen } from '../board/BoardScreen.tsx'
import { AddRepoForm } from './AddRepoForm.tsx'
import { Chip } from './Chip.tsx'
import { Pipeline } from './Pipeline.tsx'
import { RunsList } from './RunsList.tsx'
import { SliceLog } from './SliceLog.tsx'
import { ThemeControl } from './ThemeControl.tsx'
import { barTitle, emptyMessage, runChip, streamChip } from './view.ts'
import './runs.css'

type Props = {
  board: Board | undefined
  stream: StreamState
  runs: RunSummary[]
  selected: RunSummary | undefined
  view: View
  slice: string | undefined
  now: number
}

const VIEWS: { view: View; label: string }[] = [
  { view: 'pipeline', label: 'Pipeline' },
  { view: 'board', label: 'Wave board' },
]

export function RunsScreen({ board, stream, runs, selected, view, slice, now }: Props) {
  const repo = selected && board?.repos.find((r) => r.id === selected.repoId)
  const pipeline = repo && selected?.plan !== undefined ? buildPipeline(repo, selected.plan, now) : undefined
  const tabs = selected?.plan !== undefined && pipeline !== undefined
  return (
    <div className="screen">
      <aside className="side">
        <div className="side-head">
          <span className="brand">Pod Board</span>
          <Chip chip={streamChip(stream)} />
        </div>
        <RunsList runs={runs} active={activeRuns(runs)} selected={selected} />
        <AddRepoForm />
      </aside>
      <main className="main">
        <div className="bar">
          <h1 className="title">{selected ? barTitle(selected) : 'Pod Board'}</h1>
          {selected && <Chip chip={runChip(selected.state)} />}
          {selected?.portBase !== undefined && <span className="mono note">ports {selected.portBase}</span>}
          <ThemeControl />
        </div>
        {tabs && selected && (
          <nav className="tabs" aria-label="Views">
            {VIEWS.map((v) => (
              <a key={v.view} className="tab" href={hashFor(selected, v.view)} aria-current={view === v.view ? 'page' : undefined}>
                {v.label}
              </a>
            ))}
          </nav>
        )}
        {stream === 'lost' && (
          <p className="note lost" role="status">
            Lost the connection to the server. Showing the last board; retrying.
          </p>
        )}
        {!board ? (
          <p className="muted">{stream === 'lost' ? 'Waiting for the server…' : 'Connecting to the server…'}</p>
        ) : !selected ? (
          <div className="empty">
            <h2>No repos yet</h2>
            <p className="muted">Add a repo's folder with the Add a repo form to see its pod runs.</p>
          </div>
        ) : pipeline && repo && view === 'board' && selected.plan !== undefined ? (
          <BoardScreen repo={repo} plan={selected.plan} {...(slice === undefined ? {} : { slice })} now={now} />
        ) : pipeline ? (
          <>
            <Pipeline pipeline={pipeline} />
            <SliceLog log={pipeline.log} />
          </>
        ) : (
          <p className="muted">{emptyMessage(selected)}</p>
        )}
      </main>
    </div>
  )
}

import { activeRuns, buildPipeline, type Board, type RunSummary } from '@pod-board/model'
import type { StreamState } from '../../board-stream.ts'
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
  now: number
}

export function RunsScreen({ board, stream, runs, selected, now }: Props) {
  const repo = selected && board?.repos.find((r) => r.id === selected.repoId)
  const pipeline = repo && selected?.plan !== undefined ? buildPipeline(repo, selected.plan, now) : undefined
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

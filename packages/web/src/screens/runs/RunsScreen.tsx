import { activeRuns, buildFixPipeline, buildPipeline, otherActivity, type Board, type RunSummary } from '@pod-board/model'
import type { StreamState } from '../../board-stream.ts'
import { hashFor, type View } from '../../selection.ts'
import { BoardScreen } from '../board/BoardScreen.tsx'
import { ActionLog } from './ActionLog.tsx'
import { AddRepoForm } from './AddRepoForm.tsx'
import { Chip } from './Chip.tsx'
import { FixRun } from './FixRun.tsx'
import { OtherActivity } from './OtherActivity.tsx'
import { Pipeline } from './Pipeline.tsx'
import { ReplyPanel } from './ReplyPanel.tsx'
import { replyPanel } from './reply-view.ts'
import { RunsList } from './RunsList.tsx'
import { SliceLog } from './SliceLog.tsx'
import { ThemeControl } from './ThemeControl.tsx'
import { WaitingOnYou } from './WaitingOnYou.tsx'
import { banners, barTitle, emptyMessage, runChip, streamChip } from './view.ts'
import './runs.css'

type Props = {
  board: Board | undefined
  stream: StreamState
  runs: RunSummary[]
  selected: RunSummary | undefined
  view: View
  slice: string | undefined
  /** The open agent of a fix run. */
  agent?: string | undefined
  now: number
}

const VIEWS: { view: View; label: string }[] = [
  { view: 'pipeline', label: 'Pipeline' },
  { view: 'board', label: 'Wave board' },
]

export function RunsScreen({ board, stream, runs, selected, view, slice, agent, now }: Props) {
  const repo = selected && board?.repos.find((r) => r.id === selected.repoId)
  const isFix = selected?.fix !== undefined
  const fixPipeline = repo && isFix && selected?.plan !== undefined ? buildFixPipeline(repo, selected.plan, now) : undefined
  const pipeline = repo && !isFix && selected?.plan !== undefined ? buildPipeline(repo, selected.plan, now) : undefined
  // A fix run has no wave board, so no tabs.
  const tabs = selected?.plan !== undefined && pipeline !== undefined
  const others = repo ? otherActivity(repo, now) : []
  const notices = banners(board, stream)
  const reply = replyPanel(selected, repo, now)
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
        {notices.length > 0 && (
          <div className="banners">
            {notices.map((b) => (
              <p key={b.chip.label} className="banner" data-tone={b.chip.cls} role="status">
                <Chip chip={b.chip} />
                <span>{b.text}</span>
              </p>
            ))}
          </div>
        )}
        {reply && repo && selected && <ReplyPanel key={`${repo.id}/${selected.plan}`} view={reply} />}
        {!board ? (
          <p className="muted">{stream === 'lost' ? 'Waiting for the server…' : 'Connecting to the server…'}</p>
        ) : !selected ? (
          <div className="empty">
            <h2>No repos yet</h2>
            <p className="muted">Add a repo's folder with the Add a repo form to see its pod runs.</p>
          </div>
        ) : fixPipeline && repo ? (
          <FixRun key={`${repo.id}/${selected.plan}`} repo={repo} run={selected} pipeline={fixPipeline} agent={view === 'agent' ? agent : undefined} now={now} />
        ) : pipeline && repo && view === 'board' && selected.plan !== undefined ? (
          <BoardScreen repo={repo} plan={selected.plan} {...(slice === undefined ? {} : { slice })} now={now} />
        ) : pipeline && repo ? (
          <>
            <Pipeline key={`${repo.id}/${selected.plan}`} pipeline={pipeline} repoId={repo.id} />
            <SliceLog log={pipeline.log} />
          </>
        ) : (
          <p className="muted">{emptyMessage(selected, repo)}</p>
        )}
        {board && selected && repo && <WaitingOnYou key={`${repo.id}/${selected.plan}`} repo={repo} run={selected} />}
        {board && selected && <OtherActivity list={others} />}
        {board && <ActionLog entries={board.actions} now={now} />}
      </main>
    </div>
  )
}

import { useRef, useState } from 'react'
import { buildFixPipeline, buildFlow, buildPipeline, type Board, type RunSummary } from '@pod-board/model'
import type { StreamState } from '../../board-stream.ts'
import { hashFor, type View } from '../../selection.ts'
import { Icon } from '../../theme/icons.tsx'
import { BoardScreen } from '../board/BoardScreen.tsx'
import { AddRepoDialog } from './AddRepoDialog.tsx'
import { BarMenu } from './BarMenu.tsx'
import { Flow } from './Flow.tsx'
import { Chip } from './Chip.tsx'
import { LogTab } from './LogTab.tsx'
import { NextStepCard } from './NextStepCard.tsx'
import { nextSteps } from './next-step.ts'
import { runHeader } from './plan-view.ts'
import { switchView } from './resume-flow.ts'
import { RunHeader } from './RunHeader.tsx'
import { RunsList } from './RunsList.tsx'
import { readTab, saveTab, shownTab, type Tab, type TabStorage } from './tab-memory.ts'
import { WaitingTab } from './WaitingTab.tsx'
import { banners, connectionStatus, tabPress } from './view.ts'
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
  /** Where the open tab is remembered; the page's local storage when not given. */
  storage?: TabStorage | undefined
}

/** The page's local storage, or nothing where there is none or it throws. */
function pageStorage(): TabStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

const TAB_LABELS: Record<Tab, string> = { waiting: 'Waiting', log: 'Log' }
const TABS: Tab[] = ['waiting', 'log']

export function RunsScreen({ board, stream, runs, selected, view, slice, agent, now, storage }: Props) {
  const store = useRef(storage ?? pageStorage())
  const [stored, setStored] = useState<Tab | undefined>(() => readTab(store.current))
  const [picking, setPicking] = useState(false)
  const repoButton = useRef<HTMLButtonElement>(null)

  const repo = selected && board?.repos.find((r) => r.id === selected.repoId)
  const isFix = selected?.fix !== undefined
  const fixPipeline = repo && isFix && selected?.plan !== undefined ? buildFixPipeline(repo, selected.plan, now) : undefined
  const pipeline = repo && !isFix && selected?.plan !== undefined ? buildPipeline(repo, selected.plan, now) : undefined
  const header = runHeader(selected, repo, now)
  const steps = nextSteps(selected, repo, now)
  const shown = shownTab(stored, { view })
  const notices = banners(board, stream)
  const lost = connectionStatus(stream)
  const autoSwitch = switchView(selected, board)
  const runKey = selected ? hashFor(selected) : 'none'
  // A plan's full flow (Think → You → sprints → Check → Ship); a fix run's Build, Review, Ship.
  const stages = fixPipeline?.stages ?? (repo && pipeline && selected?.plan !== undefined ? (buildFlow(repo, selected.plan, now) ?? []) : [])

  const press = (t: Tab) => {
    const next = tabPress(shown, t, view)
    saveTab(store.current, next.save)
    setStored(next.save)
    if (next.leave && selected) window.location.hash = hashFor(selected)
  }
  const closePicker = () => {
    setPicking(false)
    repoButton.current?.focus()
  }

  const menu = (
    <BarMenu
      key={runKey}
      autoContinue={selected?.plan !== undefined && autoSwitch ? { target: { repoId: selected.repoId, run: selected.plan }, on: autoSwitch.on } : undefined}
      portBase={selected?.portBase}
    />
  )

  return (
    <div className="screen">
      <div className="screen-body">
        <aside className="side">
          <div className="side-head">
            <span className="logo">
              <i aria-hidden="true" />
              Pod Board
            </span>
            {lost && (
              <span className={`status ${lost.cls}`} role="status">
                {lost.label}
              </span>
            )}
          </div>
          <RunsList runs={runs} selected={selected} />
          <div className="side-foot">
            <button ref={repoButton} className="btn lead add-repo" type="button" aria-haspopup="dialog" onClick={() => setPicking(true)}>
              <Icon name="plus" />
              Add repo
            </button>
          </div>
        </aside>
        <main className={view === 'board' ? 'main wide' : 'main'}>
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
          {!board ? (
            <p className="muted">{stream === 'lost' ? 'Waiting for the server…' : 'Connecting to the server…'}</p>
          ) : !selected || !repo ? (
            <div className="empty">
              <div className="run-top">
                <h1 className="run-name">No repos yet</h1>
                {menu}
              </div>
              <p className="muted">Press Add repo in the sidebar and pick a repo's folder to see its pod runs.</p>
            </div>
          ) : view === 'board' && pipeline && selected.plan !== undefined ? (
            <>
              {header && <RunHeader header={header} actions={menu} />}
              <p className="back">
                <a href={hashFor(selected)}>Back to the run</a>
              </p>
              <BoardScreen repo={repo} plan={selected.plan} {...(slice === undefined ? {} : { slice })} now={now} />
            </>
          ) : (
            <>
              {header && (
                <RunHeader
                  header={header}
                  actions={
                    <div className="run-actions">
                      {pipeline && (
                        <a className="btn sm quiet board-link" href={hashFor(selected, 'board')} aria-label="Open the wave board">
                          <span className="board-link-long">Open the wave board</span>
                          <span className="board-link-short">Wave board</span>
                        </a>
                      )}
                      {menu}
                    </div>
                  }
                />
              )}
              <Flow key={`flow:${runKey}`} stages={stages} />
              {steps && <NextStepCard key={runKey} repo={repo} run={selected} card={steps.card} />}
              <div className="tabs" role="group" aria-label="More about this run">
                {TABS.map((t) => (
                  <button key={t} className="tab" type="button" aria-expanded={shown === t} aria-controls={shown === t ? `tab-${t}` : undefined} onClick={() => press(t)}>
                    {TAB_LABELS[t]}
                    {t === 'waiting' && <span className="n">{steps?.rest.length ?? 0}</span>}
                  </button>
                ))}
              </div>
              {shown && (
                <div id={`tab-${shown}`} className="tab-slot">
                  {shown === 'waiting' && <WaitingTab key={runKey} repo={repo} run={selected} items={steps?.rest ?? []} />}
                  {shown === 'log' && (
                    <LogTab
                      repo={repo}
                      run={selected}
                      {...(pipeline ? { pipeline } : {})}
                      {...(fixPipeline ? { fixPipeline } : {})}
                      {...(view === 'agent' && agent !== undefined ? { agent } : {})}
                      now={now}
                      actions={board.actions ?? []}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {picking && <AddRepoDialog repoPaths={board?.repos.map((r) => r.path) ?? []} onClose={closePicker} />}
    </div>
  )
}

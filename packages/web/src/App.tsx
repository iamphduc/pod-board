import { useEffect, useMemo, useState } from 'react'
import { listRuns, type Board, type RunSummary } from '@pod-board/model'
import { createBoardStream, healthProbe, type StreamState } from './board-stream.ts'
import { boardSlices } from './screens/board/board-view.ts'
import { RunsScreen } from './screens/runs/RunsScreen.tsx'
import { resolveSelection, startClock } from './selection.ts'

export function App() {
  const [board, setBoard] = useState<Board>()
  const [stream, setStream] = useState<StreamState>('connecting')
  const [now, setNow] = useState(() => Date.now())
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const s = createBoardStream(
      () => new EventSource('/api/events'),
      (b) => {
        setBoard(b)
        setNow(Date.now())
      },
      setStream,
      { probe: () => healthProbe() },
    )
    return () => s.stop()
  }, [])
  useEffect(() => startClock(setNow), [])
  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const runs = useMemo(() => (board ? listRuns(board, now) : []), [board, now])
  const slicesOf = (run: RunSummary) =>
    run.plan === undefined ? [] : boardSlices(board?.repos.find((r) => r.id === run.repoId), run.plan, now)
  const selection = resolveSelection(runs, hash, slicesOf)

  useEffect(() => {
    if (!board || selection.hash === undefined || selection.hash === hash) return
    window.history.replaceState(null, '', selection.hash)
    setHash(selection.hash)
  }, [board, selection.hash, hash])

  return (
    <RunsScreen board={board} stream={stream} runs={runs} selected={selection.run} view={selection.view} slice={selection.slice} now={now} />
  )
}

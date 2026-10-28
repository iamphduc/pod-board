import { useEffect, useMemo, useRef, useState } from 'react'
import type { BoardRepo, RunSummary } from '@pod-board/model'
import { Chip } from './Chip.tsx'
import { AnswerForm } from './AnswerForm.tsx'
import { INITIAL, createAnswerFlow, type AnswerState } from './answer-flow.ts'
import { answerNote, formAnchor, waitingRows } from './queue-view.ts'

type Props = { repo: BoardRepo; run: RunSummary }

/** The queue entries waiting on you for the selected run, each answerable one with its form in place. */
export function WaitingOnYou({ repo, run }: Props) {
  const [state, setState] = useState<AnswerState>(INITIAL)
  const flow = useMemo(() => createAnswerFlow(setState), [])
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const rows = waitingRows(repo, run)
  const anchor = formAnchor(state, rows, repo.id)
  const target = state.kind === 'idle' ? undefined : state.target.line

  // Focus goes back to the entry's Answer button when the form closes, if it's still there.
  useEffect(() => {
    if (target === undefined) return
    return () => buttons.current.get(target)?.focus()
  }, [target])

  if (rows.length === 0 && anchor === undefined) return null
  const saving = state.kind === 'saving'
  const form = <AnswerForm state={state} flow={flow} note={answerNote(run)} />
  return (
    <section className="waiting" aria-label="Waiting on you">
      <span className="eyebrow">Waiting on you</span>
      <ul className="waiting-list">
        {rows.map((r) => (
          <li key={r.key} className={`card waiting-row k-${r.chip.cls.slice(2)}`}>
            <div className="waiting-head">
              <Chip chip={r.chip} />
              {r.date && <span className="mono note">{r.date}</span>}
              {r.route && <span className="mono note">{r.route}</span>}
            </div>
            <p className="waiting-body">{r.body}</p>
            {r.yourAnswer && (
              <p className="waiting-answer">
                <span>{r.yourAnswer}</span> <span className="note">{r.waiting}</span>
              </p>
            )}
            {r.answerable && anchor !== r.key && (
              <div className="inplace-actions">
                <button
                  ref={(el) => {
                    if (el) buttons.current.set(r.line, el)
                    else buttons.current.delete(r.line)
                  }}
                  className="btn quiet"
                  type="button"
                  disabled={saving}
                  onClick={() => flow.open({ repoId: repo.id, line: r.line })}
                >
                  Answer
                </button>
              </div>
            )}
            {anchor === r.key && form}
          </li>
        ))}
      </ul>
      {anchor === 'end' && form}
    </section>
  )
}

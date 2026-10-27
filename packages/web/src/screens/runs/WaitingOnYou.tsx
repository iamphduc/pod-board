import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { BoardRepo, RunSummary } from '@pod-board/model'
import { Chip } from './Chip.tsx'
import { INITIAL, createAnswerFlow, formView, type AnswerFlow, type AnswerState } from './answer-flow.ts'
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

/** The form under its entry: the text, Save answer, and Cancel, with the note on when pod reads it. */
function AnswerForm({ state, flow, note }: { state: AnswerState; flow: AnswerFlow; note: string }) {
  const view = formView(state, note)
  const ref = useRef<HTMLElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const line = state.kind === 'idle' ? undefined : state.target.line

  // Focus moves into the text when the form opens, so you can type and Escape reaches it.
  useEffect(() => {
    if (line === undefined) return
    ;(textRef.current ?? ref.current)?.focus()
  }, [line])
  // Once answered the text box goes; keep focus in the form so Escape still closes it.
  useEffect(() => {
    const panel = ref.current
    if (panel && !panel.contains(document.activeElement)) panel.focus()
  }, [state.kind])

  if (!view) return null
  const onKey = (e: KeyboardEvent) => flow.key(e.key)
  const errorId = 'answer-error'
  return (
    <section ref={ref} className="inplace answer-form" aria-label="Answer this entry" tabIndex={-1} onKeyDown={onKey}>
      {view.showText && (
        <textarea
          ref={textRef}
          className="input"
          aria-label="Your answer"
          value={view.text}
          readOnly={!view.canSave}
          aria-invalid={view.error ? true : undefined}
          aria-describedby={view.error ? errorId : undefined}
          onChange={(e) => flow.type(e.currentTarget.value)}
        />
      )}
      {view.status && (
        <p className="muted answer-status" role="status">
          {view.status}
        </p>
      )}
      {view.result && (
        <div className="answer-result" role="status">
          <Chip chip={view.result.chip} />
          <span>{view.result.words}</span>
          {view.result.note && <span className="note">{view.result.note}</span>}
        </div>
      )}
      {view.error && (
        <p id={errorId} className="answer-error" role="alert">
          {view.error}
        </p>
      )}
      <p className="note answer-note">{view.note}</p>
      <div className="inplace-actions">
        {view.showText && (
          <button className="btn primary" type="button" disabled={!view.canSave} onClick={() => flow.save()}>
            Save answer
          </button>
        )}
        <button className="btn quiet" type="button" disabled={view.cancelDisabled} onClick={() => flow.cancel()}>
          {view.closeLabel}
        </button>
      </div>
    </section>
  )
}

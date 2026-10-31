import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { Chip } from './Chip.tsx'
import { formView, type AnswerFlow, type AnswerState } from './answer-flow.ts'

/**
 * The form under its entry: the text, Save answer, and Cancel, with the note on when pod reads it.
 * `entry`: the entry's full text, shown above the box when the entry itself isn't on screen (the card).
 */
export function AnswerForm({ state, flow, note, entry }: { state: AnswerState; flow: AnswerFlow; note: string; entry?: string }) {
  const view = formView(state, note)
  const ref = useRef<HTMLElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const line = state.kind === 'idle' ? undefined : state.target.line
  const errorId = useId()

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
  return (
    <section ref={ref} className="inplace answer-form" aria-label="Answer this entry" tabIndex={-1} onKeyDown={onKey}>
      {entry !== undefined && <p className="answer-entry">{entry}</p>}
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

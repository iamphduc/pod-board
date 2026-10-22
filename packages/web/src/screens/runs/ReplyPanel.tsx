import { useEffect, useRef, useState } from 'react'
import { COPIED, COPIED_MS, COPY_FAILED, copyText, type CopyResult } from '../../copy.ts'
import type { ReplyPanelView } from './reply-view.ts'

/** A quiet Copy button. `Copied` for COPIED_MS; on a failed copy, the text shown selected to copy by hand. */
function CopyButton({ text, what }: { text: string; what: string }) {
  const [result, setResult] = useState<CopyResult | undefined>()
  const fieldRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (result !== 'copied') return
    const t = setTimeout(() => setResult(undefined), COPIED_MS)
    return () => clearTimeout(t)
  }, [result])
  useEffect(() => {
    if (result === 'failed') fieldRef.current?.select()
  }, [result])

  return (
    <span className="reply-copy">
      <button className="btn quiet" type="button" aria-label={`Copy ${what}`} onClick={() => void copyText(text).then(setResult)}>
        {result === 'copied' ? COPIED : 'Copy'}
      </button>
      {result === 'copied' && (
        <span className="sr-only" role="status">
          {COPIED}
        </span>
      )}
      {result === 'failed' && (
        <span className="reply-failed" role="alert">
          <input ref={fieldRef} className="input" readOnly value={text} aria-label={what} onFocus={(e) => e.currentTarget.select()} />
          <span className="note">{COPY_FAILED}</span>
        </span>
      )}
    </span>
  )
}

/** The reply pod waits for on the selected run, and the chat to paste it in. */
export function ReplyPanel({ view }: { view: ReplyPanelView }) {
  const s = view.session
  return (
    <section className="inplace reply-panel" aria-label="Reply pod waits for">
      <span className="eyebrow">Reply pod waits for</span>
      <ul className="reply-list">
        {view.rows.map((r) => (
          <li key={r.key} className="reply-row">
            <code className="mono reply-word">{r.word}</code>
            <span className="reply-why">{r.why}</span>
            <CopyButton text={r.word} what={r.word} />
          </li>
        ))}
      </ul>
      {s ? (
        <div className="reply-chat">
          <p className="note reply-session">
            Paste it in <span className="mono">{s.line}</span>
            {s.time && <span> · {s.time}</span>}
          </p>
          <div className="reply-cmd">
            <code className="mono">{s.cd}</code>
            <CopyButton text={s.cd} what="cd command" />
          </div>
          {s.resume && (
            <div className="reply-cmd">
              <code className="mono">{s.resume}</code>
              <CopyButton text={s.resume} what="resume command" />
            </div>
          )}
        </div>
      ) : (
        <p className="note">{view.noSession}</p>
      )}
    </section>
  )
}

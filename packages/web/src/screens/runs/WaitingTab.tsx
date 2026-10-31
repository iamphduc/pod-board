import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { BoardRepo, RunSummary } from '@pod-board/model'
import { Icon } from '../../theme/icons.tsx'
import { AnswerForm } from './AnswerForm.tsx'
import { INITIAL, createAnswerFlow, type AnswerState } from './answer-flow.ts'
import { MergeConfirm, mergeButtonId, useMergeFlow } from './MergeConfirm.tsx'
import type { NextItem } from './next-step.ts'
import { answerNote, type WaitingRow } from './queue-view.ts'
import { ReplyPanel } from './ReplyPanel.tsx'
import {
  NOTHING_ELSE,
  answerAnchor,
  groupOpen,
  keepOpen,
  kindChip,
  mergeAnchor,
  replyGhost,
  replySeen,
  rowMeta,
  toggleOpen,
  waitGroups,
  type ReplySeen,
} from './waiting-tab.ts'
import './tabs.css'

type Props = { repo: BoardRepo; run: RunSummary; items: NextItem[] }

function KindTag({ row }: { row: WaitingRow }) {
  const k = kindChip(row)
  return <span className={`status ${k.cls} wait-kind`}>{k.label}</span>
}

/**
 * The Waiting tab: everything else that waits on you, each row with its one action at its right end (under
 * it on narrow screens). The urgent rows first, then the pending entries grouped by kind, Someday closed.
 */
export function WaitingTab({ repo, run, items }: Props) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const [answer, setAnswer] = useState<AnswerState>(INITIAL)
  const flow = useMemo(() => createAnswerFlow(setAnswer), [])
  const [merge, mergeFlow] = useMergeFlow()
  const answerButtons = useRef(new Map<string, HTMLButtonElement>())
  const [lastReply, setLastReply] = useState<ReplySeen | undefined>()
  // Groups whose open state differs from their start (Someday starts closed), kept by key like the rows.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set())

  const keys = items.map((i) => i.key)
  const keyList = keys.join('\n')
  // An item that leaves takes its open state with it, so it comes back closed.
  useEffect(() => setOpen((o) => keepOpen(o, keys)), [keyList])
  const groups = waitGroups(items)
  const groupKeys = groups.map((g) => g.key)
  const groupList = groupKeys.join('\n')
  // A group that leaves takes its state with it, so Someday comes back closed.
  useEffect(() => setFlipped((f) => keepOpen(f, groupKeys)), [groupList])
  // The reply row stays mounted after the Board drops it, so a Continue or Go result isn't lost.
  const seen = replySeen(items)
  useEffect(() => {
    if (seen) setLastReply(seen)
  }, [seen?.key, seen?.target.repoId, seen?.target.run])
  const ghost = replyGhost(items, lastReply)

  const answerAt = answerAnchor(answer, items, repo.id)
  const mergeAt = mergeAnchor(merge, items, repo.id)
  const answerLine = answer.kind === 'idle' ? undefined : answer.target.line
  // Focus goes back to the entry's Answer button when the form closes, if it's still there.
  useEffect(() => {
    if (answerLine === undefined) return
    return () => answerButtons.current.get(answerLine)?.focus()
  }, [answerLine])

  const saving = answer.kind === 'saving'
  const merging = merge.kind === 'merging'
  const form = <AnswerForm state={answer} flow={flow} note={answerNote(run)} />
  const confirm = merge.kind === 'idle' ? null : <MergeConfirm state={merge} flow={mergeFlow} label={`PR #${merge.target.number}`} />
  const shown = keepOpen(open, keys)
  const shownGroups = keepOpen(flipped, groupKeys)
  const anchors = [answerAt, mergeAt]

  const row = (item: NextItem): ReactNode => {
    const e = item.entry
    const a = item.action
    const isOpen = shown.has(item.key)
    return (
      <li key={item.key} className={`wait-row t-${item.tier}`}>
        {e ? (
          // The kind's dot and word lead the meta line: `decision · engineer → human · 2026-10-30`.
          <button className="wait-toggle" type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => toggleOpen(o, item.key, keys))}>
            <span className="wait-meta mono">
              <KindTag row={e} />
              {rowMeta(e) && ` · ${rowMeta(e)}`}
            </span>
            <span className={isOpen ? 'wait-body' : 'wait-body clamp'}>{e.text}</span>
          </button>
        ) : (
          <div className="wait-head">
            <span className="wait-title">{item.title}</span>
            {item.detail && <span className="wait-detail muted">{item.detail}</span>}
          </div>
        )}
        {e?.yourAnswer && (
          <p className="wait-answer">
            <span>{e.yourAnswer}</span> <span className="note">{e.waiting}</span>
          </p>
        )}
        {a.kind === 'answer' && answerAt !== item.key && (
          <div className="inplace-actions">
            <button
              ref={(el) => {
                if (el) answerButtons.current.set(a.line, el)
                else answerButtons.current.delete(a.line)
              }}
              className="btn sm"
              type="button"
              disabled={saving}
              onClick={() => flow.open({ repoId: a.repoId, line: a.line })}
            >
              Answer
            </button>
          </div>
        )}
        {a.kind === 'merge' && (
          <div className="inplace-actions">
            <button
              id={mergeButtonId(a.number)}
              className="btn sm"
              type="button"
              aria-expanded={mergeAt === item.key}
              disabled={merging}
              onClick={() => mergeFlow.open({ repoId: a.repoId, number: a.number })}
            >
              Merge
            </button>
          </div>
        )}
        {a.kind === 'reply' && <ReplyPanel key="reply-panel" view={a.panel} target={a.panel.target} framed={false} />}
        {answerAt === item.key && form}
        {mergeAt === item.key && confirm}
      </li>
    )
  }

  const top = groups.find((g) => g.label === undefined)
  const kinds = groups.filter((g) => g.label !== undefined)

  return (
    <div className="tab-panel waiting-tab">
      {items.length === 0 && <p className="muted tab-empty">{NOTHING_ELSE}</p>}
      {(top || ghost) && (
        <ul className="wait-list">
          {[
            ...(top?.items ?? []).map(row),
            // One array with the rows: the ghost keeps the reply row's key and slot, so React keeps its panel and the result in it.
            ghost && (
              <li key={ghost.key} className="wait-row ghost">
                {null}
                {null}
                {null}
                {null}
                <ReplyPanel key="reply-panel" view={undefined} target={ghost.target} framed={false} />
              </li>
            ),
          ]}
        </ul>
      )}
      {kinds.map((g) => {
        const isOpen = groupOpen(g, shownGroups, anchors)
        return (
          <section key={g.key} className="wait-group" aria-label={g.label}>
            <h3 className="wait-group-head">
              <button className="wait-group-toggle" type="button" aria-expanded={isOpen} onClick={() => setFlipped((f) => toggleOpen(f, g.key, groupKeys))}>
                <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} />
                <span>{g.label}</span>
                <span className="wait-count mono">{g.items.length}</span>
              </button>
            </h3>
            {isOpen && <ul className="wait-list">{g.items.map(row)}</ul>}
          </section>
        )
      })}
      {answerAt === 'end' && form}
      {mergeAt === 'end' && confirm}
    </div>
  )
}

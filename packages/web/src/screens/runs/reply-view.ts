// The Reply panel's rows and words: which reply pod waits for, and the chat to paste it in.
// Session ids and commands only, never prompt text.

import { replySession, runReplies, type BoardRepo, type ReplyWord, type RunSummary } from '@pod-board/model'

export const NO_SESSION = 'No pod session found for this run. Paste it in the chat that runs it.'

export type ReplyRowView = { key: string; word: ReplyWord; why: string }
export type ReplySessionView = { line: string; time?: string; path: string; cd: string; resume?: string }
export type ReplyPanelView = { rows: ReplyRowView[]; session?: ReplySessionView; noSession?: string }

/** Local `HH:MM`. */
const clock = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The panel for the selected plan or fix run, when pod waits for a reply; undefined for a repo row or no reply. */
export function replyPanel(run: RunSummary | undefined, repo: BoardRepo | undefined, now: number): ReplyPanelView | undefined {
  if (!run || !repo || run.plan === undefined) return undefined
  const replies = runReplies(repo, run.plan, now)
  if (replies.length === 0) return undefined
  const rows = replies.map((r): ReplyRowView => ({ key: r.reply, word: r.reply, why: r.why }))
  const s = replySession(repo, run.plan, now)
  if (!s) return { rows, noSession: NO_SESSION }
  const session: ReplySessionView = { line: `Session ${s.id}`, path: s.repoPath, cd: `cd "${s.repoPath}"` }
  if (s.startedAt !== undefined) session.time = `first agent ${clock(s.startedAt)}`
  if (s.resume !== undefined) session.resume = s.resume
  return { rows, session }
}

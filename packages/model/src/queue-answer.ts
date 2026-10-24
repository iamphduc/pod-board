// Queue answers: the lines `parseQueue` reads, an entry's answer apart from its body, which
// entries you can answer, the answer text's rules, and the line with an answer appended.
// Pure. The format and why are in pod-docs/feature-details/run-model.md.

/** `parseQueue`'s entry line, kept identical so the line list matches its entries one for one. */
export const QUEUE_LINE = /^-\s*`?\[([^\]]+)\]`?\s*(.*)$/

export const ANSWER_MARK = '**Answer (human):**'
export const ANSWER_MAX = 2000

const ANSWER = /\*\*Answer \(human\):\*\*/i
const RESOLUTION = /\*\*Resolution:\*\*/i

/** Every entry line of the queue, trimmed, in `parseQueue`'s order and count. */
export function queueLines(md: string): string[] {
  return md
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => QUEUE_LINE.test(line))
}

/**
 * The text after an entry's header, split into its body and its answer. The answer is the text after the
 * first `**Answer (human):**` that follows the entry's first `**Resolution:**` (the board appends it at the
 * line's end), up to a later `**Resolution:**`. A marker before the Resolution is body text, as when an entry
 * quotes it. The body is `parseQueue`'s (cut at the Resolution). An empty answer is still an answer.
 */
export function splitAnswer(rest: string): { body: string; answer?: string } {
  const body = cutResolution(rest)
  const resolution = RESOLUTION.exec(rest)
  if (!resolution) return { body }
  const tail = rest.slice(resolution.index + resolution[0].length)
  const mark = ANSWER.exec(tail)
  if (!mark) return { body }
  const after = tail.slice(mark.index + mark[0].length)
  const end = RESOLUTION.exec(after)
  return { body, answer: (end ? after.slice(0, end.index) : after).trim() }
}

const cutResolution = (text: string) => text.replace(/\*\*Resolution:\*\*.*$/i, '').trim()

/** Pending, waiting on you, and a PENDING or BLOCKED: an entry you answer, answered yet or not. */
export function asksYou(item: { type: string; isPending: boolean; needsYou: boolean }): boolean {
  return item.isPending && item.needsYou && (item.type === 'PENDING' || item.type === 'BLOCKED')
}

/** Pending, waiting on you, a PENDING or BLOCKED, and not answered yet. */
export function isAnswerable(item: { type: string; isPending: boolean; needsYou: boolean; answer?: string }): boolean {
  return asksYou(item) && item.answer === undefined
}

export type CleanAnswer = { ok: true; text: string } | { ok: false; error: string }

// Control characters that aren't whitespace; whitespace ones (tab, line breaks) become spaces instead.
const CONTROL = /[\u0000-\u0008\u000E-\u001F\u007F]/g

/** The answer text on one line, or why it can't be saved. Length counts characters (code points), after cleaning. */
export function cleanAnswer(text: string): CleanAnswer {
  const clean = text.replace(CONTROL, '').replace(/\s+/g, ' ').trim()
  if (clean === '') return { ok: false, error: 'Write an answer first.' }
  if ([...clean].length > ANSWER_MAX) return { ok: false, error: `Keep the answer under ${ANSWER_MAX} characters.` }
  if (RESOLUTION.test(clean) || /\*\*Answer \(/i.test(clean)) {
    return { ok: false, error: "The answer can't contain **Resolution:** or **Answer (…):**." }
  }
  return { ok: true, text: clean }
}

/** The entry's line with ` **Answer (human):** <text>` at its end. `text` is `cleanAnswer`'s. */
export function withAnswer(line: string, text: string): string {
  return `${line.trimEnd()} ${ANSWER_MARK} ${text}`
}

// The board's read of one pod dispatch prompt: sprint, slice, branch, plan, and
// round, read only from the prompt's fields (a name that starts a line, a list
// item, or a `·`-separated part), plus the sprint planner's plan prose. Pure.
// The rules and why are in pod-docs/feature-details/run-model.md.

import type { parseDispatch } from './pod-flow/model.ts'

export type DispatchFields = ReturnType<typeof parseDispatch>

/** A line's start: indent, then an optional list marker (`-`, `*`, `+`, `1.`, `1)`). */
const LINE_START = /^[ \t]*(?:(?:[-*+]|\d+[.)])[ \t]+)?/

/** A field name, bold or not, an optional bracketed note, then a colon (inside or after the bold). */
const fieldHead = (name: string) => `(?:\\*\\*)?(?:${name})(?:[ \\t]*\\([^)\\n]*\\))?(?::\\*\\*|\\*\\*[ \\t]*:|[ \\t]*:)`

/** Any field name, so a `·` part counts only on a line that starts with a field. */
const ANY_FIELD = new RegExp(`^${fieldHead('[A-Za-z][\\w -]{0,40}?')}`)

/** Backtick spans blanked to spaces, so a quoted field never counts and offsets stay put. */
const blankCode = (line: string) => line.replace(/`[^`]*`/g, (s) => ' '.repeat(s.length))

/** A sentence end (`.`, then space) before a capital letter: `… repo. Plan slug: x.` */
const SENTENCE = /\.[ \t]+(?=[A-Z*])/g

/**
 * Where on one line a field can start, in line order: the line itself (after its list
 * marker); when that starts with a field, each part after a ` · `; and each new sentence.
 * Each is outside backticks. `whole` marks a `**` that may open a whole bold field.
 */
function fieldStarts(line: string): { at: number; text: string; whole?: true }[] {
  const lead = LINE_START.exec(line)?.[0].length ?? 0
  const plain = blankCode(line)
  const starts: { at: number; text: string; whole?: true }[] = [{ at: lead, text: line.slice(lead) }]
  const skip = (i: number) => i + (/^[ \t]*/.exec(line.slice(i))?.[0].length ?? 0)
  if (ANY_FIELD.test(line.slice(lead))) {
    for (let i = plain.indexOf('·', lead); i >= 0; i = plain.indexOf('·', i + 1)) starts.push({ at: skip(i + 1), text: line.slice(skip(i + 1)) })
  }
  for (const m of plain.matchAll(SENTENCE)) starts.push({ at: m.index + m[0].length, text: line.slice(m.index + m[0].length) })
  for (let i = plain.indexOf('**'); i >= 0; i = plain.indexOf('**', i + 2)) starts.push({ at: i, text: line.slice(i), whole: true })
  return starts.sort((a, b) => a.at - b.at)
}

/**
 * The value of the first field `name` in the prompt, in document order. A field starts a
 * line, a list item, a `·` part, or a sentence (`slice code: D1`, `- **slice code:** D1`,
 * `**plan slug (= plan branch):** x`, `… · round: 2`, `… repo. Plan slug: x.`), or is one
 * whole bold span anywhere (`… — **round: 2**`). A trailing `.` drops; a value that's a `/`
 * path gives nothing. A name mid-sentence or in backticks never counts, and
 * `merge-target branch` is not `branch`.
 */
function field(prompt: string, name: string): string | undefined {
  const head = new RegExp(`^${fieldHead(name)}[ \\t]*\`?([\\w.-]*)(.?)`, 'i')
  const whole = new RegExp(`^\\*\\*(?:${name})[ \\t]*:[ \\t]*\`?([\\w.-]+?)\\.?\`?\\*\\*`, 'i')
  for (const line of prompt.split(/\r?\n/)) {
    for (const start of fieldStarts(line)) {
      const m = (start.whole ? whole : head).exec(start.text)
      if (!m) continue
      const value = m[1]!.replace(/\.+$/, '')
      return value === '' || m[2] === '/' || m[2] === '\\' ? undefined : value
    }
  }
  return undefined
}

/** The sprint planner's prose: "… sprint doc for plan `<slug>`". */
const PLAN_PROSE = /\bfor plan `([\w.-]+)`/

const isType = (type: string, role: string) => new RegExp(`(^|:)${role}$`).test(type)

/**
 * The dispatch fields of an agent of type `agentType`, each from its field only.
 * Plan, first match wins: a `plan slug` field, a `plan` field, then (sprint planners
 * only) the exact prose form ``for plan `<slug>` ``. Engineers get no plan.
 */
export function readDispatch(prompt: string, agentType: string): DispatchFields {
  const round = Number(field(prompt, 'round'))
  const plan = isType(agentType, 'engineer')
    ? undefined
    : (field(prompt, 'plan slug') ??
      field(prompt, 'plan') ??
      (isType(agentType, 'sprint-planner') ? PLAN_PROSE.exec(prompt)?.[1] : undefined))
  return {
    sprint: field(prompt, 'sprint slug'),
    slice: field(prompt, 'slice code'),
    branch: field(prompt, 'branch(?: name)?'),
    plan,
    round: Number.isInteger(round) && round > 0 ? round : undefined,
  }
}

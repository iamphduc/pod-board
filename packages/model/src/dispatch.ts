// The board's read of one pod dispatch prompt: the ported `parseDispatch`
// fields, plus the plan, which real dispatches name in ways the port misses.
// Pure. The rules and why are in pod-docs/feature-details/run-model.md.

import { parseDispatch } from './pod-flow/model.ts'

export type DispatchFields = ReturnType<typeof parseDispatch>

/** A markdown list field `- **plan:** <slug>`, as the reviewer's dispatch writes it. */
const PLAN_FIELD = /^[ \t]*[-*][ \t]+\*\*plan:\*\*[ \t]*`?([\w.-]+)`?/im

/** The sprint planner's prose: "… sprint doc for plan `<slug>`". */
const PLAN_PROSE = /\bfor plan `([\w.-]+)`/

const isType = (type: string, role: string) => new RegExp(`(^|:)${role}$`).test(type)

/**
 * The dispatch fields of an agent of type `agentType`. Plan, first match wins:
 * a `plan slug:` field, a `- **plan:**` list field, then (sprint planners only)
 * the exact prose form ``for plan `<slug>` ``.
 */
export function readDispatch(prompt: string, agentType: string): DispatchFields {
  const fields = parseDispatch(prompt)
  const plan =
    fields.plan ?? PLAN_FIELD.exec(prompt)?.[1] ?? (isType(agentType, 'sprint-planner') ? PLAN_PROSE.exec(prompt)?.[1] : undefined)
  return { ...fields, plan }
}

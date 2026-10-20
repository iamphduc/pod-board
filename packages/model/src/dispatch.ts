// The board's read of one pod dispatch prompt: sprint, slice, branch, plan, and
// round, read only from the prompt's markdown list fields, plus the sprint
// planner's plan prose. Pure. The rules and why are in
// pod-docs/feature-details/run-model.md.

import type { parseDispatch } from './pod-flow/model.ts'

export type DispatchFields = ReturnType<typeof parseDispatch>

/**
 * The value of the first markdown list item that starts with field `name`:
 * `- **slice code:** D1`, `* **plan:** \`alpha\``, or `- round: 2`. A name quoted
 * in prose never counts, and `merge-target branch` is not `branch`.
 */
function listField(prompt: string, name: string): string | undefined {
  const item = new RegExp(`^[ \\t]*[-*][ \\t]+(?:\\*\\*)?(?:${name})(?:\\*\\*)?[ \\t]*:(?:\\*\\*)?[ \\t]*\`?([\\w.-]+)`, 'im')
  return item.exec(prompt)?.[1]
}

/** The sprint planner's prose: "… sprint doc for plan `<slug>`". */
const PLAN_PROSE = /\bfor plan `([\w.-]+)`/

const isType = (type: string, role: string) => new RegExp(`(^|:)${role}$`).test(type)

/**
 * The dispatch fields of an agent of type `agentType`, each from its list field only.
 * Plan, first match wins: a `plan slug` list field, a `plan` list field, then (sprint
 * planners only) the exact prose form ``for plan `<slug>` ``.
 */
export function readDispatch(prompt: string, agentType: string): DispatchFields {
  const round = Number(listField(prompt, 'round'))
  const plan =
    listField(prompt, 'plan slug') ??
    listField(prompt, 'plan') ??
    (isType(agentType, 'sprint-planner') ? PLAN_PROSE.exec(prompt)?.[1] : undefined)
  return {
    sprint: listField(prompt, 'sprint slug'),
    slice: listField(prompt, 'slice code'),
    branch: listField(prompt, 'branch(?: name)?'),
    plan,
    round: Number.isInteger(round) && round > 0 ? round : undefined,
  }
}

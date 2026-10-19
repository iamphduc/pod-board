// Stub: the board's dispatch read, before it learns the plan field. Replaced in the fix commit.
import { parseDispatch } from './pod-flow/model.ts'

export type DispatchFields = ReturnType<typeof parseDispatch>

export function readDispatch(prompt: string, _agentType: string): DispatchFields {
  return parseDispatch(prompt)
}

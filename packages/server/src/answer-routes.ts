import type { Board, NewActionEntry } from '@pod-board/model'
import { Hono } from 'hono'
import type { QueueFs } from './queue-writer.ts'

export type AnswerRouteDeps = {
  board(): Board
  rebuild(): Promise<void>
  log: { append(entry: NewActionEntry): Promise<boolean> }
  fs?: QueueFs
}

export function createAnswerRoutes(_deps: AnswerRouteDeps): Hono {
  return new Hono()
}

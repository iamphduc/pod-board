import { readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import type { AnswerOutcome } from '@pod-board/model'

/** The file calls the writer makes. Injectable so tests can fake a symlink or a held file on any OS. */
export type QueueFs = {
  realpath(p: string): Promise<string>
  readFile(p: string): Promise<Buffer>
  /** Creates `p`; fails if it exists. */
  writeFile(p: string, data: Buffer): Promise<void>
  rename(from: string, to: string): Promise<void>
  unlink(p: string): Promise<void>
}

export const nodeQueueFs: QueueFs = {
  realpath: (p) => realpath(p),
  readFile: (p) => readFile(p),
  writeFile: (p, data) => writeFile(p, data, { flag: 'wx' }),
  rename: (from, to) => rename(from, to),
  unlink: (p) => unlink(p),
}

export type WriteAnswer = { outcome: AnswerOutcome; message?: string }

export async function writeAnswer(_req: { repoPath: string; line: string; text: string }, _fs: QueueFs = nodeQueueFs): Promise<WriteAnswer> {
  return { outcome: 'answered' }
}

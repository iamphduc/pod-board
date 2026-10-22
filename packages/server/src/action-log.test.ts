import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ActionEntry } from '@pod-board/model'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ACTION_LOG_MAX, createActionLog } from './action-log.ts'

let root: string
let file: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pod-board-m1-log-'))
  file = join(root, 'actions.jsonl')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const entry = (n: number, over: Partial<ActionEntry> = {}): Omit<ActionEntry, 'at'> => ({
  action: 'merge',
  repoId: 'id-r',
  repo: 'r',
  target: `PR #${n}`,
  result: 'merged',
  ...over,
})

describe('action log', () => {
  test('reads and appends the log', async () => {
    // A missing file is an empty list, and nothing is created until the first append.
    let t = 1000
    const log = createActionLog({ file, now: () => t })
    expect(log.recent()).toEqual([])
    await expect(stat(file)).rejects.toThrow()

    expect(await log.append(entry(7, { result: 'failed', message: 'not mergeable' }))).toBe(true)
    t = 2000
    expect(await log.append(entry(8))).toBe(true)
    const lines = (await readFile(file, 'utf8')).split('\n')
    expect(lines).toEqual([
      JSON.stringify({ at: 1000, action: 'merge', repoId: 'id-r', repo: 'r', target: 'PR #7', result: 'failed', message: 'not mergeable' }),
      JSON.stringify({ at: 2000, action: 'merge', repoId: 'id-r', repo: 'r', target: 'PR #8', result: 'merged' }),
      '',
    ])
    expect(log.recent().map((e) => [e.at, e.target])).toEqual([
      [2000, 'PR #8'],
      [1000, 'PR #7'],
    ])

    // The newest 50, newest first, skipping bad lines.
    const good = Array.from({ length: 60 }, (_, i) => JSON.stringify({ at: i, ...entry(i) }))
    const bad = ['', 'not json', '[]', 'null', '{"at":"x","action":"merge"}', JSON.stringify({ at: 99, ...entry(99), result: 'exploded' }), JSON.stringify({ at: 98, ...entry(98), action: 'delete' })]
    await writeFile(file, [...good.slice(0, 30), ...bad, ...good.slice(30), '{"at":12'].join('\n'))
    const read = createActionLog({ file, now: () => t }).recent()
    expect(ACTION_LOG_MAX).toBe(50)
    expect(read).toHaveLength(50)
    expect(read[0]?.at).toBe(59)
    expect(read[49]?.at).toBe(10)
    expect(read.every((e) => e.result === 'merged' && e.action === 'merge')).toBe(true)

    // The list stays at 50 after more appends.
    const capped = createActionLog({ file, now: () => 100 })
    await capped.append(entry(100))
    expect(capped.recent()).toHaveLength(50)
    expect(capped.recent()[0]?.target).toBe('PR #100')
  })

  test('an append that fails reports false and keeps the list', async () => {
    // The log's folder is a file, so the append can't write.
    await writeFile(join(root, 'blocker'), '')
    const log = createActionLog({ file: join(root, 'blocker', 'actions.jsonl'), now: () => 1 })
    expect(await log.append(entry(7))).toBe(false)
    expect(log.recent()).toEqual([])
  })

  test('log survives restart', async () => {
    await mkdir(root, { recursive: true })
    const first = createActionLog({ file, now: () => 5 })
    await first.append(entry(7, { result: 'stale', message: 'head now bbbbbbb' }))
    const second = createActionLog({ file, now: () => 6 })
    expect(second.recent()).toEqual([{ at: 5, ...entry(7, { result: 'stale', message: 'head now bbbbbbb' }) }])
    await second.append(entry(8))
    expect(createActionLog({ file, now: () => 7 }).recent().map((e) => e.target)).toEqual(['PR #8', 'PR #7'])
  })
})

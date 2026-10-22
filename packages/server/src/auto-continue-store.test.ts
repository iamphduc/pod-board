import { mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createAutoContinueStore } from './auto-continue-store.ts'

let root: string
let file: string

beforeEach(async () => {
  root = realpathSync(await mkdtemp(join(tmpdir(), 'pod-board-s1-store-')))
  file = join(root, 'cfg', 'auto-continue.json')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const saved = () => JSON.parse(readFileSync(file, 'utf8')) as unknown
const put = (text: string) => {
  mkdirSync(join(root, 'cfg'), { recursive: true })
  writeFileSync(file, text)
}

describe('auto-continue store', () => {
  test('reads fail closed and writes atomically', async () => {
    // Missing → all off.
    expect(createAutoContinueStore({ file }).list()).toEqual([])

    // Bad JSON, or the wrong shape → all off.
    for (const text of ['{', '', 'null', '[]', '{"runs":{}}', '{"runs":"x"}', '42']) {
      put(text)
      expect(createAutoContinueStore({ file }).list(), text).toEqual([])
    }

    // Bad entries are skipped; good ones kept, in order; a repeat of one run is dropped.
    put(
      JSON.stringify({
        runs: [
          { repoId: 'r1', run: 'alpha', lastKey: 'wave-merged:7' },
          null,
          'x',
          { repoId: 'r1' },
          { run: 'alpha' },
          { repoId: 7, run: 'alpha' },
          { repoId: 'r1', run: 'beta', lastKey: 9 },
          { repoId: 'r2', run: 'fix-scroll' },
          { repoId: 'r1', run: 'alpha', lastKey: 'other' },
        ],
      }),
    )
    const store = createAutoContinueStore({ file })
    expect(store.list()).toEqual([
      { repoId: 'r1', run: 'alpha', lastKey: 'wave-merged:7' },
      { repoId: 'r2', run: 'fix-scroll' },
    ])

    // The next write replaces the bad file with good JSON.
    await store.set('r3', 'gamma', true)
    expect(saved()).toEqual({
      runs: [
        { repoId: 'r1', run: 'alpha', lastKey: 'wave-merged:7' },
        { repoId: 'r2', run: 'fix-scroll' },
        { repoId: 'r3', run: 'gamma' },
      ],
    })

    // On again clears lastKey (how to retry a failed send); off removes.
    await store.set('r1', 'alpha', true)
    expect(store.list()).toContainEqual({ repoId: 'r1', run: 'alpha' })
    expect(store.list().find((t) => t.run === 'alpha')).not.toHaveProperty('lastKey')
    await store.set('r2', 'fix-scroll', false)
    expect(store.list().map((t) => t.run)).toEqual(['alpha', 'gamma'])
    // Off for a run that has no toggle is a no-op.
    await store.set('r9', 'nope', false)
    expect(store.list().map((t) => t.run)).toEqual(['alpha', 'gamma'])

    // saveKey sets the key of a toggle that exists, and does nothing for one that doesn't.
    expect(await store.saveKey('r3', 'gamma', 'sprint-done:one')).toBe(true)
    expect(await store.saveKey('r9', 'nope', 'x')).toBe(false)
    expect(store.list()).toContainEqual({ repoId: 'r3', run: 'gamma', lastKey: 'sprint-done:one' })

    // A new store on the same file (a restart) reads what was saved.
    expect(createAutoContinueStore({ file }).list()).toEqual(store.list())

    // Written atomically: no temp files are left beside it.
    expect(readdirSync(join(root, 'cfg'))).toEqual(['auto-continue.json'])
    // Owner-only on POSIX.
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  test('a failed write keeps the file and the toggles', async () => {
    const store = createAutoContinueStore({ file })
    await store.set('r1', 'alpha', true)
    const before = readFileSync(file, 'utf8')

    const failing = createAutoContinueStore({
      file,
      write: async () => {
        throw new Error('disk full')
      },
    })
    await expect(failing.set('r1', 'beta', true)).rejects.toThrow('disk full')
    await expect(failing.set('r1', 'alpha', false)).rejects.toThrow('disk full')
    await expect(failing.saveKey('r1', 'alpha', 'k')).rejects.toThrow('disk full')
    expect(failing.list()).toEqual([{ repoId: 'r1', run: 'alpha' }])
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  test('a rename that fails leaves no temp file', async () => {
    // A folder where the file should be: reads fail closed, and the rename over it fails.
    mkdirSync(file, { recursive: true })
    const store = createAutoContinueStore({ file })
    expect(store.list()).toEqual([])
    await expect(store.set('r1', 'alpha', true)).rejects.toThrow()
    expect(store.list()).toEqual([])
    expect(readdirSync(join(root, 'cfg'))).toEqual(['auto-continue.json'])
  })

  test('writes run one at a time', async () => {
    const store = createAutoContinueStore({ file })
    await Promise.all([store.set('r1', 'a', true), store.set('r1', 'b', true), store.set('r1', 'c', true)])
    expect(store.list().map((t) => t.run)).toEqual(['a', 'b', 'c'])
    expect(saved()).toEqual({ runs: store.list() })
  })
})

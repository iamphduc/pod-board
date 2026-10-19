import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { normalizeRepoPath } from './guard.ts'
import { addRepo, loadRepos } from './repos-config.ts'

const platform = process.platform
let root: string
let cfgDir: string
let file: string
let repoA: string
let repoB: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pod-board-d1-repos-'))
  cfgDir = join(root, 'cfg', 'nested')
  file = join(cfgDir, 'config.json')
  repoA = join(root, 'Repo A')
  repoB = join(root, 'repo-b')
  await mkdir(repoA)
  await mkdir(repoB)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('addRepo rules', () => {
  test('a missing config file reads as an empty list', async () => {
    expect(await loadRepos(file)).toEqual({ repos: [] })
  })

  test('adds, reloads, and creates the config folder', async () => {
    expect(await addRepo(file, repoA, platform)).toEqual({ path: normalizeRepoPath(repoA, platform) })
    expect(await addRepo(file, repoB + '/', platform)).toEqual({ path: normalizeRepoPath(repoB, platform) })
    expect(await loadRepos(file)).toEqual({
      repos: [normalizeRepoPath(repoA, platform), normalizeRepoPath(repoB, platform)],
    })
    const saved = JSON.parse(await readFile(file, 'utf8'))
    expect(saved).toEqual({
      version: 1,
      repos: [{ path: normalizeRepoPath(repoA, platform) }, { path: normalizeRepoPath(repoB, platform) }],
    })
    // The temp file used for the write is gone.
    expect(await readdir(cfgDir)).toEqual(['config.json'])
  })

  test('the same folder again is already registered, trailing slash or not', async () => {
    await addRepo(file, repoA, platform)
    const before = await readFile(file)
    expect(await addRepo(file, repoA, platform)).toEqual({ error: 'already registered' })
    expect(await addRepo(file, repoA + '/', platform)).toEqual({ error: 'already registered' })
    expect(await addRepo(file, join(repoA, '..', 'Repo A'), platform)).toEqual({ error: 'already registered' })
    expect(await readFile(file)).toEqual(before)
  })

  test.runIf(platform === 'win32')('on win32 another case or slash style is the same repo', async () => {
    await addRepo(file, repoA, 'win32')
    const before = await readFile(file)
    expect(await addRepo(file, repoA.toUpperCase(), 'win32')).toEqual({ error: 'already registered' })
    expect(await addRepo(file, repoA.toLowerCase().replaceAll('\\', '/') + '/', 'win32')).toEqual({
      error: 'already registered',
    })
    expect(await readFile(file)).toEqual(before)
    expect(await loadRepos(file)).toEqual({ repos: [normalizeRepoPath(repoA, 'win32')] })
  })

  test.runIf(platform !== 'win32')('off win32 another case is another repo', async () => {
    await mkdir(join(root, 'REPO-B'))
    await addRepo(file, repoB, platform)
    expect(await addRepo(file, join(root, 'REPO-B'), platform)).toEqual({ path: join(root, 'REPO-B') })
  })

  test('relative and missing paths are refused and nothing is written', async () => {
    expect(await addRepo(file, 'some/relative', platform)).toEqual({ error: 'not absolute' })
    expect(await addRepo(file, '.', platform)).toEqual({ error: 'not absolute' })
    expect(await addRepo(file, '', platform)).toEqual({ error: 'not absolute' })
    // On win32 a path needs a drive or a UNC share: `\x` and `C:x` hang off the current drive or folder.
    expect(await addRepo(file, '\\x', 'win32')).toEqual({ error: 'not absolute' })
    expect(await addRepo(file, '/x', 'win32')).toEqual({ error: 'not absolute' })
    expect(await addRepo(file, 'C:x', 'win32')).toEqual({ error: 'not absolute' })
    expect(await addRepo(file, join(root, 'gone'), platform)).toEqual({ error: 'not a directory' })
    const aFile = join(root, 'plain.txt')
    await writeFile(aFile, 'x')
    expect(await addRepo(file, aFile, platform)).toEqual({ error: 'not a directory' })
    // No config file and no config folder were created.
    expect(await readdir(root)).toEqual(expect.not.arrayContaining(['cfg']))

    await addRepo(file, repoA, platform)
    const before = await readFile(file)
    expect(await addRepo(file, 'rel', platform)).toEqual({ error: 'not absolute' })
    expect(await addRepo(file, join(root, 'gone'), platform)).toEqual({ error: 'not a directory' })
    expect(await readFile(file)).toEqual(before)
    expect(await readdir(cfgDir)).toEqual(['config.json'])
  })

  test('adds made at the same time all land', async () => {
    const dirs = await Promise.all(
      ['c1', 'c2', 'c3', 'c4', 'c5'].map(async (n) => {
        await mkdir(join(root, n))
        return join(root, n)
      }),
    )
    const results = await Promise.all([...dirs, dirs[0]!].map((d) => addRepo(file, d, platform)))
    expect(results.filter((r) => 'path' in r)).toHaveLength(5)
    expect(results.filter((r) => 'error' in r)).toEqual([{ error: 'already registered' }])
    const loaded = await loadRepos(file)
    expect('repos' in loaded && [...loaded.repos].sort()).toEqual(dirs.map((d) => normalizeRepoPath(d, platform)).sort())
  })
})

describe('never overwrites an unreadable config', () => {
  const bad = [
    '{not json',
    '',
    'null',
    '[]',
    '{"version":1}',
    '{"version":1,"repos":"x"}',
    '{"version":1,"repos":[{"path":3}]}',
    '{"version":1,"repos":[null]}',
    '{"version":2,"repos":[]}',
  ]

  for (const text of bad) {
    test(`a config of ${JSON.stringify(text)} is unreadable and stays byte for byte`, async () => {
      await mkdir(cfgDir, { recursive: true })
      await writeFile(file, text)
      const before = await readFile(file)
      expect(await loadRepos(file)).toEqual({ error: 'config unreadable' })
      expect(await addRepo(file, repoA, platform)).toEqual({ error: 'config unreadable' })
      expect(await readFile(file)).toEqual(before)
      expect(await readdir(cfgDir)).toEqual(['config.json'])
    })
  }

  test('a config path that is a folder is unreadable', async () => {
    await mkdir(file, { recursive: true })
    expect(await loadRepos(file)).toEqual({ error: 'config unreadable' })
    expect(await addRepo(file, repoA, platform)).toEqual({ error: 'config unreadable' })
    expect(await readdir(file)).toEqual([])
  })
})

import { existsSync } from 'node:fs'
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

  test('another case is the same repo exactly where the real file system ignores case', async () => {
    await addRepo(file, repoB, platform)
    const other = join(root, 'REPO-B')
    // Independent check: does the other-case name reach the same folder?
    if (existsSync(other)) {
      expect(await addRepo(file, other, platform)).toEqual({ error: 'already registered' })
      expect(await loadRepos(file)).toEqual({ repos: [normalizeRepoPath(repoB, platform)] })
    } else {
      await mkdir(other)
      expect(await addRepo(file, other, platform)).toEqual({ path: normalizeRepoPath(other, platform) })
    }
  })

  test('a file system that keeps case makes another case another repo, whatever the OS', async () => {
    const other = join(root, 'REPO-B')
    if (!existsSync(other)) await mkdir(other)
    const asked: string[] = []
    const keepsCase = { ignoresCase: async (dir: string) => (asked.push(dir), false) }
    await addRepo(file, repoB, platform, keepsCase)
    expect(await addRepo(file, other, platform, keepsCase)).toEqual({ path: normalizeRepoPath(other, platform) })
    expect(asked).toContain(normalizeRepoPath(other, platform))
    // The exact same path is still the same repo.
    expect(await addRepo(file, repoB + '/', platform, keepsCase)).toEqual({ error: 'already registered' })
  })

  test('a file system that ignores case makes another case the same repo, whatever the OS', async () => {
    const other = join(root, 'REPO-B')
    if (!existsSync(other)) await mkdir(other)
    const ignores = { ignoresCase: async () => true }
    await addRepo(file, repoB, platform, ignores)
    const before = await readFile(file)
    expect(await addRepo(file, other, platform, ignores)).toEqual({ error: 'already registered' })
    expect(await readFile(file)).toEqual(before)
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

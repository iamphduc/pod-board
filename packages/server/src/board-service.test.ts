import { cpSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Board } from '@pod-board/model'
import * as model from '@pod-board/model'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createBoardService, type BoardServiceDeps } from './board-service.ts'
import type { GhReader, GhStatus, PrStatus } from './gh.ts'
import { normalizeRepoPath, repoId } from './guard.ts'
import { projectDirName } from './transcript-files.ts'
import { createBoardWatcher } from './watcher.ts'

// The model as is, with handBackPr watched, so the test can see the server uses the model's rule.
vi.mock('@pod-board/model', async (original) => {
  const actual = await original<typeof import('@pod-board/model')>()
  return { ...actual, handBackPr: vi.fn(actual.handBackPr) }
})

const platform = process.platform
const caseless = platform === 'win32' || platform === 'darwin'
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'model', 'fixtures', 'chess-web')
const NOW = Date.parse('2026-10-18T12:00:00Z')

let root: string
let configFile: string
let portsDir: string
let claudeDir: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pod-board-a1-svc-'))
  configFile = join(root, 'config', 'config.json')
  portsDir = join(root, 'ports')
  claudeDir = join(root, 'claude')
  await mkdir(portsDir)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** A copy of a model fixture (chess-web by default) at `<root>/repos/<name>`. */
function copyFixture(name = 'chess-web', fixture = 'chess-web'): string {
  const repo = join(root, 'repos', name)
  cpSync(join(dirname(FIXTURE), fixture), repo, { recursive: true })
  return repo
}

async function register(...paths: string[]): Promise<void> {
  await mkdir(dirname(configFile), { recursive: true })
  await writeFile(configFile, JSON.stringify({ version: 1, repos: paths.map((path) => ({ path })) }))
}

async function claim(port: number, repoPath: string, plan: string): Promise<void> {
  await writeFile(join(portsDir, String(port)), `${repoPath} ${plan}\n`)
}

const ts = (min: number) => new Date(NOW - 10 * 60_000 + min * 60_000).toISOString()

async function transcript(repoPath: string, id: string, agentType: string, prompt: string, description = `Build ${id}`): Promise<void> {
  const sub = join(claudeDir, 'projects', projectDirName(repoPath), 'session-1', 'subagents')
  await mkdir(sub, { recursive: true })
  await writeFile(join(sub, `agent-${id}.meta.json`), JSON.stringify({ agentType, description }))
  const lines = [
    { type: 'user', timestamp: ts(0), message: { role: 'user', content: prompt } },
    {
      type: 'assistant',
      timestamp: ts(2),
      message: { id: 'm1', model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 50 }, content: [] },
    },
  ]
  await writeFile(join(sub, `agent-${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
}

type FakeGh = GhReader & { refreshed: { repoPath: string; numbers: number[] }[]; asked: number[] }

function fakeGh(prs: Record<number, PrStatus['state']> = {}, status: GhStatus = 'ok'): FakeGh {
  const refreshed: FakeGh['refreshed'] = []
  const asked: number[] = []
  return {
    refreshed,
    asked,
    status: () => status,
    checkedAt: () => NOW,
    get(_repoPath, n) {
      asked.push(n)
      const state = prs[n]
      return state ? { number: n, state, checks: 'pass', checkedAt: NOW } : undefined
    },
    async refresh(repoPath, numbers) {
      refreshed.push({ repoPath, numbers: [...numbers] })
      return false
    },
  }
}

function deps(gh: GhReader = fakeGh()): BoardServiceDeps {
  return { configFile, portsDir, claudeDir, transcriptDays: 30, platform, gh, now: () => NOW }
}

const ENGINEER_PROMPT = '- **sprint slug:** ladder\n- **slice code:** T1\n- **branch name:** ladder-T1\n'

describe('board service', () => {
  test('builds the board', async () => {
    const repo = copyFixture()
    await register(repo)
    // The claim names the repo with forward slashes and a trailing one, as pod writes it.
    await claim(3100, repo.replaceAll('\\', '/') + '/', 'sparring-ladder')
    await transcript(repo, 'eng1', 'pod:engineer', ENGINEER_PROMPT)
    await transcript(repo, 'other', 'general-purpose', 'not a pod agent')

    const board = await createBoardService(deps()).build()
    const path = normalizeRepoPath(repo, platform)

    expect(board.generatedAt).toBe(NOW)
    expect(board.gh).toBe('ok')
    expect(board.ghCheckedAt).toBe(NOW)
    expect(board.repos).toHaveLength(1)
    const [r] = board.repos
    expect(r).toMatchObject({ id: repoId(path, platform, caseless), name: 'chess-web', path, source: 'both' })
    expect(r!.error).toBeUndefined()
    expect(r!.model.docs.supported).toBe(true)
    expect(r!.model.plans.map((p) => p.slug)).toContain('sparring-ladder')
    expect(r!.agents).toHaveLength(1)
    expect(r!.agents[0]).toMatchObject({ id: 'eng1', type: 'pod:engineer', sprint: 'ladder', slice: 'T1', tokens: 150 })
    expect(r!.claims).toEqual([{ portBase: 3100, repoPath: path, plan: 'sparring-ladder' }])
    expect(r!.prs).toEqual([])
  })

  test('serves no agent description, so a secret in the meta file appears nowhere on the Board', async () => {
    const repo = copyFixture()
    await register(repo)
    const secret = `desc-secret-${Math.random().toString(36).slice(2)}`
    await transcript(repo, 'eng1', 'pod:engineer', ENGINEER_PROMPT, secret)
    await transcript(repo, 'rev1', 'pod:reviewer', '- **plan:** sparring-ladder\n- **round:** 1\n', `Review ${secret}`)

    const board = await createBoardService(deps()).build()
    const agents = board.repos.flatMap((r) => r.agents)
    expect(agents.map((a) => a.id).sort()).toEqual(['eng1', 'rev1'])
    for (const a of agents) expect(a).not.toHaveProperty('description')
    expect(JSON.stringify(board)).not.toContain(secret)
  })

  test('a claim alone gives a claim repo; a registered repo alone a registered one; sorted by name', async () => {
    const a = copyFixture('zeta')
    const b = copyFixture('alpha')
    await register(a)
    await claim(3200, b, 'sparring-ladder')
    await claim(3300, b, 'board-feel')
    const board = await createBoardService(deps()).build()
    expect(board.repos.map((r) => [r.name, r.source])).toEqual([
      ['alpha', 'claim'],
      ['zeta', 'registered'],
    ])
    expect(board.repos[0]!.claims.map((c) => c.portBase)).toEqual([3200, 3300])
  })

  test('the same repo listed twice in the config, by other slashes, is one repo', async () => {
    const repo = copyFixture()
    await register(repo, repo.replaceAll('\\', '/') + '/')
    const board = await createBoardService(deps()).build()
    expect(board.repos).toHaveLength(1)
  })

  test('a missing repo fails soft', async () => {
    const repo = copyFixture()
    const gone = join(root, 'repos', 'gone-repo')
    await register(gone, repo)
    const board = await createBoardService(deps()).build()
    expect(board.repos.map((r) => r.name)).toEqual(['chess-web', 'gone-repo'])
    const [ok, missing] = board.repos
    expect(ok!.error).toBeUndefined()
    expect(ok!.model.plans.length).toBeGreaterThan(0)
    expect(missing!.error).toBeTruthy()
    expect(missing!.model.docs.supported).toBe(false)
    expect(missing!.model.plans).toEqual([])
    expect(missing!.agents).toEqual([])
  })

  test('an unreadable config keeps the last registered list', async () => {
    const repo = copyFixture()
    await register(repo)
    const service = createBoardService(deps())
    expect((await service.build()).repos).toHaveLength(1)
    await writeFile(configFile, '{ not json')
    expect((await service.build()).repos.map((r) => r.name)).toEqual(['chess-web'])
  })

  test('config error on the board', async () => {
    const repo = copyFixture()
    const service = createBoardService(deps())
    // No config file: never an error.
    const none = await service.build()
    expect(none.configError).toBeUndefined()
    expect('configError' in none).toBe(false)

    // Unreadable on the first read: an error, and no registered repos.
    await mkdir(dirname(configFile), { recursive: true })
    await writeFile(configFile, '{ not json')
    const first = await service.build()
    expect(first.configError).toBe('config unreadable')
    expect(first.repos).toEqual([])

    await register(repo)
    const ok = await service.build()
    expect(ok.configError).toBeUndefined()
    expect(ok.repos.map((r) => r.name)).toEqual(['chess-web'])

    // Corrupt again: set on every build, and the last list stays.
    await writeFile(configFile, '{ not json')
    for (let i = 0; i < 2; i++) {
      const bad = await service.build()
      expect(bad.configError).toBe('config unreadable')
      expect(bad.repos.map((r) => r.name)).toEqual(['chess-web'])
    }

    // A newer config version is unreadable too, never overwritten.
    await writeFile(configFile, JSON.stringify({ version: 2, repos: [] }))
    expect((await service.build()).configError).toBe('config unreadable')

    // Fixed: cleared.
    await register(repo)
    expect((await service.build()).configError).toBeUndefined()

    // Deleted: a missing file is no error.
    await rm(configFile)
    const gone = await service.build()
    expect(gone.configError).toBeUndefined()
    expect(gone.repos).toEqual([])
  })

  test('asks gh only for live PRs', async () => {
    const repo = join(root, 'repos', 'live')
    const docs = join(repo, 'pod-docs')
    await mkdir(join(docs, 'plans'), { recursive: true })
    await mkdir(join(docs, 'sprints'), { recursive: true })
    await writeFile(join(docs, 'README.md'), '# pod docs\n\npod docs: 2\n')
    await writeFile(
      join(docs, 'plans', 'p.md'),
      [
        '# Plan: P',
        '',
        '_Generated: 2026-10-01 · Status: active_',
        '',
        '## Sprint sequence',
        '',
        '| Sprint | Goal | Status | Depends on |',
        '|---|---|---|---|',
        '| s1 | first | done | — |',
        '| s2 | second | active | — |',
        '',
      ].join('\n'),
    )
    const board = (slug: string, status: string, rows: string[]) =>
      [
        `# Sprint: ${slug}`,
        '',
        `_From plan: pod-docs/plans/p.md · Slug: ${slug} · Status: ${status} · Generated: 2026-10-01_`,
        '',
        '## Status board',
        '',
        '| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |',
        '|---|---|---|---|---|---|---|---|',
        ...rows,
        '',
      ].join('\n')
    await mkdir(join(docs, 'sprints', 'archive'), { recursive: true })
    // A done sprint's open PR is not asked about.
    await writeFile(
      join(docs, 'sprints', 'archive', 's1.md'),
      board('s1', 'done', ['| 1 | A1 | a | s1-A1 | [#5](https://github.com/o/r/pull/5) open | pushed | high | — |']),
    )
    await writeFile(
      join(docs, 'sprints', 's2.md'),
      board('s2', 'active', [
        '| 1 | B1 | b | s2-B1 | [#10](https://github.com/o/r/pull/10) merged | done | high | — |',
        '| 2 | B2 | c | s2-B2 | [#11](https://github.com/o/r/pull/11) open | pushed | high | — |',
        '| 2 | B3 | d | s2-B3 | — | pending | — | — |',
      ]),
    )
    // An archived plan's open PR is not asked about.
    await writeFile(
      join(docs, 'plans', 'old.md'),
      [
        '# Plan: Old',
        '',
        '_Generated: 2026-09-01 · Status: archived_',
        '',
        '## Sprint sequence',
        '',
        '| Sprint | Goal | Status | Depends on |',
        '|---|---|---|---|',
        '| o1 | old | active | — |',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(docs, 'sprints', 'o1.md'),
      [
        '# Sprint: o1',
        '',
        '_From plan: pod-docs/plans/old.md · Slug: o1 · Status: active · Generated: 2026-09-01_',
        '',
        '## Status board',
        '',
        '| Wave | Slice | Title | Branch | PR | Status | Confidence | Depends on |',
        '|---|---|---|---|---|---|---|---|',
        '| 1 | C1 | e | o1-C1 | [#13](https://github.com/o/r/pull/13) open | pushed | high | — |',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(docs, 'handoff-queue.md'),
      [
        '# Handoff Queue',
        '',
        // Resolved: not the hand-back.
        '- `[2026-10-02 · PENDING · orchestrator → human · plan: p]` Final PR https://github.com/o/r/pull/30 awaiting you. **Resolution:** done',
        // The last pending orchestrator hand-back wins.
        '- `[2026-10-03 · PENDING · orchestrator → human · plan: p]` Plan complete: final PR https://github.com/o/r/pull/20 is awaiting your merge. **Resolution:** pending',
        // Not from the orchestrator.
        '- `[2026-10-04 · PENDING · engineer → orchestrator · plan: p]` See https://github.com/o/r/pull/40 hand-back. **Resolution:** pending',
        // From the orchestrator but no hand-back words.
        '- `[2026-10-04 · PENDING · orchestrator → human · plan: p]` Look at https://github.com/o/r/pull/41 when free. **Resolution:** pending',
        '',
      ].join('\n'),
    )
    await register(repo)
    const gh = fakeGh({ 11: 'open', 20: 'open' })
    const service = createBoardService(deps(gh))

    const first = await service.build()
    expect(first.repos[0]!.model.plans.find((p) => p.slug === 'p')?.currentSprint).toBe('s2')
    await service.refreshGh(first)
    const path = normalizeRepoPath(repo, platform)
    expect(gh.refreshed).toEqual([{ repoPath: path, numbers: [11, 20] }])

    const second = await service.build()
    expect(second.repos[0]!.prs.map((p) => p.number)).toEqual([11, 20])
    expect(new Set(gh.asked)).toEqual(new Set([11, 20]))
    // The hand-back PR comes from the model's rule, not a copy.
    expect(vi.mocked(model.handBackPr)).toHaveBeenCalledWith(expect.objectContaining({ slug: 'p' }))
  })

  test("refreshGh asks about a claimed archived plan's hand-back PR, and only while it's claimed", async () => {
    // chess-web's ui-polish close-out: archived, its hand-back links PR #91.
    const repo = copyFixture('chess-web', 'chess-web-ui-polish')
    await register(repo)
    const path = normalizeRepoPath(repo, platform)

    const unclaimed = fakeGh()
    const before = createBoardService(deps(unclaimed))
    await before.refreshGh(await before.build())
    expect(unclaimed.refreshed).toEqual([{ repoPath: path, numbers: [] }])

    await claim(3200, repo, 'ui-polish')
    const gh = fakeGh({ 91: 'merged' })
    const service = createBoardService(deps(gh))
    await service.refreshGh(await service.build())
    expect(gh.refreshed).toEqual([{ repoPath: path, numbers: [91] }])
    expect((await service.build()).repos[0]!.prs.map((p) => [p.number, p.state])).toEqual([[91, 'merged']])
  })

  test('refreshGh asks for every readable repo, even with no PRs, so gh status is known; it skips repos with an error', async () => {
    const repo = copyFixture()
    await register(join(root, 'repos', 'gone'), repo)
    const gh = fakeGh()
    const service = createBoardService(deps(gh))
    expect(await service.refreshGh(await service.build())).toBe(false)
    expect(gh.refreshed).toEqual([{ repoPath: normalizeRepoPath(repo, platform), numbers: [] }])
  })

  test('never writes into a repo', async () => {
    const repo = copyFixture()
    await register(repo)
    await transcript(repo, 'eng1', 'pod:engineer', ENGINEER_PROMPT)
    const before = await snapshot(repo)

    const service = createBoardService(deps())
    await service.build()
    const watcher = createBoardWatcher({ service, configFile, portsDir, claudeDir })
    await watcher.start()
    const changed = new Promise<Board>((resolve) => watcher.subscribe(resolve))
    // A new claim outside the repo makes one watch cycle.
    await claim(3100, repo, 'sparring-ladder')
    const next = await withTimeout(changed, 5000)
    expect(next.repos[0]!.claims).toHaveLength(1)
    await watcher.close()

    expect(await snapshot(repo)).toEqual(before)
  })
})

/** Every file and folder under `dir` with its bytes and mtime. */
async function snapshot(dir: string): Promise<Record<string, { bytes?: string; mtimeMs: number }>> {
  const out: Record<string, { bytes?: string; mtimeMs: number }> = {}
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    const full = join(entry.parentPath, entry.name)
    const info = await stat(full)
    out[full] = entry.isFile()
      ? { bytes: (await readFile(full)).toString('base64'), mtimeMs: info.mtimeMs }
      : { mtimeMs: info.mtimeMs }
  }
  return out
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms))])
}

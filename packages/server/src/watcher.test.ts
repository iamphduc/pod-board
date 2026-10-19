import { cpSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Board } from '@pod-board/model'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createBoardService, type BoardService } from './board-service.ts'
import type { GhReader } from './gh.ts'
import { createBoardWatcher, type BoardWatcher } from './watcher.ts'

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'model', 'fixtures', 'chess-web')

let root: string
let configFile: string
let portsDir: string
let claudeDir: string
let watcher: BoardWatcher | undefined

const gh: GhReader = {
  status: () => 'unknown',
  checkedAt: () => undefined,
  get: () => undefined,
  refresh: async () => false,
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pod-board-a1-watch-'))
  configFile = join(root, 'config', 'config.json')
  portsDir = join(root, 'ports')
  claudeDir = join(root, 'claude')
  await mkdir(portsDir)
})

afterEach(async () => {
  await watcher?.close()
  watcher = undefined
  await rm(root, { recursive: true, force: true })
})

function copyFixture(name: string): string {
  const repo = join(root, 'repos', name)
  cpSync(FIXTURE, repo, { recursive: true })
  return repo
}

async function register(...paths: string[]): Promise<void> {
  await mkdir(dirname(configFile), { recursive: true })
  await writeFile(configFile, JSON.stringify({ version: 1, repos: paths.map((path) => ({ path })) }))
}

function service(): BoardService {
  return createBoardService({ configFile, portsDir, claudeDir, transcriptDays: 30, platform: process.platform, gh })
}

/** Collects every board event, with a way to wait for the next one that passes `test`. */
function collect(w: BoardWatcher) {
  const events: Board[] = []
  const waiters: { test: (b: Board) => boolean; resolve: (b: Board) => void }[] = []
  w.subscribe((b) => {
    events.push(b)
    for (const waiter of [...waiters]) {
      if (waiter.test(b)) {
        waiters.splice(waiters.indexOf(waiter), 1)
        waiter.resolve(b)
      }
    }
  })
  const next = (test: (b: Board) => boolean = () => true, ms = 5000) =>
    new Promise<Board>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no matching board event within ${ms} ms`)), ms)
      waiters.push({
        test,
        resolve: (b) => {
          clearTimeout(timer)
          resolve(b)
        },
      })
    })
  return { events, next }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Wraps a service to note when each build starts, so a test can wait until the
 * watcher has gone `ms` without starting one. In poll mode a write can be seen
 * up to one poll interval late, and its rebuild follows a debounce after that.
 */
function tracked(s: BoardService) {
  let last = Date.now()
  const svc: BoardService = {
    build: () => {
      last = Date.now()
      return s.build()
    },
    refreshGh: s.refreshGh,
  }
  const quiet = async (ms: number) => {
    while (Date.now() - last < ms) await sleep(ms - (Date.now() - last))
  }
  return { service: svc, quiet }
}

const t1Status = (b: Board) =>
  b.repos[0]?.model.plans
    .find((p) => p.slug === 'sparring-ladder')
    ?.sprints.find((s) => s.slug === 'ladder')
    ?.waves.flatMap((w) => w.slices)
    .find((s) => s.code === 'T1')?.status

async function setT1(repo: string, status: string): Promise<void> {
  const file = join(repo, 'pod-docs', 'sprints', 'ladder.md')
  const text = await readFile(file, 'utf8')
  await writeFile(file, text.replace(/(\| 3 \| T1 \|[^\n]*\| — \| )[a-z-]+( \|)/, `$1${status}$2`))
}

describe('board watcher', () => {
  for (const poll of [false, true]) {
    test(`changes reach clients within 5 seconds${poll ? ' (polling)' : ''}`, async () => {
      const repo = copyFixture('chess-web')
      await register(repo)
      const { service: svc, quiet } = tracked(service())
      watcher = createBoardWatcher({ service: svc, configFile, portsDir, claudeDir, poll })
      const first = await watcher.start()
      expect(t1Status(first)).toBe('pending')
      const { events, next } = collect(watcher)

      const started = Date.now()
      await setT1(repo, 'pushed')
      const got = await next((b) => t1Status(b) === 'pushed', 5000)
      expect(Date.now() - started).toBeLessThan(5000)
      expect(watcher.board()).toBe(got)

      // Three quick edits give one event, carrying the last one. First let the
      // watcher finish with the edit above: the start-up rebuild can catch it
      // before the poller does, and the poller's late rebuild must not land
      // in the middle of the three edits.
      await quiet(poll ? 1500 : 800)
      const before = events.length
      await setT1(repo, 'blocked')
      await setT1(repo, 'pending')
      await setT1(repo, 'done')
      await next((b) => t1Status(b) === 'done', 5000)
      await sleep(poll ? 2500 : 1000)
      expect(events.length - before).toBe(1)
    }, 15_000) // The 5 s bound is checked above; the whole test, with its waits, takes longer.
  }

  test('emits only on change', async () => {
    const repo = copyFixture('chess-web')
    await register(repo)
    watcher = createBoardWatcher({ service: service(), configFile, portsDir, claudeDir })
    await watcher.start()
    const { events, next } = collect(watcher)

    // A rebuild that gives the same board (generatedAt aside) sends nothing.
    await watcher.rebuild()
    await watcher.rebuild()
    // A write that leaves the docs as they were sends nothing either.
    const file = join(repo, 'pod-docs', 'sprints', 'ladder.md')
    await writeFile(file, await readFile(file, 'utf8'))
    await sleep(1000)
    expect(events).toEqual([])

    // A new claim file adds its repo, and the watch list follows it.
    const other = copyFixture('claimed')
    await writeFile(join(portsDir, '3200'), `${other} sparring-ladder\n`)
    const added = await next((b) => b.repos.length === 2)
    expect(added.repos.find((r) => r.name === 'claimed')?.source).toBe('claim')
    expect(events).toHaveLength(1)

    await sleep(500)
    await setT1(other, 'pushed')
    const edited = await next((b) => b.repos.find((r) => r.name === 'claimed') !== undefined)
    const claimed = edited.repos.find((r) => r.name === 'claimed')!
    expect(t1Status({ ...edited, repos: [claimed] })).toBe('pushed')
  })

  test('a repo folder made after start gets watched', async () => {
    const later = join(root, 'repos', 'later')
    await register(later)
    watcher = createBoardWatcher({ service: service(), configFile, portsDir, claudeDir })
    const first = await watcher.start()
    expect(first.repos[0]!.error).toBeTruthy()
    const { next } = collect(watcher)
    cpSync(FIXTURE, later, { recursive: true })
    const fixed = await next((b) => b.repos[0]?.error === undefined)
    expect(fixed.repos[0]!.model.docs.supported).toBe(true)
  })

  test('a failed rebuild keeps the last board and sends nothing', async () => {
    const real = service()
    let fail = false
    const flaky: BoardService = {
      build: () => (fail ? Promise.reject(new Error('boom')) : real.build()),
      refreshGh: real.refreshGh,
    }
    const errors: unknown[] = []
    watcher = createBoardWatcher({ service: flaky, configFile, portsDir, claudeDir, onError: (e) => errors.push(e) })
    const first = await watcher.start()
    const { events } = collect(watcher)
    fail = true
    await watcher.rebuild()
    expect(watcher.board()).toBe(first)
    expect(events).toEqual([])
    // The start-up gh tick may rebuild (and fail) too.
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors.every((e) => e instanceof Error && e.message === 'boom')).toBe(true)
  })

  test('the gh timer refreshes gh and rebuilds', async () => {
    const real = service()
    let refreshes = 0
    const counting: BoardService = {
      build: real.build,
      refreshGh: async (b) => {
        refreshes++
        return real.refreshGh(b)
      },
    }
    watcher = createBoardWatcher({ service: counting, configFile, portsDir, claudeDir, tickMs: 100 })
    await watcher.start()
    await sleep(450)
    // One right after start, then one per tick.
    expect(refreshes).toBeGreaterThanOrEqual(3)
  })
})

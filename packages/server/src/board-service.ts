// Builds the Board: every registered repo plus every repo a port claim names,
// each with its run model, its pod agents, its live PRs, and its claims.
// Reads only; the one file the board writes is its config (repos-config.ts).
// The rules and why are in pod-docs/feature-details/server.md.

import path from 'node:path'
import {
  buildRepoModel,
  parseAgentTranscript,
  type AgentRun,
  type Board,
  type BoardRepo,
  type Claim as ModelClaim,
  type GhStatus as ModelGhStatus,
  type PrStatus as ModelPrStatus,
  type RepoModel,
} from '@pod-board/model'
import { readClaims, type Claim } from './claims.ts'
import type { GhReader, GhStatus, PrStatus } from './gh.ts'
import { ignoresCase as probeIgnoresCase, normalizeRepoPath, repoId, sameRepoPath } from './guard.ts'
import { readRepoFiles } from './repo-files.ts'
import { loadRepos } from './repos-config.ts'
import { createAgentFileReader, listAgentFiles } from './transcript-files.ts'

// claims.ts and gh.ts keep local copies of the model's contract types; these
// lines fail typecheck if a copy drifts from the model's shape.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const typesMatch: [Same<Claim, ModelClaim>, Same<PrStatus, ModelPrStatus>, Same<GhStatus, ModelGhStatus>] = [true, true, true]
void typesMatch

export type BoardServiceDeps = {
  configFile: string
  portsDir: string
  claudeDir: string
  transcriptDays: number
  platform: NodeJS.Platform
  gh: GhReader
  now?: () => number
  ignoresCase?: (dir: string) => Promise<boolean>
}

export type BoardService = {
  /** Reads every repo's files now. Uses gh's cached PRs; never waits on gh. */
  build(): Promise<Board>
  /** Asks gh about each readable repo's live PRs. `true` when anything gh knows changed. */
  refreshGh(board: Board): Promise<boolean>
}

type RepoEntry = { path: string; caseless: boolean; registered: boolean; claims: Claim[] }

export function createBoardService(deps: BoardServiceDeps): BoardService {
  const now = deps.now ?? Date.now
  const ignoresCase = deps.ignoresCase ?? probeIgnoresCase
  const agentReader = createAgentFileReader()
  // An unreadable config (a half-saved edit, say) keeps the last list it read.
  let lastRegistered: string[] = []

  async function registered(): Promise<string[]> {
    const loaded = await loadRepos(deps.configFile)
    if ('repos' in loaded) lastRegistered = loaded.repos
    return lastRegistered
  }

  async function safeClaims(): Promise<Claim[]> {
    try {
      return await readClaims(deps.portsDir)
    } catch {
      return []
    }
  }

  /** Registered paths then claimed ones, merged by Repo identity. The first spelling of a repo wins. */
  async function repoEntries(): Promise<RepoEntry[]> {
    const entries: RepoEntry[] = []
    const find = async (raw: string): Promise<RepoEntry> => {
      const p = normalizeRepoPath(raw, deps.platform)
      const hit = entries.find((e) => sameRepoPath(e.path, p, deps.platform, e.caseless))
      if (hit) return hit
      const entry: RepoEntry = { path: p, caseless: await ignoresCase(p), registered: false, claims: [] }
      entries.push(entry)
      return entry
    }
    for (const p of await registered()) (await find(p)).registered = true
    for (const c of await safeClaims()) {
      const entry = await find(c.repoPath)
      entry.claims.push({ ...c, repoPath: entry.path })
    }
    return entries
  }

  async function agentsOf(repoPath: string): Promise<AgentRun[]> {
    const files = await listAgentFiles(deps.claudeDir, repoPath, deps.transcriptDays, now())
    agentReader.retain(files)
    const runs: AgentRun[] = []
    for (const file of files) {
      try {
        const run = parseAgentTranscript(await agentReader.read(file))
        if (run) runs.push(run)
      } catch {
        // A transcript deleted between listing and reading is left out.
      }
    }
    return runs
  }

  async function buildRepo(entry: RepoEntry): Promise<BoardRepo> {
    const base = {
      id: repoId(entry.path, deps.platform, entry.caseless),
      name: pathFor(deps.platform).basename(entry.path) || entry.path,
      path: entry.path,
      source: entry.registered ? (entry.claims.length > 0 ? 'both' : 'registered') : 'claim',
      claims: entry.claims,
    } as const
    let model: RepoModel
    try {
      model = buildRepoModel(await readRepoFiles(entry.path))
    } catch (err) {
      return { ...base, error: folderError(err), model: buildRepoModel({}), agents: [], prs: [] }
    }
    const prs = livePrNumbers(model)
      .map((n) => deps.gh.get(entry.path, n))
      .filter((pr): pr is PrStatus => pr !== undefined)
    return { ...base, model, agents: await agentsOf(entry.path), prs }
  }

  return {
    async build() {
      const entries = await repoEntries()
      const repos = await Promise.all(entries.map(buildRepo))
      repos.sort((a, b) => compare(a.name.toLowerCase(), b.name.toLowerCase()) || compare(a.path, b.path))
      const board: Board = { generatedAt: now(), gh: deps.gh.status(), repos }
      const checkedAt = deps.gh.checkedAt()
      if (checkedAt !== undefined) board.ghCheckedAt = checkedAt
      return board
    },
    async refreshGh(board) {
      let changed = false
      // One repo at a time: the first call settles `gh auth status` for the rest.
      for (const repo of board.repos) {
        if (repo.error !== undefined) continue
        if (await deps.gh.refresh(repo.path, livePrNumbers(repo.model))) changed = true
      }
      return changed
    },
  }
}

const HAND_BACK = /complete|final PR|hand-?back|awaiting/i

/**
 * The PRs the board asks gh about: per plan that isn't archived, the open PRs
 * of its current sprint's slices, plus its hand-back PR. In first-seen order.
 */
export function livePrNumbers(model: RepoModel): number[] {
  const numbers = new Set<number>()
  for (const plan of model.plans) {
    if (plan.status === 'archived') continue
    const sprint = plan.sprints.find((s) => s.slug === plan.currentSprint)
    for (const slice of sprint?.waves.flatMap((w) => w.slices) ?? []) {
      if (slice.pr.state === 'open' && slice.pr.number !== undefined) numbers.add(slice.pr.number)
    }
    const handBack = handBackPr(plan.queue)
    if (handBack !== undefined) numbers.add(handBack)
  }
  return [...numbers]
}

/** N from the last pending orchestrator entry that reads as a hand-back and links `/pull/N`. */
function handBackPr(queue: RepoModel['queue']): number | undefined {
  for (let i = queue.length - 1; i >= 0; i--) {
    const e = queue[i]!
    if (!e.isPending || !/^orchestrator/i.test(e.route.trim()) || !HAND_BACK.test(e.body)) continue
    const n = /\/pull\/(\d+)/.exec(e.body)?.[1]
    if (n !== undefined) return Number(n)
  }
  return undefined
}

function folderError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ENOENT') return 'repo folder not found'
  if (code === 'ENOTDIR' || (err instanceof Error && err.message.startsWith('not a directory'))) return 'not a directory'
  return 'repo folder unreadable'
}

const pathFor = (platform: NodeJS.Platform) => (platform === 'win32' ? path.win32 : path.posix)
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

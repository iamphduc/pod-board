// Builds the Board: every registered repo plus every repo a port claim names,
// each with its run model, its pod agents, its live PRs, and its claims.
// Reads only; the one file the board writes is its config (repos-config.ts).
// The rules and why are in pod-docs/feature-details/server.md.

import path from 'node:path'
import {
  buildRepoModel,
  fixRunNames,
  handBackPr,
  parseAgentTranscript,
  type AgentRun,
  type Board,
  type BoardRepo,
  type Claim,
  type PrStatus,
  type RepoModel,
} from '@pod-board/model'
import { readClaims } from './claims.ts'
import type { GhReader } from './gh.ts'
import { ignoresCase as probeIgnoresCase, normalizeRepoPath, repoId, sameRepoPath } from './guard.ts'
import { readRepoFiles } from './repo-files.ts'
import { loadRepos } from './repos-config.ts'
import { createAgentFileCache, listAgentFiles, type AgentFile } from './transcript-files.ts'

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
  // Each transcript's AgentRun (or undefined for a non-pod agent), never its text.
  const agentRuns = createAgentFileCache((text) => parseAgentTranscript(text))
  // An unreadable config (a half-saved edit, say) keeps the last list it read.
  let lastRegistered: string[] = []

  /** The registered paths, and whether the config file exists but couldn't be read this time. */
  async function registered(): Promise<{ paths: string[]; unreadable: boolean }> {
    const loaded = await loadRepos(deps.configFile)
    if ('repos' in loaded) lastRegistered = loaded.repos
    return { paths: lastRegistered, unreadable: 'error' in loaded }
  }

  async function safeClaims(): Promise<Claim[]> {
    try {
      return await readClaims(deps.portsDir)
    } catch {
      return []
    }
  }

  /** Registered paths then claimed ones, merged by Repo identity. The first spelling of a repo wins. */
  async function repoEntries(): Promise<{ entries: RepoEntry[]; configUnreadable: boolean }> {
    const entries: RepoEntry[] = []
    const find = async (raw: string): Promise<RepoEntry> => {
      const p = normalizeRepoPath(raw, deps.platform)
      const hit = entries.find((e) => sameRepoPath(e.path, p, deps.platform, e.caseless))
      if (hit) return hit
      const entry: RepoEntry = { path: p, caseless: await ignoresCase(p), registered: false, claims: [] }
      entries.push(entry)
      return entry
    }
    const config = await registered()
    for (const p of config.paths) (await find(p)).registered = true
    for (const c of await safeClaims()) {
      const entry = await find(c.repoPath)
      entry.claims.push({ ...c, repoPath: entry.path })
    }
    return { entries, configUnreadable: config.unreadable }
  }

  /** The repo's pod agents. Adds its listed files to `listed`, so the build keeps their cache. */
  async function agentsOf(repoPath: string, listed: AgentFile[]): Promise<AgentRun[]> {
    const files = await listAgentFiles(deps.claudeDir, repoPath, deps.transcriptDays, now())
    listed.push(...files)
    const runs: AgentRun[] = []
    for (const file of files) {
      try {
        const run = await agentRuns.read(file)
        if (run) runs.push(run)
      } catch {
        // A transcript deleted between listing and reading is left out.
      }
    }
    return runs
  }

  async function buildRepo(entry: RepoEntry, listed: AgentFile[]): Promise<BoardRepo> {
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
    const numbered = livePrNumbers(model, entry.claims)
      .map((n) => deps.gh.get(entry.path, n))
      .filter((pr): pr is PrStatus => pr !== undefined)
    // A fix run's PR, found by its head branch; it replaces the same PR found by number.
    const byBranch = fixRunNames({ model, claims: entry.claims })
      .map((b) => deps.gh.getBranch(entry.path, b))
      .filter((pr): pr is PrStatus => pr !== undefined)
    const prs = [...numbered.filter((p) => !byBranch.some((b) => b.number === p.number)), ...byBranch]
    return { ...base, model, agents: await agentsOf(entry.path, listed), prs }
  }

  return {
    async build() {
      const { entries, configUnreadable } = await repoEntries()
      const listed: AgentFile[] = []
      const repos = await Promise.all(entries.map((e) => buildRepo(e, listed)))
      // Forget transcripts no repo listed this time: out of the day window, deleted, or their repo gone.
      agentRuns.retain(listed)
      repos.sort((a, b) => compare(a.name.toLowerCase(), b.name.toLowerCase()) || compare(a.path, b.path))
      const board: Board = { generatedAt: now(), gh: deps.gh.status(), repos }
      const checkedAt = deps.gh.checkedAt()
      if (checkedAt !== undefined) board.ghCheckedAt = checkedAt
      if (configUnreadable) board.configError = 'config unreadable'
      return board
    },
    async refreshGh(board) {
      let changed = false
      // One repo at a time: the first call settles `gh auth status` for the rest.
      for (const repo of board.repos) {
        if (repo.error !== undefined) continue
        if (await deps.gh.refresh(repo.path, livePrNumbers(repo.model, repo.claims), fixRunNames(repo))) changed = true
      }
      return changed
    },
  }
}

/**
 * The PRs the board asks gh about: per plan that isn't archived, the open PRs
 * of its current sprint's slices, plus its hand-back PR (the model's `handBackPr`). An archived plan a
 * claim names (pod archives it before the final merge) gives its hand-back PR too. In first-seen order.
 */
export function livePrNumbers(model: RepoModel, claims: Pick<Claim, 'plan'>[] = []): number[] {
  const numbers = new Set<number>()
  for (const plan of model.plans) {
    if (plan.status === 'archived') {
      const handBack = claims.some((c) => c.plan === plan.slug) ? handBackPr(plan) : undefined
      if (handBack !== undefined) numbers.add(handBack)
      continue
    }
    const sprint = plan.sprints.find((s) => s.slug === plan.currentSprint)
    for (const slice of sprint?.waves.flatMap((w) => w.slices) ?? []) {
      if (slice.pr.state === 'open' && slice.pr.number !== undefined) numbers.add(slice.pr.number)
    }
    const handBack = handBackPr(plan)
    if (handBack !== undefined) numbers.add(handBack)
  }
  return [...numbers]
}

function folderError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ENOENT') return 'repo folder not found'
  if (code === 'ENOTDIR' || (err instanceof Error && err.message.startsWith('not a directory'))) return 'not a directory'
  return 'repo folder unreadable'
}

const pathFor = (platform: NodeJS.Platform) => (platform === 'win32' ? path.win32 : path.posix)
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

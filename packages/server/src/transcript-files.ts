import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { envValue, type Env } from './config.ts'

/** One subagent's transcript files: `<session>/subagents/agent-<id>.jsonl` and its `.meta.json`. */
export type AgentFile = { id: string; session: string; jsonlPath: string; metaPath: string }

/** What `parseAgentTranscript` takes. `meta` is `''` when the meta file is missing. */
export type AgentFileText = { id: string; session: string; meta: string; jsonl: string }

const DAY_MS = 24 * 60 * 60 * 1000
export const DEFAULT_TRANSCRIPT_DAYS = 30

/** Claude's config folder: `POD_BOARD_CLAUDE_DIR`, else `CLAUDE_CONFIG_DIR`, else `<home>/.claude`. */
export function claudeDir(env: Env, home: string): string {
  return envValue(env, 'POD_BOARD_CLAUDE_DIR') ?? envValue(env, 'CLAUDE_CONFIG_DIR') ?? path.join(home, '.claude')
}

/** How many days back to look for sessions: `POD_BOARD_TRANSCRIPT_DAYS`, default 30. A bad value throws. */
export function transcriptDays(env: Env): number {
  const raw = envValue(env, 'POD_BOARD_TRANSCRIPT_DAYS')
  if (raw === undefined) return DEFAULT_TRANSCRIPT_DAYS
  const days = /^[0-9]+$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new Error(`POD_BOARD_TRANSCRIPT_DAYS must be a whole number of days, 1 or more, got ${JSON.stringify(raw)}`)
  }
  return days
}

/** Claude's folder name for a project: each character outside `[A-Za-z0-9]` becomes `-`. */
export function projectDirName(repoPath: string): string {
  return repoPath.replace(/[^A-Za-z0-9]/g, '-')
}

/**
 * The subagent transcripts of a repo's sessions changed in the last
 * `maxAgeDays`, sorted by session then id. A session counts as changed when
 * its folder or its `subagents/` folder changed (a new agent adds a file to
 * `subagents/` without touching the session folder). Missing folders give `[]`.
 */
export async function listAgentFiles(
  claudeDir: string,
  repoPath: string,
  maxAgeDays: number,
  now: number,
): Promise<AgentFile[]> {
  const project = path.join(claudeDir, 'projects', projectDirName(repoPath))
  const sessions = await dirsIn(project)
  const oldest = now - maxAgeDays * DAY_MS
  const found: AgentFile[] = []
  for (const session of sessions.sort()) {
    const sub = path.join(project, session, 'subagents')
    const changed = Math.max(await mtimeOf(path.join(project, session)), await mtimeOf(sub))
    if (changed < oldest) continue
    const ids = (await namesIn(sub))
      .map((n) => /^agent-(.+)\.jsonl$/.exec(n)?.[1])
      .filter((id): id is string => id !== undefined)
      .sort()
    for (const id of ids) {
      found.push({
        id,
        session,
        jsonlPath: path.join(sub, `agent-${id}.jsonl`),
        metaPath: path.join(sub, `agent-${id}.meta.json`),
      })
    }
  }
  return found
}

type Stamp = { size: number; mtimeMs: number } | undefined
type Entry = { jsonl: Stamp; meta: Stamp; text: AgentFileText }

/**
 * Reads agent files, caching each by its files' size and mtime: an agent
 * whose transcript and meta are unchanged is not read again. `retain` drops
 * the cache for agents no longer listed, so memory follows the listing.
 */
export function createAgentFileReader(): {
  read(file: AgentFile): Promise<AgentFileText>
  retain(files: readonly AgentFile[]): void
} {
  const cache = new Map<string, Entry>()
  return {
    async read(file) {
      const jsonl = await stampOf(file.jsonlPath)
      if (!jsonl) throw new Error(`transcript gone: ${file.jsonlPath}`)
      const meta = await stampOf(file.metaPath)
      const hit = cache.get(file.jsonlPath)
      if (hit && same(hit.jsonl, jsonl) && same(hit.meta, meta)) return hit.text
      const text: AgentFileText = {
        id: file.id,
        session: file.session,
        meta: meta ? await readFile(file.metaPath, 'utf8').catch(() => '') : '',
        jsonl: await readFile(file.jsonlPath, 'utf8'),
      }
      cache.set(file.jsonlPath, { jsonl, meta, text })
      return text
    },
    retain(files) {
      const keep = new Set(files.map((f) => f.jsonlPath))
      for (const key of cache.keys()) if (!keep.has(key)) cache.delete(key)
    },
  }
}

const shared = createAgentFileReader()

/** Reads an agent's files through one shared cache. See `createAgentFileReader`. */
export const readAgentFile = shared.read

/** Drops the shared cache for agents not in `files`. */
export const retainAgentFiles = shared.retain

const same = (a: Stamp, b: Stamp) => a?.size === b?.size && a?.mtimeMs === b?.mtimeMs

async function stampOf(file: string): Promise<Stamp> {
  try {
    const s = await stat(file)
    return s.isFile() ? { size: s.size, mtimeMs: s.mtimeMs } : undefined
  } catch {
    return undefined
  }
}

async function mtimeOf(p: string): Promise<number> {
  try {
    return (await stat(p)).mtimeMs
  } catch {
    return Number.NEGATIVE_INFINITY
  }
}

async function dirsIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}

async function namesIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name)
  } catch {
    return []
  }
}

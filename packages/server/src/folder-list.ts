import { lstat, readdir, readlink, stat } from 'node:fs/promises'
import path from 'node:path'
import { normalizeRepoPath } from './guard.ts'

/**
 * Lists folders for the folder picker (`GET /api/fs/folders`). It reads
 * directory entries, their types, and link targets only: never a file's
 * contents. It keeps nothing between calls.
 */

export type FolderEntry = { name: string; path: string; podDocs: boolean }

export type FolderListing = {
  /** The listed folder, normalized; null for the roots. */
  path: string | null
  /** Null at a drive root, at `/`, and for the roots. */
  parent: string | null
  /** The folder exists but can't be read. */
  locked: boolean
  /** More than `MAX_FOLDERS` folders; only the first ones by name are listed. */
  truncated: boolean
  folders: FolderEntry[]
}

export type FolderListError = 'not a local path' | 'not absolute' | 'bad request' | 'not a directory'

export type DirEntry = { name: string; isDirectory(): boolean; isSymbolicLink(): boolean }
export type EntryKind = { isDirectory(): boolean; isSymbolicLink(): boolean }

/** What the listing asks the file system; tests swap it. */
export type FolderFs = {
  readdir(dir: string): Promise<DirEntry[]>
  /** Follows links. */
  stat(p: string): Promise<EntryKind>
  /** Doesn't follow the last part if it's a link. */
  lstat(p: string): Promise<EntryKind>
  readlink(p: string): Promise<string>
}

export type FolderListDeps = { fs: FolderFs; platform: NodeJS.Platform; home: string }

/** A drive that doesn't answer within this long is left out of the roots. */
export const DRIVE_TIMEOUT_MS = 1500
export const MAX_FOLDERS = 1000
/** A chain of links longer than this is left out. */
const MAX_LINK_HOPS = 8

export const nodeFolderFs: FolderFs = {
  readdir: (dir) => readdir(dir, { withFileTypes: true }),
  stat: (p) => stat(p),
  lstat: (p) => lstat(p),
  readlink: (p) => readlink(p),
}

/** On win32, a UNC share or a device path. Reaching one can send the user's login to another machine. */
const NETWORK = /^[\\/]{2}/

const pathFor = (platform: NodeJS.Platform) => (platform === 'win32' ? path.win32 : path.posix)

/** On win32 only a drive path (`C:\x`) counts; `\x` and `C:x` depend on the current drive. */
function isAbsolute(p: string, platform: NodeJS.Platform): boolean {
  if (platform === 'win32') return /^[A-Za-z]:[\\/]/.test(p)
  return path.posix.isAbsolute(p)
}

/**
 * The subfolders of `dir`, or the roots when `dir` is undefined. The string
 * checks (NUL, network path, absolute) run before any file system call.
 */
export async function listFolders(dir: string | undefined, deps: FolderListDeps): Promise<FolderListing | { error: FolderListError }> {
  if (dir === undefined) return roots(deps)
  if (dir.includes('\0')) return { error: 'bad request' }
  if (deps.platform === 'win32' && NETWORK.test(dir)) return { error: 'not a local path' }
  if (!isAbsolute(dir, deps.platform)) return { error: 'not absolute' }

  const p = pathFor(deps.platform)
  const at = normalizeRepoPath(dir, deps.platform)
  if (deps.platform === 'win32') {
    let isLink: boolean
    try {
      isLink = (await deps.fs.lstat(at)).isSymbolicLink()
    } catch {
      return { error: 'not a directory' }
    }
    if (isLink && !(await linkIsLocal(at, deps))) return { error: 'not a local path' }
  }
  try {
    if (!(await deps.fs.stat(at)).isDirectory()) return { error: 'not a directory' }
  } catch {
    return { error: 'not a directory' }
  }

  const parent = p.dirname(at) === at ? null : p.dirname(at)
  let entries: DirEntry[]
  try {
    entries = await deps.fs.readdir(at)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { error: 'not a directory' }
    return { path: at, parent, locked: true, truncated: false, folders: [] }
  }

  const kept = await Promise.all(entries.map(async (e) => ((await isFolder(p.join(at, e.name), e, deps)) ? e.name : undefined)))
  const names = kept.filter((n): n is string => n !== undefined).sort(byName)
  const shown = names.slice(0, MAX_FOLDERS)
  const folders = await Promise.all(
    shown.map(async (name) => {
      const full = p.join(at, name)
      return { name, path: full, podDocs: await hasPodDocs(full, deps) }
    }),
  )
  return { path: at, parent, locked: false, truncated: names.length > shown.length, folders }
}

/** Case-blind by name; names that differ only in case keep a fixed order. */
function byName(a: string, b: string): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  if (x !== y) return x < y ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** A folder, or a link that ends at a local folder. Files, broken links and links to files are not. */
async function isFolder(full: string, entry: DirEntry, deps: FolderListDeps): Promise<boolean> {
  if (entry.isDirectory()) return true
  if (!entry.isSymbolicLink()) return false
  if (deps.platform === 'win32' && !(await linkIsLocal(full, deps))) return false
  try {
    return (await deps.fs.stat(full)).isDirectory()
  } catch {
    return false
  }
}

/**
 * On win32, whether a link and every link it leads to point at a local path.
 * It reads each target with `readlink` and checks it before following it, so
 * a network target is never reached.
 */
async function linkIsLocal(link: string, deps: FolderListDeps): Promise<boolean> {
  const p = path.win32
  let at = link
  try {
    for (let hop = 0; hop < MAX_LINK_HOPS; hop++) {
      const target = await deps.fs.readlink(at)
      if (NETWORK.test(target)) return false
      const next = p.resolve(p.dirname(at), target)
      if (!(await deps.fs.lstat(next)).isSymbolicLink()) return true
      at = next
    }
  } catch {
    return false
  }
  return false
}

/** Whether a folder holds a `pod-docs` folder. On win32 a linked `pod-docs` doesn't count. */
async function hasPodDocs(folder: string, deps: FolderListDeps): Promise<boolean> {
  const docs = pathFor(deps.platform).join(folder, 'pod-docs')
  try {
    const kind = deps.platform === 'win32' ? await deps.fs.lstat(docs) : await deps.fs.stat(docs)
    return kind.isDirectory()
  } catch {
    return false
  }
}

/**
 * The places to start from. On win32 each drive `A:\` to `Z:\` that answers
 * within `DRIVE_TIMEOUT_MS`, all asked at once. Elsewhere `/` and the home folder.
 */
async function roots(deps: FolderListDeps): Promise<FolderListing> {
  const candidates =
    deps.platform === 'win32'
      ? Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}:\\`)
      : [...new Set(['/', normalizeRepoPath(deps.home, deps.platform)])]
  const checked = await Promise.all(
    candidates.map((root) => {
      const check = async (): Promise<FolderEntry | undefined> => {
        if (!(await deps.fs.stat(root)).isDirectory()) return undefined
        return { name: root, path: root, podDocs: await hasPodDocs(root, deps) }
      }
      return deps.platform === 'win32' ? within(DRIVE_TIMEOUT_MS, check()) : check().catch(() => undefined)
    }),
  )
  return { path: null, parent: null, locked: false, truncated: false, folders: checked.filter((f): f is FolderEntry => f !== undefined) }
}

/** The work's answer, or undefined if it fails or takes longer than `ms`. */
async function within<T>(ms: number, work: Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms)
  })
  try {
    return await Promise.race([work.catch(() => undefined), late])
  } finally {
    clearTimeout(timer)
  }
}

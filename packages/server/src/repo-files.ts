import { open, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { RepoFiles } from '@pod-board/model'

/** Larger files are skipped: a pod doc is never this big, and the board keeps every doc in memory. */
export const MAX_DOC_BYTES = 5 * 1024 * 1024

const SINGLE_FILES = ['pod-docs/README.md', 'pod-docs/handoff-queue.md']
const MD_FOLDERS = ['pod-docs/plans', 'pod-docs/plans/archive', 'pod-docs/sprints', 'pod-docs/sprints/archive']

/**
 * The pod docs `buildRepoModel` needs, keyed by repo-relative path with `/`:
 * the docs README, the handoff queue, and the `.md` files directly in the plan
 * and sprint folders and their `archive/`. Nothing else is read, and every
 * file is opened read-only. A missing repo folder throws; a missing doc or
 * folder is left out.
 */
export async function readRepoFiles(repoPath: string): Promise<RepoFiles> {
  if (!(await stat(repoPath)).isDirectory()) throw new Error(`not a directory: ${repoPath}`)
  const keys = [...SINGLE_FILES]
  for (const folder of MD_FOLDERS) keys.push(...(await mdFilesIn(repoPath, folder)))
  const files: RepoFiles = {}
  for (const key of keys) {
    const text = await readDoc(path.join(repoPath, ...key.split('/')))
    if (text !== undefined) files[key] = text
  }
  return files
}

async function mdFilesIn(repoPath: string, folder: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(repoPath, ...folder.split('/')), { withFileTypes: true })
    // Plain files only: a folder or a symlink named `x.md` is left out.
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => `${folder}/${e.name}`)
      .sort()
  } catch {
    return []
  }
}

/** The file's text, or `undefined` when it is missing, not a plain file, or over the size limit. */
async function readDoc(file: string): Promise<string | undefined> {
  let handle
  try {
    handle = await open(file, 'r')
  } catch {
    return undefined
  }
  try {
    // Size is checked on the open handle, so a file swapped after listing can't slip past it.
    const info = await handle.stat()
    if (!info.isFile() || info.size > MAX_DOC_BYTES) return undefined
    return await handle.readFile('utf8')
  } catch {
    return undefined
  } finally {
    await handle.close()
  }
}

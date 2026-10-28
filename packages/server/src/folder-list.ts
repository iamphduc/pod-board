// Stub: the tests in folder-list.test.ts come first.

export type FolderEntry = { name: string; path: string; podDocs: boolean }

export type FolderListing = {
  path: string | null
  parent: string | null
  locked: boolean
  truncated: boolean
  folders: FolderEntry[]
}

export type FolderListError = 'not a local path' | 'not absolute' | 'bad request' | 'not a directory'

export type DirEntry = { name: string; isDirectory(): boolean; isSymbolicLink(): boolean }
export type EntryKind = { isDirectory(): boolean; isSymbolicLink(): boolean }

export type FolderFs = {
  readdir(dir: string): Promise<DirEntry[]>
  stat(p: string): Promise<EntryKind>
  lstat(p: string): Promise<EntryKind>
  readlink(p: string): Promise<string>
}

export type FolderListDeps = { fs: FolderFs; platform: NodeJS.Platform; home: string }

/** Stub. */
export const nodeFolderFs: FolderFs = undefined as never

export const DRIVE_TIMEOUT_MS = 1500
export const MAX_FOLDERS = 1000

export async function listFolders(_dir: string | undefined, _deps: FolderListDeps): Promise<FolderListing | { error: FolderListError }> {
  return { path: null, parent: null, locked: false, truncated: false, folders: [] }
}

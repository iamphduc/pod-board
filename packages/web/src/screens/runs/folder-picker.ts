// Stub: the tests come first.
import type { AddResult } from '../../add-repo.ts'

export type FolderEntry = { name: string; path: string; podDocs: boolean }
export type FolderListing = { path: string | null; parent: string | null; locked: boolean; truncated: boolean; folders: FolderEntry[] }
export type ListReply = { ok: true; data: FolderListing } | { ok: false; status: number; message: string }
export type ListDeps = { fetch?: typeof fetch; token?: () => string | null | undefined }

export const FULL_PATH = ''
export const LOCKED = ''
export const TRUNCATED = ''

export type PickerState = {
  input: string
  listing?: FolderListing
  shown: FolderEntry[]
  loading: boolean
  atRoots: boolean
  target: string | null
  adding: boolean
  note?: string
  notice?: string
  error?: string
}

export type PickerDeps = {
  list: (path: string | undefined) => Promise<ListReply>
  add: (path: string) => Promise<AddResult>
  onClose: () => void
}

export async function getFolders(_path: string | undefined, _deps: ListDeps = {}): Promise<ListReply> {
  return { ok: false, status: 0, message: '' }
}

export function startFolder(_repoPaths: string[]): string | null {
  return '?'
}

export function createFolderPicker(_deps: PickerDeps, _onChange: (s: PickerState) => void) {
  const state: PickerState = { input: '?', shown: [], loading: false, atRoots: false, target: '?', adding: false }
  return {
    state: () => state,
    start(_folder: string | null) {},
    type(_text: string) {},
    complete: () => true,
    open(_path: string) {},
    up() {},
    async add() {},
    escape() {},
    dispose() {},
  }
}

// Stub: the tests come first.
import type { PickerState } from './folder-picker.ts'

export type PickerHandlers = {
  type: (text: string) => void
  complete: () => boolean
  open: (path: string) => void
  up: () => void
  add: () => void
  close: () => void
}

export function PickerPanel(_props: { state: PickerState; on: PickerHandlers }) {
  return <section />
}

export function FolderPicker(_props: { repoPaths: string[]; onClose: () => void }) {
  return null
}

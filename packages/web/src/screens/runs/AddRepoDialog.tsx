// The Add repo dialog: the folder picker in a native modal <dialog>. The browser
// traps focus (the page behind is inert) and sends Escape as `cancel`. The logic
// is in add-dialog.ts; this file only wires it.
import { useLayoutEffect, useRef } from 'react'
import { backdropClose } from './add-dialog.ts'
import { FolderPicker } from './FolderPicker.tsx'

type Props = { repoPaths: string[]; onClose: () => void }

export function AddRepoDialog({ repoPaths, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const downOnDialog = useRef(false)
  const upOnDialog = useRef(false)

  // Before the picker's own effect focuses its path box: a closed dialog can't take focus.
  useLayoutEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
    return () => {
      if (el?.open) el.close()
    }
  }, [])

  // Close the modal first, so the opener is no longer inert when it takes focus back.
  const close = () => {
    if (ref.current?.open) ref.current.close()
    onClose()
  }

  return (
    <dialog
      ref={ref}
      className="add-dialog"
      aria-labelledby="add-dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onPointerDown={(e) => {
        downOnDialog.current = e.target === e.currentTarget
      }}
      onPointerUp={(e) => {
        upOnDialog.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (backdropClose(downOnDialog.current, e.target === e.currentTarget, upOnDialog.current)) close()
      }}
    >
      <FolderPicker repoPaths={repoPaths} onClose={close} />
    </dialog>
  )
}

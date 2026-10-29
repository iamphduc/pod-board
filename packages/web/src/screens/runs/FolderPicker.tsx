// The Add repo folder picker, shown inside AddRepoDialog. The logic is in
// folder-picker.ts; this file only wires it to React. The opener (screen 1's
// sidebar) owns the trigger and puts focus back on it after `onClose`.
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { postRepo } from '../../add-repo.ts'
import { Icon } from '../../theme/icons.tsx'
import { createFolderPicker, crumbsFor, getFolders, startFolder, type Crumb, type PickerState } from './folder-picker.ts'
import './picker.css'

export type PickerHandlers = {
  type: (text: string) => void
  /** Tab: true when it completed a name (so focus stays put). */
  complete: () => boolean
  open: (path: string) => void
  /** The root crumb: the drives, or `/` and home. */
  roots: () => void
  up: () => void
  add: () => void
  close: () => void
}

export type CrumbFoldProps = { hidden: Crumb[]; open: boolean; onToggle: () => void; onPick: (c: Crumb) => void }

/** Stub. */
export function CrumbFoldView(_props: CrumbFoldProps) {
  return null
}

/** The panel's markup for a state; FolderPicker feeds it. */
export function PickerPanel({ state, on }: { state: PickerState; on: PickerHandlers }) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      on.close()
    }
  }
  const onInputKey = (e: KeyboardEvent) => {
    if (e.key === 'Tab' && !e.shiftKey && on.complete()) e.preventDefault()
  }
  const message = state.error ?? state.note
  const crumbs = crumbsFor(state.listing)
  return (
    <section className="picker" aria-label="Add a repo" onKeyDown={onKey}>
      <div className="picker-head">
        <h2 id="add-dialog-title" className="picker-title">
          Add a repo
        </h2>
        <button className="btn sm icon quiet" type="button" aria-label="Close" onClick={on.close}>
          <Icon name="close" />
        </button>
      </div>
      <div className="picker-bar">
        <input
          id="picker-path"
          className="input picker-path"
          type="text"
          aria-label="Folder path"
          autoComplete="off"
          spellCheck={false}
          placeholder="Type a path, or pick a drive"
          value={state.input}
          aria-invalid={message ? 'true' : undefined}
          aria-describedby={message ? 'picker-message' : undefined}
          onChange={(e) => on.type(e.target.value)}
          onKeyDown={onInputKey}
        />
      </div>
      <nav className="picker-crumbs" aria-label="Folder path parts">
        <button className="btn sm icon quiet picker-up" type="button" aria-label="Up one folder" disabled={state.listing?.path == null} onClick={on.up}>
          <Icon name="arrow-up" />
        </button>
        {crumbs.map((c, i) => (
          <Fragment key={c.path ?? 'roots'}>
            {i > 0 && (
              <span className="picker-sep">
                <Icon name="chevron-right" />
              </span>
            )}
            {c.current ? (
              <span className="picker-crumb" aria-current="location">
                {c.label}
              </span>
            ) : (
              <button className="picker-crumb" type="button" onClick={() => (c.path === null ? on.roots() : on.open(c.path))}>
                {c.label}
              </button>
            )}
          </Fragment>
        ))}
      </nav>
      {message && (
        <p id="picker-message" className="picker-message" role="alert">
          {message}
        </p>
      )}
      {state.shown.length > 0 && (
        <ul className="picker-list" aria-label={state.atRoots ? 'Drives' : 'Folders'} aria-busy={state.loading || undefined}>
          {state.shown.map((f) => (
            <li key={f.path}>
              <button className="picker-row" type="button" onClick={() => on.open(f.path)}>
                <Icon name="folder" />
                <span className="picker-name">{f.name}</span>
                {f.podDocs && (
                  <span className="picker-mark">
                    <Icon name="check" />
                    pod-docs
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {state.notice && !message && (
        <p className="picker-notice" role="status">
          {state.notice}
        </p>
      )}
      <div className="picker-foot">
        <span className="picker-target mono">{state.target ?? 'Pick a folder'}</span>
        <button className="btn primary" type="button" disabled={state.target === null || state.adding} onClick={on.add}>
          Add this folder
        </button>
      </div>
    </section>
  )
}

export function FolderPicker({ repoPaths, onClose }: { repoPaths: string[]; onClose: () => void }) {
  const [state, setState] = useState<PickerState>({ input: '', shown: [], loading: true, atRoots: false, target: null, adding: false })
  // The latest onClose, so the machine needn't be rebuilt when the opener re-renders.
  const close = useRef(onClose)
  close.current = onClose
  const picker = useMemo(
    () => createFolderPicker({ list: (p) => getFolders(p), add: (p) => postRepo(p), onClose: () => close.current() }, setState),
    [],
  )
  const start = useRef(startFolder(repoPaths))
  useEffect(() => {
    picker.start(start.current)
    document.getElementById('picker-path')?.focus()
    return () => picker.dispose()
  }, [picker])
  return (
    <PickerPanel
      state={state}
      on={{
        type: picker.type,
        complete: picker.complete,
        open: picker.open,
        roots: picker.roots,
        up: picker.up,
        add: () => void picker.add(),
        close: picker.escape,
      }}
    />
  )
}

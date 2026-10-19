import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { createAddRepoForm, postRepo, type AddRepoState } from '../../add-repo.ts'

export function AddRepoForm() {
  const [state, setState] = useState<AddRepoState>({ input: '', sending: false })
  const form = useMemo(() => createAddRepoForm((path) => postRepo(path), setState), [])
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void form.submit()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') form.escape()
  }
  return (
    <form className="add-repo" onSubmit={onSubmit} onKeyDown={onKey}>
      <label className="eyebrow" htmlFor="add-repo-path">
        Add a repo
      </label>
      <div className="add-row">
        <input
          id="add-repo-path"
          className="input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Folder path, like E:\Projects\app"
          value={state.input}
          readOnly={state.sending}
          aria-invalid={state.error ? 'true' : undefined}
          aria-describedby={state.error ? 'add-repo-error' : undefined}
          onChange={(e) => form.setInput(e.target.value)}
        />
        <button className="btn primary" type="submit" disabled={state.sending}>
          {state.sending ? 'Adding…' : 'Add repo'}
        </button>
      </div>
      {state.error && (
        <p id="add-repo-error" className="add-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}

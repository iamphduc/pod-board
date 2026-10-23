// The Add repo form's state machine, over an injected `send` so tests can hold
// the answer. Submit trims the path; a blank path sends nothing; while a send is
// out, submit, edits, and Escape do nothing (the input is locked). 201 clears
// the input. An error keeps the input and shows the API's error word as a
// sentence; editing the input or Escape clears it, and Escape clears the input.

export type AddResult = { status: number; error?: string }
export type AddRepoState = { input: string; sending: boolean; error?: string }

/** POST /api/repos. The browser adds the `Origin` header the server's guard checks. */
export type PostRepoDeps = { fetch?: typeof fetch }

export async function postRepo(path: string, deps: PostRepoDeps = {}): Promise<AddResult> {
  const res = await (deps.fetch ?? fetch)('/api/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  let error: unknown
  try {
    error = ((await res.json()) as { error?: unknown } | null)?.error
  } catch {
    error = undefined
  }
  return typeof error === 'string' && error.length > 0 ? { status: res.status, error } : { status: res.status }
}

/** `already registered` → `Already registered.` With no error word, says the HTTP status. */
export function errorSentence(r: AddResult): string {
  const word = r.error?.trim()
  if (!word) return `The server refused the request (HTTP ${r.status}).`
  const s = word[0]!.toUpperCase() + word.slice(1)
  return /[.!?]$/.test(s) ? s : `${s}.`
}

export const UNREACHABLE = 'Could not reach the server.'

export function createAddRepoForm(send: (path: string) => Promise<AddResult>, onChange: (s: AddRepoState) => void) {
  let state: AddRepoState = { input: '', sending: false }
  const set = (next: AddRepoState) => {
    state = next
    onChange(state)
  }

  return {
    state: () => state,
    setInput(value: string) {
      if (state.sending) return
      set({ input: value, sending: false })
    },
    escape() {
      if (state.sending) return
      set({ input: '', sending: false })
    },
    async submit() {
      const path = state.input.trim()
      if (state.sending || path === '') return
      set({ input: state.input, sending: true })
      let result: AddResult
      try {
        result = await send(path)
      } catch {
        set({ input: state.input, sending: false, error: UNREACHABLE })
        return
      }
      if (result.status === 201) set({ input: '', sending: false })
      else set({ input: state.input, sending: false, error: errorSentence(result) })
    },
  }
}

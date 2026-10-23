import { describe, expect, it, vi } from 'vitest'
import { createAddRepoForm, errorSentence, postRepo, type AddResult } from './add-repo.ts'

/** A send whose answer the test releases by hand. */
function deferredSend() {
  const calls: string[] = []
  let release: (r: AddResult) => void = () => {}
  let fail: (e: unknown) => void = () => {}
  const send = (path: string) => {
    calls.push(path)
    return new Promise<AddResult>((res, rej) => {
      release = res
      fail = rej
    })
  }
  return { calls, send, answer: (r: AddResult) => release(r), fail: (e: unknown) => fail(e) }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('add repo form', () => {
  it('an empty or blank path sends nothing', async () => {
    const d = deferredSend()
    const form = createAddRepoForm(d.send, () => {})
    await form.submit()
    form.setInput('   ')
    await form.submit()
    expect(d.calls).toEqual([])
    expect(form.state()).toEqual({ input: '   ', sending: false })
  })

  it('trims the path before sending', async () => {
    const d = deferredSend()
    const form = createAddRepoForm(d.send, () => {})
    form.setInput('  E:\\Projects\\app  ')
    void form.submit()
    expect(d.calls).toEqual(['E:\\Projects\\app'])
  })

  it('a second submit while sending does nothing, and the input is locked', async () => {
    const d = deferredSend()
    const form = createAddRepoForm(d.send, () => {})
    form.setInput('/repo')
    const first = form.submit()
    expect(form.state().sending).toBe(true)
    await form.submit()
    form.setInput('/other')
    form.escape()
    expect(d.calls).toEqual(['/repo'])
    expect(form.state()).toEqual({ input: '/repo', sending: true })
    d.answer({ status: 201 })
    await first
    expect(form.state()).toEqual({ input: '', sending: false })
  })

  it('201 clears the input and any error', async () => {
    const d = deferredSend()
    const seen: unknown[] = []
    const form = createAddRepoForm(d.send, (s) => seen.push(s))
    form.setInput('/repo')
    const p = form.submit()
    d.answer({ status: 201 })
    await p
    expect(form.state()).toEqual({ input: '', sending: false })
    expect(seen.at(-1)).toEqual({ input: '', sending: false })
  })

  it('409 shows the error as a sentence and keeps the input', async () => {
    const d = deferredSend()
    const form = createAddRepoForm(d.send, () => {})
    form.setInput('/repo')
    const p = form.submit()
    d.answer({ status: 409, error: 'already registered' })
    await p
    expect(form.state()).toEqual({ input: '/repo', sending: false, error: 'Already registered.' })
  })

  it('a network failure shows an error and keeps the input', async () => {
    const d = deferredSend()
    const form = createAddRepoForm(d.send, () => {})
    form.setInput('/repo')
    const p = form.submit()
    d.fail(new TypeError('Failed to fetch'))
    await p
    expect(form.state()).toEqual({ input: '/repo', sending: false, error: 'Could not reach the server.' })
  })

  it('editing the input clears the error', async () => {
    const d = deferredSend()
    const form = createAddRepoForm(d.send, () => {})
    form.setInput('/repo')
    const p = form.submit()
    d.answer({ status: 400, error: 'not absolute' })
    await p
    form.setInput('/repo2')
    expect(form.state()).toEqual({ input: '/repo2', sending: false })
  })

  it('Escape clears the input and the error', async () => {
    const d = deferredSend()
    const form = createAddRepoForm(d.send, () => {})
    form.setInput('/repo')
    const p = form.submit()
    d.answer({ status: 400, error: 'not a directory' })
    await p
    expect(form.state()).toEqual({ input: '/repo', sending: false, error: 'Not a directory.' })
    form.escape()
    expect(form.state()).toEqual({ input: '', sending: false })
  })

  it('a retry after an error sends again', async () => {
    const d = deferredSend()
    const form = createAddRepoForm(d.send, () => {})
    form.setInput('/repo')
    const p = form.submit()
    d.answer({ status: 500, error: 'config unwritable' })
    await p
    void form.submit()
    await flush()
    expect(d.calls).toEqual(['/repo', '/repo'])
  })
})

describe('error sentences', () => {
  it('turns the API word into a sentence, with fallbacks', () => {
    expect(errorSentence({ status: 400, error: 'not absolute' })).toBe('Not absolute.')
    expect(errorSentence({ status: 403, error: 'forbidden origin' })).toBe('Forbidden origin.')
    expect(errorSentence({ status: 415 })).toBe('The server refused the request (HTTP 415).')
  })
})

describe('postRepo', () => {
  it('posts JSON and reads the status and error word', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: 'already registered' }), { status: 409 }))
    expect(await postRepo('/repo', { fetch: fetchFn })).toEqual({ status: 409, error: 'already registered' })
    expect(fetchFn).toHaveBeenCalledWith('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/repo' }),
    })
  })

  it('a body that is not JSON gives just the status', async () => {
    const fetchFn = vi.fn(async () => new Response('oops', { status: 502 }))
    expect(await postRepo('/repo', { fetch: fetchFn })).toEqual({ status: 502 })
    const ok = vi.fn(async () => new Response(JSON.stringify({ path: '/repo' }), { status: 201 }))
    expect(await postRepo('/repo', { fetch: ok })).toEqual({ status: 201 })
  })
})

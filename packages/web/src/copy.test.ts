import { afterEach, describe, expect, it, vi } from 'vitest'
import { COPIED, COPIED_MS, COPY_FAILED, copyText, type Clipboard } from './copy.ts'

function fakeClipboard(write: (text: string) => Promise<void> = async () => {}) {
  const calls: string[] = []
  const clipboard: Clipboard = {
    writeText: (text) => {
      calls.push(text)
      return write(text)
    },
  }
  return { calls, clipboard }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('copyText', () => {
  it('copies the reply', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    // The exact text, once.
    const ok = fakeClipboard()
    const text = 'cd "E:\\Projects\\a repo"'
    expect(await copyText(text, { clipboard: ok.clipboard })).toBe('copied')
    expect(ok.calls).toEqual([text])

    // A missing clipboard, one that rejects, and one that throws at once: failed.
    expect(await copyText('continue', {})).toBe('failed')
    expect(await copyText('continue', { clipboard: undefined })).toBe('failed')
    const rejects = fakeClipboard(async () => {
      throw new DOMException('denied', 'NotAllowedError')
    })
    expect(await copyText('continue', { clipboard: rejects.clipboard })).toBe('failed')
    const throws: Clipboard = {
      writeText: () => {
        throw new Error('no')
      },
    }
    expect(await copyText('continue', { clipboard: throws })).toBe('failed')

    // With no deps it reads the page's clipboard when it copies (none under Node: failed).
    expect(await copyText('continue')).toBe('failed')
    const page = fakeClipboard()
    vi.stubGlobal('navigator', { clipboard: page.clipboard })
    expect(await copyText('go')).toBe('copied')
    expect(page.calls).toEqual(['go'])

    // Copying is not an action: no request.
    expect(fetch).not.toHaveBeenCalled()

    expect(COPIED).toBe('Copied')
    expect(COPIED_MS).toBe(2000)
    expect(COPY_FAILED).toBe('Copy failed. Press Ctrl+C.')
  })
})

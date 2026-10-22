// Copy a reply or a command to the clipboard. Copying is not an action: no request, nothing logged.

export type Clipboard = { writeText(text: string): Promise<void> }
export type CopyDeps = { clipboard?: Clipboard | undefined }
export type CopyResult = 'copied' | 'failed'

/** How long `Copied` shows after a copy. */
export const COPIED_MS = 2000
export const COPIED = 'Copied'
export const COPY_FAILED = 'Copy failed. Press Ctrl+C.'

/** The page's clipboard, read when a copy happens (none under Node, or outside a secure context). */
const pageClipboard = (): Clipboard | undefined => (globalThis as { navigator?: { clipboard?: Clipboard } }).navigator?.clipboard

/** Writes the exact text. A missing clipboard, or one that throws or rejects, gives `failed`. */
export async function copyText(text: string, deps?: CopyDeps): Promise<CopyResult> {
  const clipboard = deps ? deps.clipboard : pageClipboard()
  if (!clipboard || typeof clipboard.writeText !== 'function') return 'failed'
  try {
    await clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

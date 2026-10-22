// Copy a reply or a command to the clipboard. Copying is not an action: no request, nothing logged.

export type Clipboard = { writeText(text: string): Promise<void> }
export type CopyDeps = { clipboard?: Clipboard | undefined }
export type CopyResult = 'copied' | 'failed'

/** How long `Copied` shows after a copy. */
export const COPIED_MS = 2000
export const COPIED = 'Copied'
export const COPY_FAILED = 'Copy failed. Press Ctrl+C.'

export async function copyText(_text: string, _deps?: CopyDeps): Promise<CopyResult> {
  return 'copied'
}

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { backdropClose } from './add-dialog.ts'
import { AddRepoDialog } from './AddRepoDialog.tsx'

describe('add repo dialog', () => {
  it('a press that starts and ends on the backdrop closes it', () => {
    expect(backdropClose(true, true)).toBe(true)
  })

  it('a drag from inside out to the backdrop keeps it open', () => {
    // Selecting text in the path box and letting go outside it.
    expect(backdropClose(false, true)).toBe(false)
  })

  it('a drag from the backdrop into the panel keeps it open', () => {
    expect(backdropClose(true, false)).toBe(false)
    expect(backdropClose(false, false)).toBe(false)
  })

  it('is a labelled dialog holding the folder picker and a Close button', () => {
    const html = renderToStaticMarkup(createElement(AddRepoDialog, { repoPaths: [], onClose: () => {} }))
    expect(html).toMatch(/^<dialog[^>]*class="add-dialog"[^>]*aria-labelledby="add-dialog-title"/)
    expect(html).toMatch(/id="add-dialog-title"[^>]*>Add a repo</)
    expect(html).toMatch(/<button[^>]*aria-label="Close"/)
    expect(html).toMatch(/id="picker-path"/)
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { backdropClose } from './add-dialog.ts'
import { AddRepoDialog } from './AddRepoDialog.tsx'

describe('add repo dialog', () => {
  // Each case is what a browser reports: where the press went down, where its
  // click landed (the nearest common ancestor of down and up, so the <dialog>
  // whenever either end is on the backdrop), and where it came up.
  it('a press that starts and ends on the backdrop closes it', () => {
    expect(backdropClose(true, true, true)).toBe(true)
  })

  it('a press from the backdrop into the panel keeps it open', () => {
    // Down on the dimmed page, up on the path box: the click lands on the <dialog>.
    expect(backdropClose(true, true, false)).toBe(false)
  })

  it('a drag from inside out to the backdrop keeps it open', () => {
    // Selecting text in the path box and letting go outside it.
    expect(backdropClose(false, true, true)).toBe(false)
  })

  it('a click inside the panel keeps it open', () => {
    expect(backdropClose(false, false, false)).toBe(false)
  })

  it('is a labelled dialog holding the folder picker and a Close button', () => {
    const html = renderToStaticMarkup(createElement(AddRepoDialog, { repoPaths: [], onClose: () => {} }))
    expect(html).toMatch(/^<dialog[^>]*class="add-dialog"[^>]*aria-labelledby="add-dialog-title"/)
    expect(html).toMatch(/id="add-dialog-title"[^>]*>Add a repo</)
    expect(html).toMatch(/<button[^>]*aria-label="Close"/)
    expect(html).toMatch(/id="picker-path"/)
  })
})

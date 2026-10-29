import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

type Rule = { selectors: string[]; body: string; media?: string }

/** Flat list of style rules; a rule inside `@media` carries its condition. */
function rules(css: string, media?: string): Rule[] {
  const out: Rule[] = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open < 0) break
    const prelude = css.slice(i, open).trim()
    let depth = 0
    let close = open
    for (; close < css.length; close++) {
      if (css[close] === '{') depth++
      else if (css[close] === '}' && --depth === 0) break
    }
    const body = css.slice(open + 1, close)
    if (prelude.startsWith('@media')) out.push(...rules(body, prelude.replace(/^@media\s*/, '').trim()))
    else if (!prelude.startsWith('@')) out.push({ selectors: prelude.split(',').map((s) => s.trim()), body, media })
    i = close + 1
  }
  return out
}

function decls(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/([a-z-]+)\s*:\s*([^;}]+)/gi)) out[m[1]!.toLowerCase()] = m[2]!.trim()
  return out
}

const NARROW = /^\(\s*max-width:\s*480px\s*\)$/
const runsRules = () => rules(stripComments(readFileSync(join(here, 'runs.css'), 'utf8')))

/** Declarations of every rule that lists `sel` exactly under `match`, merged in source order. */
function styleOf(sel: string, match: (media?: string) => boolean): Record<string, string> {
  return Object.assign({}, ...runsRules().filter((r) => match(r.media) && r.selectors.includes(sel)).map((r) => decls(r.body)))
}

describe('runs.css reply panel', () => {
  // On a phone the rows stack as columns, so a 14rem flex-basis would become a 14rem height.
  it('reply text does not grow tall on narrow screens', () => {
    for (const sel of ['.reply-row', '.reply-cmd']) {
      expect(styleOf(sel, (m) => !!m && NARROW.test(m))['flex-direction'], `${sel} stacks at ≤ 480 px`).toBe('column')
    }
    for (const sel of ['.reply-why', '.reply-cmd code']) {
      expect(styleOf(sel, (m) => !!m && NARROW.test(m))['flex'], `${sel} flex at ≤ 480 px`).toBe('0 0 auto')
    }
  })

  it('reply text keeps its desktop flex', () => {
    for (const sel of ['.reply-why', '.reply-cmd code']) {
      expect(styleOf(sel, (m) => !m)['flex'], `${sel} flex on wide screens`).toBe('1 1 14rem')
    }
  })
})

/** Whether a rule's media applies at `width` px: none, or max-width at or above it, or min-width at or below it. */
function appliesAt(media: string | undefined, width: number): boolean {
  if (!media) return true
  const max = /max-width:\s*(\d+)px/.exec(media)
  const min = /min-width:\s*(\d+)px/.exec(media)
  if (!max && !min) return !/print/.test(media) && !/prefers-/.test(media)
  return (!max || width <= Number(max[1])) && (!min || width >= Number(min[1]))
}

/** Every selector's declarations at `width` px, merged in source order. */
function stylesAt(width: number): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>()
  for (const r of runsRules()) {
    if (!appliesAt(r.media, width)) continue
    for (const sel of r.selectors) out.set(sel, { ...out.get(sel), ...decls(r.body) })
  }
  return out
}

const pxOver = (value: string | undefined, limit: number) => [...(value ?? '').matchAll(/(\d+(?:\.\d+)?)px/g)].some((m) => Number(m[1]) > limit)

describe('runs.css layout', () => {
  it('phone layout is one column', () => {
    for (const width of [480, 375]) {
      const styles = stylesAt(width)
      const body = styles.get('.screen-body')
      expect(body, '.screen-body has rules').toBeDefined()
      expect(body!['display']).toBe('grid')
      expect(body!['grid-template-columns'], `.screen-body at ${width} px`).toMatch(/^(1fr|minmax\(0,\s*1fr\))$/)
      for (const [sel, d] of styles) {
        for (const prop of ['width', 'min-width', 'flex-basis']) {
          expect(pxOver(d[prop], 375), `${sel} ${prop}: ${d[prop]} at ${width} px`).toBe(false)
        }
        expect(pxOver(d['grid-template-columns'], 375), `${sel} columns at ${width} px`).toBe(false)
      }
    }
  })

  it('the main column is about 720 px on desktop', () => {
    // The column's parts stay 720 px; only the flow, a wide data view, goes past it.
    expect(stylesAt(1280).get('.main:not(.wide) > *')?.['max-width']).toBe('720px')
    expect(stylesAt(1280).get('.screen-body')?.['grid-template-columns']).not.toMatch(/^(1fr|minmax\(0,\s*1fr\))$/)
  })
})

describe('runs.css sidebar', () => {
  it('is a full-height left column with a right border on desktop', () => {
    const side = stylesAt(1280).get('.side')
    expect(side?.['position']).toBe('sticky')
    expect(side?.['height']).toBe('100dvh')
    expect(side?.['border-right']).toMatch(/1px solid var\(--border\)/)
    // Title on top, the list in the middle, Add repo pinned to the bottom.
    expect(side?.['grid-template-rows']).toMatch(/1fr/)
    expect(stylesAt(1280).get('.screen-body')?.['padding'] ?? '0').toMatch(/^0(px)?$/)
  })

  it('scrolls a long runs list inside its row, so Add repo stays in view', () => {
    const runs = stylesAt(1280).get('.runs')
    expect(runs?.['overflow-y']).toBe('auto')
    expect(runs?.['min-height']).toBe('0')
    // The list clips its corners (overflow: hidden), so an auto row would squash it instead of scrolling.
    expect(runs?.['grid-auto-rows']).toBe('max-content')
  })

  it('stacks above the main column on phones, as before', () => {
    for (const width of [820, 480, 375]) {
      const side = stylesAt(width).get('.side')
      expect(side?.['position'], `.side at ${width} px`).toBe('static')
      expect(side?.['height'], `.side at ${width} px`).toBe('auto')
      expect(side?.['border-right'], `.side at ${width} px`).toBe('0')
      expect(side?.['border-bottom'], `.side at ${width} px`).toMatch(/1px solid var\(--border\)/)
    }
  })

  it('has no top bar rules left', () => {
    expect(runsRules().some((r) => r.selectors.includes('.bar'))).toBe(false)
  })
})

describe('runs.css main column and run cards', () => {
  it('centres the 720 px column beside the sidebar', () => {
    const styles = stylesAt(1280)
    const main = styles.get('.main')
    expect(main?.['margin-inline']).toBe('auto')
    expect(main?.['box-sizing']).toBe('content-box')
    // Each part of the column is 720 px at most, centred in the main box.
    const part = styles.get('.main:not(.wide) > *')
    expect(part?.['max-width']).toBe('720px')
    expect(part?.['width']).toBe('100%')
    expect(part?.['justify-self']).toBe('center')
    // The wave board keeps the full width.
    expect(styles.get('.main.wide')?.['max-width']).toBe('none')
  })

  it('lets the flow use more width than the column, centred, scrolling inside its own box', () => {
    const styles = stylesAt(1280)
    const px = (v: string | undefined) => Number(/^(\d+)px$/.exec(v ?? '')?.[1] ?? NaN)
    const mainCap = px(styles.get('.main')?.['max-width'])
    const flowCap = px(styles.get('.main:not(.wide) > .flow-frame')?.['max-width'])
    expect(flowCap).toBeGreaterThan(720)
    expect(mainCap).toBeGreaterThanOrEqual(flowCap)
    const frame = styles.get('.flow-frame')
    expect(frame?.['overflow-x']).toBe('auto')
    expect(frame?.['min-width']).toBe('0')
    // On a phone it still scrolls inside its box.
    expect(stylesAt(375).get('.flow-frame')?.['overflow-x']).toBe('auto')
  })

  const STATUS = /var\(--(blocked|needs-you|running|ready|idle)\)/

  it('gives cards a plain border and colours only the highlighted one', () => {
    const styles = stylesAt(1280)
    expect(styles.get('.flow-step')?.['border']).toBe('1px solid var(--border)')
    expect(styles.get('.flow-step.hi.live')?.['border-color']).toBe('var(--running)')
    expect(styles.get('.flow-step.hi.you')?.['border-color']).toBe('var(--needs-you)')
    expect(styles.get('.flow-step.hi.blocked')?.['border-color']).toBe('var(--blocked)')
    // No coloured card edges: a status colour on a border or background only on a highlighted card.
    for (const r of runsRules().filter((x) => x.selectors.some((sel) => sel.includes('flow')))) {
      const d = decls(r.body)
      for (const prop of Object.keys(d)) {
        if (!/^(border|background|box-shadow)/.test(prop) || !STATUS.test(d[prop]!)) continue
        for (const sel of r.selectors) expect(sel, `${sel} ${prop}`).toMatch(/^\.flow-step\.hi\./)
      }
    }
  })

  it('dims waiting cards by colour, not opacity, so their text stays readable', () => {
    const dim = stylesAt(1280).get('.flow-step.dim')
    expect(dim?.['opacity']).toBeUndefined()
    expect(stylesAt(1280).get('.flow-step.dim .flow-label')?.['color']).toBe('var(--muted)')
  })

  it('shows each run as its own card with a gap, not one box with dividers', () => {
    const styles = stylesAt(1280)
    const list = styles.get('.run-list')
    expect(list?.['border'] ?? 'none').toMatch(/^(0|none)$/)
    expect(list?.['gap']).toMatch(/^\d+px$/)
    expect(runsRules().some((r) => r.selectors.includes('.run-list li + li'))).toBe(false)
    const run = styles.get('.run')
    expect(run?.['border']).toMatch(/1px solid/)
    expect(run?.['border-radius']).toMatch(/var\(--radius-/)
    const picked = styles.get('.run[aria-current="true"]')
    expect(picked?.['background']).toBe('var(--hover)')
    expect(picked?.['border-color']).toBe('var(--border-strong)')
  })
})

describe('runs.css focus ring room', () => {
  it('leaves the run cards room for the whole focus ring inside the scrolling list', () => {
    const base = stripComments(readFileSync(join(here, '../../theme/base.css'), 'utf8'))
    const ring = decls(/:focus-visible\s*\{([^}]*)\}/.exec(base)![1]!)
    const width = Number(/(\d+(?:\.\d+)?)px/.exec(ring['outline']!)![1])
    const offset = Number(/(\d+(?:\.\d+)?)px/.exec(ring['outline-offset']!)![1])
    const runs = stylesAt(1280).get('.runs')!
    expect(runs['overflow-y']).toBe('auto')
    const pad = Number(/^(\d+(?:\.\d+)?)px$/.exec(runs['padding'] ?? '')?.[1] ?? 0)
    expect(pad, 'padding inside the scroll box').toBeGreaterThanOrEqual(width + offset)
    expect(runs['margin'], 'the padding is given back so the cards keep their place').toBe(`-${pad}px`)
  })
})

describe('runs.css run cards and Add repo', () => {
  it('spaces the run cards 12 px apart', () => {
    expect(stylesAt(1280).get('.run-list')?.['gap']).toBe('12px')
  })

  it('puts the status in the top-right corner, on the name line, with the fix tag under the name', () => {
    const run = stylesAt(1280).get('.run')
    expect(run?.['align-items']).toBe('baseline')
    expect(run?.['justify-content']).toBe('space-between')
    const head = stylesAt(1280).get('.run-head')
    expect(head?.['flex-direction']).toBe('column')
    expect(head?.['align-items']).toBe('flex-start')
    // One padding for every card, so one- and two-line cards line up.
    expect(runsRules().filter((r) => r.selectors.some((s) => s.startsWith('.run') && !s.startsWith('.run-') && !s.startsWith('.runs')) && 'padding' in decls(r.body))).toHaveLength(1)
  })

  it('makes Add repo as wide as the run cards, its icon and label centred', () => {
    const add = stylesAt(1280).get('.side-foot .add-repo')
    expect(add?.['width']).toBe('100%')
    expect(add?.['justify-content']).toBe('center')
    // Even sides, so the centred label isn't pushed by the lead padding.
    // Centred on its ink: the plus has about 2 px of empty space on its left, so the
    // left padding is that much smaller than the right.
    const px = (v: string | undefined) => Number(/^(\d+(?:\.\d+)?)px$/.exec(v ?? '')?.[1] ?? NaN)
    expect(px(add?.['padding-right']) - px(add?.['padding-left'])).toBe(2)
  })
})

describe('picker.css crumbs', () => {
  const pickerRules = () => rules(stripComments(readFileSync(join(here, 'picker.css'), 'utf8')))
  const at = (sel: string, media?: RegExp) =>
    Object.assign({}, ...pickerRules().filter((r) => (media ? !!r.media && media.test(r.media) : !r.media) && r.selectors.includes(sel)).map((r) => decls(r.body)))

  it('stays on one line; a long name ends in an ellipsis rather than scrolling sideways', () => {
    const row = at('.picker-crumbs')
    expect(row['display']).toBe('flex')
    expect(row['flex-wrap']).toBe('nowrap')
    expect(row['min-width']).toBe('0')
    const crumb = at('.picker-crumb')
    expect(crumb['min-width']).toBe('0')
    expect(crumb['overflow']).toBe('hidden')
    expect(crumb['text-overflow']).toBe('ellipsis')
    expect(crumb['white-space']).toBe('nowrap')
    // The root and the fold never shrink; the folder names do.
    expect(at('.picker-fold')['flex']).toMatch(/^none$|^0 0/)
    // The parent gives way before the current folder, but keeps a few letters.
    const shrink = (d: Record<string, string>) => Number(d['flex-shrink'] ?? /^\S+\s+(\S+)/.exec(d['flex'] ?? '')?.[1] ?? 1)
    // Any shrink share at all would cut the current name by a fraction of a pixel, so it doesn't shrink;
    // a cap leaves the other crumbs their room, and only a longer name ends in an ellipsis.
    expect(shrink(at('.picker-crumb[aria-current="location"]'))).toBe(0)
    expect(at('.picker-crumb[aria-current="location"]')['max-width']).toMatch(/^calc\(100% - \d+(\.\d+)?rem\)$/)
    expect(shrink(at('button.picker-crumb'))).toBeGreaterThan(0)
    // Crumbs size to their text: no min-width box around a short name such as E:.
    expect(at('button.picker-crumb')['min-width'] ?? '0').toBe('0')
    expect(at('.picker-crumb')['padding']).toBe('2px 6px')
    expect(at('.picker-crumbs')['gap']).toBe('4px')
  })

  it('crumbs are muted 14 px Geist, the text colour on hover', () => {
    const crumb = at('.picker-crumb')
    expect(crumb['color']).toBe('var(--muted)')
    expect(crumb['font']).toMatch(/var\(--size-dense\)[\s\S]*var\(--font\)/)
    expect(at('button.picker-crumb:hover')['color']).toBe('var(--fg)')
    expect(at('.picker-crumb[aria-current="location"]')['color']).toBe('var(--fg)')
  })

  it('keeps the crumbs 44 px tall to touch on phones', () => {
    expect(at('button.picker-crumb', /max-width:\s*480px/)['min-height']).toBe('44px')
    // Taller to touch, never wider: the gaps around the arrows stay even.
    expect(at('button.picker-crumb', /max-width:\s*480px/)['min-width']).toBeUndefined()
    expect(at('button.picker-crumb', /max-width:\s*480px/)['padding']).toBeUndefined()
    expect(at('.picker-fold', /max-width:\s*480px/)['min-height']).toBe('44px')
    expect(at('.picker-fold', /max-width:\s*480px/)['min-width']).toBe('44px')
    expect(at('.picker-fold-item', /max-width:\s*480px/)['min-height']).toBe('44px')
  })
})

describe('runs.css Add repo size', () => {
  it('is the regular size, not small', () => {
    // .btn is 40 px; .btn.sm would make it 32 px.
    const add = stylesAt(1280).get('.side-foot .add-repo')
    expect(add?.['height']).toBeUndefined()
    expect(add?.['width']).toBe('100%')
  })
})

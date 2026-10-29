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
    const main = stylesAt(1280).get('.main')
    expect(main?.['max-width']).toBe('720px')
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
    const main = stylesAt(1280).get('.main')
    expect(main?.['max-width']).toBe('720px')
    expect(main?.['margin-inline']).toBe('auto')
    expect(main?.['box-sizing']).toBe('content-box')
    // The wave board keeps the full width.
    expect(stylesAt(1280).get('.main.wide')?.['max-width']).toBe('none')
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

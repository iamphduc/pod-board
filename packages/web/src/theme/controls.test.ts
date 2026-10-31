import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const themeDir = dirname(fileURLToPath(import.meta.url))
const read = (name: string) => readFileSync(join(themeDir, name), 'utf8')
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

const baseRules = () => rules(stripComments(read('base.css')))
const plain = (sel: string) => baseRules().filter((r) => !r.media && r.selectors.includes(sel))

/** Declarations of every top-level rule that lists `sel` exactly, merged in source order. */
function styleOf(sel: string): Record<string, string> {
  const found = plain(sel)
  expect(found.length, `a rule for ${sel} in base.css`).toBeGreaterThan(0)
  return Object.assign({}, ...found.map((r) => decls(r.body)))
}

// ---- tokens and contrast (WCAG 2.x) ----
function blockAfter(css: string, selector: string): string {
  const at = css.indexOf(selector)
  if (at < 0) throw new Error(`selector not found: ${selector}`)
  const open = css.indexOf('{', at + selector.length - 1)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error(`unclosed block: ${selector}`)
}

function customProps(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) out[m[1]!] = m[2]!.trim()
  return out
}

const tokensCss = () => stripComments(read('tokens.css'))
const themes = (): [string, Record<string, string>][] => {
  const light = customProps(blockAfter(tokensCss(), ':root {'))
  const media = customProps(
    blockAfter(blockAfter(tokensCss(), '@media (prefers-color-scheme: dark)'), ':root:not([data-theme="light"])'),
  )
  const attr = customProps(blockAfter(tokensCss(), ':root[data-theme="dark"]'))
  return [
    ['light', light],
    ['dark (system)', { ...light, ...media }],
    ['dark (chosen)', { ...light, ...attr }],
  ]
}

function resolve(value: string, tokens: Record<string, string>): string {
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(value.trim())
  if (!ref) return value.trim()
  const next = tokens[ref[1]!]
  if (!next) throw new Error(`unknown token ${ref[1]}`)
  return resolve(next, tokens)
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`not a hex colour: ${hex}`)
  const [r, g, b] = [0, 2, 4].map((i) => {
    const s = parseInt(m[1]!.slice(i, i + 2), 16) / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// ---- colour literals ----
// CSS named colours (CSS Color 4). `currentcolor` and `transparent` are keywords
// that carry no palette value, so they stay allowed.
const NAMED = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray ' +
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue ' +
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue ' +
    'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred ' +
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue ' +
    'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen'
  ).split(' '),
)

/** Colour literals in a stylesheet's declaration values (property names and token names are skipped). */
function colorLiterals(css: string): string[] {
  const found: string[] = []
  for (const rule of rules(stripComments(css))) {
    for (const [prop, raw] of Object.entries(decls(rule.body))) {
      const value = raw.replace(/var\(\s*--[a-z0-9-]+/gi, 'var(')
      for (const m of value.matchAll(/#[0-9a-f]{3,8}\b/gi)) found.push(`${prop}: ${m[0]}`)
      for (const m of value.matchAll(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi)) found.push(`${prop}: ${m[0]}`)
      for (const word of value.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) ?? []) {
        if (NAMED.has(word)) found.push(`${prop}: ${word}`)
      }
    }
    // Attribute values in selectors (say `[data-tone="red"]`) are not colours; only values count.
  }
  return found
}


const NARROW = /^\(\s*max-width:\s*480px\s*\)$/

/** A length in px: `40px`, `0`, `0.875rem`, or a token that holds one. */
function px(value: string | undefined, where: string): number {
  expect(value, where).toBeDefined()
  const v = value!.trim()
  if (v === '0') return 0
  const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(v)
  if (ref) return px(themes()[0]![1][ref[1]!], `${where} (${ref[1]})`)
  const rem = /^([\d.]+)rem$/.exec(v)
  if (rem) return Number(rem[1]) * 16
  const m = /^([\d.]+)px$/.exec(v)
  expect(m, `${where}: ${v} is a length`).not.toBeNull()
  return Number(m![1])
}

/** Left and right padding from `padding`, `padding-inline`, and the longhands, in source order. */
function sidePadding(d: Record<string, string>, where: string): { left: number; right: number } {
  let left: string | undefined
  let right: string | undefined
  for (const [prop, value] of Object.entries(d)) {
    const parts = value.split(/\s+/)
    if (prop === 'padding') {
      right = parts[1] ?? parts[0]
      left = parts[3] ?? parts[1] ?? parts[0]
    } else if (prop === 'padding-inline') {
      left = parts[0]
      right = parts[1] ?? parts[0]
    } else if (prop === 'padding-left' || prop === 'padding-inline-start') left = value
    else if (prop === 'padding-right' || prop === 'padding-inline-end') right = value
  }
  return { left: px(left, `${where} left padding`), right: px(right, `${where} right padding`) }
}

/** Weight and size of a `font` shorthand (or the longhands). */
function fontOf(d: Record<string, string>, where: string): { weight: string; size: number } {
  let weight = d['font-weight']
  let size = d['font-size']
  if (d['font']) {
    const m = /^(\d{3})\s+(var\(--[a-z0-9-]+\)|[\d.]+(?:px|rem))/.exec(d['font'])
    expect(m, `${where} font shorthand starts with a weight and a size`).not.toBeNull()
    weight = m![1]
    size = m![2]
  }
  return { weight: weight ?? '', size: px(size, `${where} font size`) }
}

/** Declarations of every top-level rule that lists `sel`, or nothing when there is none. */
const opt = (sel: string): Record<string, string> => Object.assign({}, ...plain(sel).map((r) => decls(r.body)))

describe('controls', () => {
  it('button sizes follow the Look', () => {
    const btn = styleOf('.btn')
    expect(px(btn['height'], '.btn height')).toBe(40)
    expect(sidePadding(btn, '.btn')).toEqual({ left: 20, right: 20 })
    expect(fontOf(btn, '.btn')).toEqual({ weight: '500', size: 14 })

    const sm = { ...btn, ...styleOf('.btn.sm') }
    expect(px(sm['height'], '.btn.sm height')).toBe(32)
    expect(sidePadding(sm, '.btn.sm')).toEqual({ left: 12, right: 12 })
    expect(fontOf(sm, '.btn.sm')).toEqual({ weight: '500', size: 14 })

    // The icon side gets less padding, so the label looks centred.
    expect(sidePadding({ ...btn, ...styleOf('.btn.lead') }, '.btn.lead')).toEqual({ left: 16, right: 20 })
    expect(sidePadding({ ...btn, ...styleOf('.btn.trail') }, '.btn.trail')).toEqual({ left: 20, right: 16 })
    expect(sidePadding({ ...sm, ...styleOf('.btn.sm.lead') }, '.btn.sm.lead')).toEqual({ left: 10, right: 12 })
    expect(sidePadding({ ...sm, ...styleOf('.btn.sm.trail') }, '.btn.sm.trail')).toEqual({ left: 12, right: 10 })

    // Icon-only buttons are square at both sizes.
    const icon = { ...btn, ...styleOf('.btn.icon') }
    expect(px(icon['width'], '.btn.icon width')).toBe(40)
    expect(sidePadding(icon, '.btn.icon')).toEqual({ left: 0, right: 0 })
    const smIcon = { ...sm, ...styleOf('.btn.icon'), ...styleOf('.btn.sm.icon') }
    expect(px(smIcon['width'], '.btn.sm.icon width')).toBe(32)
    expect(px(smIcon['height'], '.btn.sm.icon height')).toBe(32)
    expect(sidePadding(smIcon, '.btn.sm.icon')).toEqual({ left: 0, right: 0 })

    // Icons inside a button are 16 px and never shrink.
    const svg = styleOf('.btn svg')
    expect(px(svg['width'], '.btn svg width')).toBe(16)
    expect(px(svg['height'], '.btn svg height')).toBe(16)
    expect(svg['flex'], '.btn svg flex').toBe('none')
  })

  it('controls are 44 px tall on narrow screens', () => {
    const narrow = baseRules().filter((r) => r.media && NARROW.test(r.media))
    expect(narrow.length, '@media (max-width: 480px) rules in base.css').toBeGreaterThan(0)
    const at = (sel: string) =>
      Object.assign({}, ...narrow.filter((r) => r.selectors.includes(sel)).map((r) => decls(r.body))) as Record<string, string>
    for (const sel of ['.btn', '.input', '.switch']) {
      expect(px(at(sel)['min-height'], `${sel} min-height at ≤ 480 px`), sel).toBe(44)
    }
    // min-height beats the 40 and 32 px heights, and min-width beats the icon widths: 44 × 44.
    const icon = { ...at('.btn'), ...at('.btn.icon') }
    expect(px(icon['min-width'], '.btn.icon min-width at ≤ 480 px')).toBe(44)
    expect(px(icon['min-height'], '.btn.icon min-height at ≤ 480 px')).toBe(44)
    // Nothing in the narrow block takes a control back under 44 px.
    for (const r of narrow) {
      if (!/^(\.btn|\.input|\.switch)/.test(r.selectors.join(','))) continue
      const d = decls(r.body)
      for (const p of ['min-height', 'height', 'min-width']) {
        if (d[p]) expect(px(d[p], `${r.selectors.join(', ')} ${p}`)).toBeGreaterThanOrEqual(44)
      }
    }
    // A textarea is taller than 44 px on its own.
    expect(px(styleOf('textarea.input')['min-height'], 'textarea.input min-height')).toBeGreaterThanOrEqual(44)
  })

  it('primary button is black and white', () => {
    const primary = styleOf('.btn.primary')
    expect(primary['background'], '.btn.primary background').toBe('var(--primary-bg)')
    expect(primary['color'], '.btn.primary color').toBe('var(--primary-fg)')
    expect(primary['border-color'], '.btn.primary border-color').toBe('var(--primary-bg)')
    // Every rule that names the primary button keeps its pair.
    for (const r of baseRules()) {
      if (!r.selectors.some((s) => s.startsWith('.btn.primary'))) continue
      const d = decls(r.body)
      const where = r.selectors.join(', ')
      if (d['color']) expect(d['color'], where).toBe('var(--primary-fg)')
      for (const p of ['background', 'background-color', 'border-color']) {
        if (d[p]) expect(d[p], `${where} ${p}`).toBe('var(--primary-bg)')
      }
    }
    // Each state that recolours a plain button has a primary rule of its own, so the plain one never wins.
    for (const r of baseRules()) {
      for (const s of r.selectors) {
        const state = /^\.btn(:[a-z-]+)$/.exec(s)?.[1]
        if (!state) continue
        const d = decls(r.body)
        if (!d['background'] && !d['color'] && !d['background-color'] && !d['border-color']) continue
        const own = opt(`.btn.primary${state}`)
        expect(own['background'], `.btn.primary${state} background`).toBe('var(--primary-bg)')
        expect(own['color'], `.btn.primary${state} color`).toBe('var(--primary-fg)')
        expect(own['border-color'], `.btn.primary${state} border-color`).toBe('var(--primary-bg)')
      }
    }
    for (const [theme, tokens] of themes()) {
      const ratio = contrast(resolve('var(--primary-fg)', tokens), resolve('var(--primary-bg)', tokens))
      expect(ratio, `${theme} primary = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('status is a dot and a word', () => {
    const STATES = { 's-bad': 'blocked', 's-you': 'needs-you', 's-run': 'running', 's-ok': 'ready', 's-idle': 'idle' }
    const noFill = (d: Record<string, string>, where: string) => {
      for (const p of ['background', 'background-color']) {
        if (d[p] !== undefined) expect(d[p], `${where} ${p}`).toMatch(/^(none|transparent)$/)
      }
    }
    for (const kind of ['.chip', '.status']) {
      noFill(styleOf(kind), kind)
      const dot = styleOf(`${kind}::before`)
      expect(dot['content'], `${kind}::before content`).toBe('""')
      expect(dot['border-radius'], `${kind}::before is round`).toBe('50%')
      expect(px(dot['width'], `${kind}::before width`)).toBe(px(dot['height'], `${kind}::before height`))
      expect(dot['background'], `${kind}::before background`).toMatch(/^var\(--dot\b/)
      // The word is plain text in fg or muted.
      expect(styleOf(kind)['color'], `${kind} color`).toMatch(/^var\(--(fg|muted)\)$/)
      for (const [cls, token] of Object.entries(STATES)) {
        const d = styleOf(`${kind}.${cls}`)
        noFill(d, `${kind}.${cls}`)
        expect(d['--dot'], `${kind}.${cls} dot`).toBe(`var(--${token})`)
        if (d['color']) expect(d['color'], `${kind}.${cls} color`).toMatch(/^var\(--(fg|muted)\)$/)
      }
    }
    // Cards have no coloured edge: one plain border, and the k-* classes draw nothing.
    const card = styleOf('.card')
    expect(card['border'], '.card border').toBe('1px solid var(--border)')
    expect(card['border-left'], '.card border-left').toBeUndefined()
    expect(card['background'], '.card background').toMatch(/^var\(--(surface|bg)\)$/)
    for (const r of baseRules()) {
      if (!r.selectors.some((s) => /\.card\.k-/.test(s))) continue
      for (const p of Object.keys(decls(r.body))) {
        expect(p, `${r.selectors.join(', ')} sets ${p}`).not.toMatch(/^(border|background|box-shadow|outline)/)
      }
    }
    const calm = styleOf('.card.calm')
    expect(calm['border-style'], '.card.calm border').toBe('dashed')
    expect(calm['background'], '.card.calm background').toBe('transparent')
  })

  it('base styles use tokens only', () => {
    // The detector itself finds each kind of literal.
    expect(colorLiterals('.x { color: #fff; background: rgb(0 0 0); border-color: hsl(0 0% 0%); fill: Red }')).toHaveLength(4)
    expect(colorLiterals('.x { white-space: nowrap; color: var(--fg); background: currentColor; border-color: transparent }')).toEqual([])

    expect(colorLiterals(read('base.css'))).toEqual([])

    // The shared classes exist and take their colours from tokens.
    const shared = [
      '.btn', '.btn.sm', '.btn.primary', '.btn.quiet', '.btn.lead', '.btn.trail', '.btn.icon',
      '.input', 'textarea.input', '.switch', '.switch::before', '.switch::after',
      '.status', '.status::before', '.chip', '.tabs', '.tab', '.tab .n', '.menu', '.seg', '.seg > button',
      '.card', '.card.calm', '.inplace', '.inplace-actions',
    ]
    for (const sel of shared) {
      const d = styleOf(sel)
      const colours = ['color', 'background', 'background-color', 'border', 'border-color', 'border-bottom', 'box-shadow', 'outline']
        .map((p) => d[p])
        .filter((v): v is string => v !== undefined && !/^(none|0|inherit|currentcolor|transparent)$/i.test(v))
      for (const v of colours) expect(v, `${sel} colour`).toMatch(/var\(--[a-z0-9-]+\)/)
    }
    // Only the menu has a shadow.
    for (const r of baseRules()) {
      const shadow = decls(r.body)['box-shadow']
      if (shadow && shadow !== 'none') expect(r.selectors, 'box-shadow').toEqual(['.menu'])
    }
    // The focus ring is the focus token.
    expect(styleOf(':focus-visible')['outline']).toBe('2px solid var(--focus)')
  })

  it('switch state is shown in form', () => {
    // A switch is a button with role="switch"; aria-checked says on or off.
    const knobOff = styleOf('.switch::after')
    const knobOn = styleOf('.switch[aria-checked="true"]::after')

    // The knob moves: a position property differs between off and on.
    const moves = ['transform', 'translate', 'left', 'right', 'inset-inline-start', 'margin-left'].filter(
      (p) => knobOn[p] !== undefined && knobOn[p] !== knobOff[p],
    )
    expect(moves, 'knob position changes when on').not.toEqual([])

    // The knob is a drawn shape, not text.
    expect(knobOff['content'], 'knob content').toBe('""')
    expect(knobOff['border-radius'], 'knob is round').toBe('50%')

    // Off is a grey track; on fills it with the text colour and turns the knob to the page colour.
    expect(styleOf('.switch::before')['background'], 'off track').toBe('var(--border-strong)')
    expect(styleOf('.switch[aria-checked="true"]::before')['background'], 'on track').toBe('var(--fg)')
    expect(knobOn['background'], 'on knob').toBe('var(--bg)')
  })
})

describe('icon and label buttons', () => {
  const at = (sel: string) => Object.assign({}, ...baseRules().filter((r) => !r.media && r.selectors.includes(sel)).map((r) => decls(r.body)))

  it('draw the icon with a stroke close to the label stem, 6 px from the label', () => {
    for (const sel of ['.btn.lead', '.btn.trail']) expect(at(sel)['gap'], `${sel} gap`).toBe('6px')
    for (const sel of ['.btn.lead svg', '.btn.trail svg']) expect(at(sel)['stroke-width'], `${sel} stroke`).toBe('1.75')
  })
})

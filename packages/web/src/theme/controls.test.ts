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

describe('controls', () => {
  it('primary button text contrast', () => {
    const primary = styleOf('.btn.primary')
    expect(primary['background'], '.btn.primary background').toBe('var(--accent)')
    expect(primary['color'], '.btn.primary color').toBeDefined()
    for (const [theme, tokens] of themes()) {
      const ratio = contrast(resolve(primary['color']!, tokens), resolve('var(--accent)', tokens))
      expect(ratio, `${theme} .btn.primary text on --accent = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    }
    // Hover and disabled never swap the text or fill to something unchecked.
    for (const r of baseRules()) {
      if (!r.selectors.some((s) => s.startsWith('.btn.primary'))) continue
      const d = decls(r.body)
      if (d['color']) expect(d['color'], r.selectors.join(', ')).toBe(primary['color'])
      if (d['background']) expect(d['background'], r.selectors.join(', ')).toBe('var(--accent)')
    }
  })

  it('controls are 44 px tall on narrow screens', () => {
    const narrow = baseRules().filter((r) => r.media && NARROW.test(r.media))
    expect(narrow.length, '@media (max-width: 480px) rules in base.css').toBeGreaterThan(0)
    for (const sel of ['.btn', '.input', '.switch']) {
      const hit = narrow.find((r) => r.selectors.includes(sel) && decls(r.body)['min-height'] === '44px')
      expect(hit, `${sel} min-height: 44px at ≤ 480 px`).toBeDefined()
    }
    // Nothing later in the narrow block takes it back down.
    for (const r of narrow) {
      const mh = decls(r.body)['min-height']
      if (mh && /^(\.btn|\.input|\.switch)/.test(r.selectors.join(','))) expect(mh, r.selectors.join(', ')).toBe('44px')
    }
    // A textarea is taller than 44 px on its own.
    const ta = styleOf('textarea.input')['min-height']
    expect(ta, 'textarea.input min-height').toMatch(/^\d+px$/)
    expect(parseInt(ta!, 10)).toBeGreaterThanOrEqual(44)
  })

  it('base styles use tokens only', () => {
    // The detector itself finds each kind of literal.
    expect(colorLiterals('.x { color: #fff; background: rgb(0 0 0); border-color: hsl(0 0% 0%); fill: Red }')).toHaveLength(4)
    expect(colorLiterals('.x { white-space: nowrap; color: var(--fg); background: currentColor; border-color: transparent }')).toEqual([])

    expect(colorLiterals(read('base.css'))).toEqual([])

    // The new controls exist and take their colours from tokens.
    for (const sel of ['.btn.quiet', 'textarea.input', '.switch', '.switch::before', '.switch::after', '.inplace']) {
      const d = styleOf(sel)
      const colours = ['color', 'background', 'background-color', 'border', 'border-color', 'border-left']
        .map((p) => d[p])
        .filter((v): v is string => v !== undefined && !/^(none|0|inherit|currentcolor|transparent)$/i.test(v))
      for (const v of colours) expect(v, `${sel} colour`).toMatch(/var\(--[a-z0-9-]+\)/)
    }
  })

  it('switch state is shown in form', () => {
    // A switch is a button with role="switch"; aria-checked says on or off.
    const knobOff = styleOf('.switch::after')
    const on = baseRules().filter((r) => !r.media && r.selectors.some((s) => s === '.switch[aria-checked="true"]::after'))
    expect(on.length, '.switch[aria-checked="true"]::after rule').toBeGreaterThan(0)
    const knobOn = Object.assign({}, ...on.map((r) => decls(r.body))) as Record<string, string>

    // The knob moves: a position property differs between off and on.
    const moves = ['transform', 'translate', 'left', 'right', 'inset-inline-start', 'margin-left'].filter(
      (p) => knobOn[p] !== undefined && knobOn[p] !== knobOff[p],
    )
    expect(moves, 'knob position changes when on').not.toEqual([])

    // The knob is a drawn shape, not text.
    expect(knobOff['content'], 'knob content').toBe('""')
    expect(knobOff['border-radius'], 'knob is round').toBe('50%')
  })
})

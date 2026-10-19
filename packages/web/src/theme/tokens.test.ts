import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const themeDir = dirname(fileURLToPath(import.meta.url))
const publicDir = join(themeDir, '..', '..', 'public')

const read = (name: string) => readFileSync(join(themeDir, name), 'utf8')
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Body of the first `{ … }` block that follows `selector`, braces balanced. */
function blockAfter(css: string, selector: string): string {
  const at = css.indexOf(selector)
  if (at < 0) throw new Error(`selector not found: ${selector}`)
  const open = css.indexOf('{', at + selector.length)
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
const light = () => customProps(blockAfter(tokensCss(), ':root {'))
const darkMedia = () =>
  customProps(blockAfter(blockAfter(tokensCss(), '@media (prefers-color-scheme: dark)'), ':root:not([data-theme="light"])'))
const darkAttr = () => customProps(blockAfter(tokensCss(), ':root[data-theme="dark"]'))

// ---- colour math (WCAG 2.x) ----
type Rgb = [number, number, number]

function hslToRgb(h: number, s: number, l: number): Rgb {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  // A browser paints 8-bit channels, so contrast is checked on the rounded colour.
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as Rgb
}

function parseColor(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as Rgb
  const hsl = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/i.exec(value)
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100)
  throw new Error(`not a colour this test reads: ${value}`)
}

/** Hue of the token as written: an hsl() hue is taken as is, a hex is converted. */
function hueOf(value: string): number {
  const hsl = /^hsl\(\s*([\d.]+)/i.exec(value)
  if (hsl) return Number(hsl[1])
  const [r, g, b] = parseColor(value).map((v) => v / 255) as Rgb
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return h * 60
}

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const x = luminance(parseColor(a))
  const y = luminance(parseColor(b))
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// ---- the plan's ## Look palette ----
const LOOK = {
  bg: ['#f4f5f8', '#0f121a'],
  panel: ['#ffffff', '#171b26'],
  'panel-2': ['#eef0f5', '#1e2331'],
  line: ['#d9dde7', '#2c3344'],
  fg: ['#161a26', '#e8eaf1'],
  muted: ['#5d6478', '#9aa1b4'],
  accent: ['#2f55d4', '#7e9bff'],
  'accent-soft': ['#e4e9fb', '#232c4d'],
  ok: ['#1d8a55', '#4fc58a'],
  'ok-soft': ['#dff3e8', '#173326'],
  warn: ['#b26a00', '#f0ae47'],
  'warn-soft': ['#fbefd9', '#3a2c14'],
  bad: ['#c2373a', '#f07a7c'],
  'bad-soft': ['#f9e1e1', '#3d1d20'],
  idle: ['#7a8194', '#8b92a6'],
  'idle-soft': ['#eceef3', '#232836'],
} as const

const STATES = ['accent', 'ok', 'warn', 'bad', 'idle'] as const

const themes = () => [
  ['light', light()],
  ['dark', darkMedia()],
] as const

describe('tokens', () => {
  it('palette tokens match the Look', () => {
    const l = light()
    const d = darkMedia()
    for (const [name, [lv, dv]] of Object.entries(LOOK)) {
      expect(l[`--${name}`]?.toLowerCase(), `light --${name}`).toBe(lv)
      expect(d[`--${name}`]?.toLowerCase(), `dark --${name}`).toBe(dv)
    }
    // Both dark selectors hold the same set, value for value.
    expect(darkAttr()).toEqual(d)
    expect(Object.keys(d).length).toBeGreaterThan(0)
    // Dark also flips native controls and scrollbars.
    for (const sel of [':root[data-theme="dark"]', '@media (prefers-color-scheme: dark)']) {
      expect(blockAfter(tokensCss(), sel)).toMatch(/color-scheme:\s*dark/)
    }
    expect(blockAfter(tokensCss(), ':root {')).toMatch(/color-scheme:\s*light/)
    // Font stacks from the preview.
    expect(l['--display']).toMatch(/^"Bricolage Grotesque"/)
    expect(l['--body']).toMatch(/^"Instrument Sans"/)
    expect(l['--mono']).toMatch(/^"JetBrains Mono"/)
  })

  it('text contrast is at least 4.5 to 1', () => {
    for (const [theme, t] of themes()) {
      const pairs: [string, string][] = []
      for (const text of ['fg', 'muted']) for (const surface of ['bg', 'panel', 'panel-2']) pairs.push([text, surface])
      for (const s of STATES) pairs.push([`${s}-ink`, `${s}-soft`], [`${s}-ink`, 'panel'])
      pairs.push(['panel', 'accent'])
      for (const [fg, bg] of pairs) {
        const a = t[`--${fg}`]
        const b = t[`--${bg}`]
        expect(a, `${theme} --${fg}`).toBeDefined()
        expect(b, `${theme} --${bg}`).toBeDefined()
        const ratio = contrast(a!, b!)
        expect(ratio, `${theme} ${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('ink tokens keep the Look\'s hues', () => {
    const l = light()
    const d = darkMedia()
    for (const s of STATES) {
      expect(d[`--${s}-ink`]?.toLowerCase(), `dark --${s}-ink`).toBe(d[`--${s}`]?.toLowerCase())
      const ink = l[`--${s}-ink`]
      expect(ink, `light --${s}-ink`).toBeDefined()
      const gap = hueGap(hueOf(ink!), hueOf(l[`--${s}`]!))
      expect(gap, `light --${s}-ink hue drift`).toBeLessThanOrEqual(1)
      // A base that already passes is kept as is.
      const base = l[`--${s}`]!
      if (contrast(base, l[`--${s}-soft`]!) >= 4.5 && contrast(base, l['--panel']!) >= 4.5) {
        expect(ink!.toLowerCase(), `light --${s}-ink`).toBe(base)
      }
    }
  })

  it('chips write state text in ink and keep the base colour for the dot', () => {
    const base = stripComments(read('base.css'))
    const chip = { 's-run': 'accent', 's-ok': 'ok', 's-you': 'warn', 's-bad': 'bad', 's-idle': 'idle' }
    for (const [cls, s] of Object.entries(chip)) {
      expect(base, cls).toContain(`.chip.${cls} {`)
      const body = blockAfter(base, `.chip.${cls} {`)
      expect(body, cls).toMatch(new RegExp(`color:\\s*var\\(--${s}-ink\\)`))
      expect(body, cls).toMatch(new RegExp(`background:\\s*var\\(--${s}-soft\\)`))
      expect(body, cls).toMatch(new RegExp(`--chip-dot:\\s*var\\(--${s}\\)`))
    }
    const edge = { 'k-run': 'accent', 'k-ok': 'ok', 'k-you': 'warn', 'k-bad': 'bad' }
    for (const [cls, s] of Object.entries(edge)) {
      expect(blockAfter(base, `.card.${cls} {`), cls).toMatch(new RegExp(`border-left-color:\\s*var\\(--${s}\\)`))
    }
    for (const sel of ['.btn {', '.btn.primary {', '.input {', '.frame {', '.eyebrow {', '.mono {', ':focus-visible {']) {
      expect(() => blockAfter(base, sel), sel).not.toThrow()
    }
    expect(blockAfter(base, '.btn {')).toMatch(/appearance:\s*none/)
    expect(blockAfter(base, '.input {')).toMatch(/appearance:\s*none/)
    expect(blockAfter(base, ':focus-visible {')).toMatch(/outline:\s*2px solid var\(--accent\)/)
  })

  it('fonts are served from the app', () => {
    const fonts = stripComments(read('fonts.css'))
    const faces = [...fonts.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]!)
    const declared = new Set<string>()
    for (const face of faces) {
      const family = /font-family:\s*"([^"]+)"/.exec(face)?.[1]
      const weight = /font-weight:\s*(\d+)/.exec(face)?.[1]
      const urls = [...face.matchAll(/url\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]!)
      expect(urls.length, `${family} ${weight} has a url`).toBeGreaterThan(0)
      for (const url of urls) {
        expect(url.startsWith('/fonts/'), url).toBe(true)
        expect(url.endsWith('.woff2'), url).toBe(true)
        const file = join(publicDir, url)
        expect(existsSync(file), `${url} exists`).toBe(true)
        expect(readFileSync(file).subarray(0, 4).toString('latin1'), `${url} is woff2`).toBe('wOF2')
      }
      expect(face).toMatch(/font-display:\s*swap/)
      declared.add(`${family} ${weight}`)
    }
    expect([...declared].sort()).toEqual(
      [
        'Bricolage Grotesque 600',
        'Bricolage Grotesque 700',
        'Instrument Sans 400',
        'Instrument Sans 500',
        'Instrument Sans 600',
        'JetBrains Mono 400',
        'JetBrains Mono 500',
      ].sort(),
    )
    // Each family ships its OFL license beside the font files.
    for (const family of ['bricolage-grotesque', 'instrument-sans', 'jetbrains-mono']) {
      const license = join(publicDir, 'fonts', `${family}-OFL.txt`)
      expect(existsSync(license), license).toBe(true)
      expect(readFileSync(license, 'utf8')).toContain('SIL Open Font License')
    }
    // No theme file reaches another host.
    for (const name of readdirSync(themeDir)) {
      if (name.endsWith('.test.ts') || !statSync(join(themeDir, name)).isFile()) continue
      expect(read(name), name).not.toMatch(/https?:\/\//i)
    }
    // index.css pulls in the rest.
    const index = stripComments(read('index.css'))
    for (const part of ['fonts.css', 'tokens.css', 'base.css']) expect(index).toContain(`@import './${part}'`)
  })

  it('type sizes', () => {
    const tokens = light()
    const toPx = (value: string): number => {
      const v = value.trim()
      const ref = /^var\((--[a-z0-9-]+)\)$/i.exec(v)
      if (ref) {
        const target = tokens[ref[1]!]
        if (!target) throw new Error(`unknown size token ${ref[1]}`)
        return toPx(target)
      }
      const rem = /^([\d.]+)rem$/.exec(v)
      if (rem) return Number(rem[1]) * 16
      const px = /^([\d.]+)px$/.exec(v)
      if (px) return Number(px[1])
      throw new Error(`font size this test can't read: ${v}`)
    }
    // The size inside a `font:` shorthand is the token before the optional `/line-height`.
    const shorthandSize = (value: string): string => {
      const m = /(var\(--[a-z0-9-]+\)|[\d.]+(?:rem|px))(?:\s*\/|\s+(?:var\(--(?:body|display|mono)\)|"))/i.exec(value)
      if (!m) throw new Error(`font shorthand without a size: ${value}`)
      return m[1]!
    }

    const base = stripComments(read('base.css'))
    const bodySize = /font-size:\s*([^;]+);/.exec(blockAfter(base, 'body {'))?.[1]
    expect(bodySize, 'body font-size').toBeDefined()
    expect(toPx(bodySize!)).toBe(16)

    const sizes: [string, number][] = []
    for (const [name, value] of Object.entries(tokens)) if (name.startsWith('--size-')) sizes.push([name, toPx(value)])
    expect(sizes.length, 'size tokens').toBeGreaterThan(0)
    for (const file of ['tokens.css', 'base.css', 'fonts.css', 'index.css']) {
      const css = stripComments(read(file))
      for (const m of css.matchAll(/font-size:\s*([^;}]+)/g)) sizes.push([`${file} font-size ${m[1]}`, toPx(m[1]!)])
      for (const m of css.matchAll(/(?<![-\w])font:\s*([^;}]+)/g)) {
        if (/^\s*inherit\s*$/.test(m[1]!)) continue
        sizes.push([`${file} font ${m[1]}`, toPx(shorthandSize(m[1]!))])
      }
    }
    for (const [where, px] of sizes) expect(px, where).toBeGreaterThanOrEqual(12)
  })
})

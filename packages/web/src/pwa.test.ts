import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(web, 'public')

type Icon = { src: string; sizes: string; type: string; purpose?: string }
type Manifest = Record<string, unknown> & { icons: Icon[] }

const manifest = (): Manifest => {
  expect(existsSync(join(pub, 'manifest.webmanifest'))).toBe(true)
  return JSON.parse(readFileSync(join(pub, 'manifest.webmanifest'), 'utf8')) as Manifest
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(file)
  expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(b.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

/** The dark palette, the default theme: custom properties in the `:root[data-theme="dark"]` block of the theme tokens. */
function darkTokens(): Map<string, string> {
  const css = readFileSync(join(web, 'src/theme/tokens.css'), 'utf8')
  const at = css.indexOf(':root[data-theme="dark"]')
  expect(at, 'dark block in tokens.css').toBeGreaterThanOrEqual(0)
  const block = css.slice(at, css.indexOf('}', at))
  return new Map([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim().toLowerCase()]))
}

describe('installable manifest', () => {
  it('has the fields an install needs', () => {
    const m = manifest()
    expect(m.name).toBe('Pod Board')
    expect(typeof m.short_name).toBe('string')
    expect((m.short_name as string).length).toBeGreaterThan(0)
    expect(m.start_url).toBe('/')
    expect(m.display).toBe('standalone')
  })

  it('takes its colours from the dark tokens', () => {
    // Dark is the default theme, so the install splash and title bar are its page colour.
    const m = manifest()
    const bg = darkTokens().get('--bg')
    expect(bg, 'dark --bg').toBeDefined()
    expect(m.background_color).toBe(bg)
    expect(m.theme_color).toBe(bg)
  })

  it('lists 192 and 512 px PNG icons that exist at those sizes, one maskable', () => {
    const { icons } = manifest()
    for (const icon of icons) {
      expect(icon.src.startsWith('/')).toBe(true)
      const file = join(pub, icon.src)
      expect(existsSync(file), icon.src).toBe(true)
      expect(icon.type).toBe('image/png')
      const { w, h } = pngSize(file)
      expect(icon.sizes).toBe(`${w}x${h}`)
    }
    const any = icons.filter((i) => (i.purpose ?? 'any').split(' ').includes('any'))
    expect(any.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512'])
    expect(icons.filter((i) => i.purpose?.split(' ').includes('maskable'))).toHaveLength(1)
  })

  it('index.html links the manifest, has both theme-color metas, and names no other host', () => {
    const html = readFileSync(join(web, 'index.html'), 'utf8')
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/)
    expect(html).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#[0-9a-f]{6}"/)
    expect(html).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#[0-9a-f]{6}"/)
    expect(html).not.toMatch(/(https?:)?\/\/[\w.-]+/i)
  })
})

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return cssFiles(p)
    return name.endsWith('.css') ? [p] : []
  })
}

describe('screens use only tokens', () => {
  it('screen CSS has no hex, rgb, or hsl colour literal', () => {
    expect(existsSync(join(web, 'src/screens'))).toBe(true)
    const files = cssFiles(join(web, 'src/screens'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(css, f).not.toMatch(/#[0-9a-f]{3,8}\b/i)
      expect(css, f).not.toMatch(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i)
    }
  })
})

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { THEME_KEY } from './theme/theme.ts'

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8')

/** Every `<script>` tag in index.html, in order, with its attributes and body. */
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({
  attrs: m[1]!,
  body: m[2]!,
  at: m.index,
}))
const inline = scripts.filter((s) => !/\bsrc\s*=/.test(s.attrs))
const moduleScript = scripts.find((s) => /type\s*=\s*["']module["']/.test(s.attrs) && /\bsrc\s*=/.test(s.attrs))

type Calls = [string, ...string[]][]

/** Runs the boot script against a fake root and a storage reached through `get` (which may throw). */
function boot(get: () => { getItem(key: string): string | null } | null): Calls {
  const calls: Calls = []
  const documentElement = {
    setAttribute: (name: string, value: string) => void calls.push(['set', name, value]),
    removeAttribute: (name: string) => void calls.push(['remove', name]),
  }
  const window = {} as Record<string, unknown>
  Object.defineProperty(window, 'localStorage', { get })
  const context = { window, document: { documentElement } }
  Object.defineProperty(context, 'localStorage', { get })
  runInNewContext(inline[0]!.body, context)
  return calls
}

const store = (values: Record<string, string>) => () => ({ getItem: (k: string) => values[k] ?? null })

describe('theme boot', () => {
  it('applies the stored theme before render', () => {
    expect(inline).toHaveLength(1)
    expect(moduleScript).toBeDefined()
    // It runs before the module script, in the head, and loads nothing.
    expect(inline[0]!.at).toBeLessThan(moduleScript!.at)
    expect(inline[0]!.at).toBeLessThan(html.indexOf('</head>'))
    expect(inline[0]!.body).not.toMatch(/https?:|\/\/|import\s*\(/)
    // It reads THEME_KEY, by that exact name.
    expect(inline[0]!.body).toMatch(new RegExp(`['"]${THEME_KEY}['"]`))

    expect(boot(store({ [THEME_KEY]: 'dark' }))).toEqual([['set', 'data-theme', 'dark']])
    expect(boot(store({ [THEME_KEY]: 'light' }))).toEqual([['set', 'data-theme', 'light']])

    // Missing, unknown, or under another key: nothing.
    expect(boot(store({}))).toEqual([])
    expect(boot(store({ [THEME_KEY]: 'system' }))).toEqual([])
    expect(boot(store({ [THEME_KEY]: 'blue' }))).toEqual([])
    expect(boot(store({ theme: 'dark' }))).toEqual([])
    expect(boot(() => null)).toEqual([])

    // Storage that throws, on access or on read: nothing, and no error.
    expect(
      boot(() => {
        throw new Error('blocked')
      }),
    ).toEqual([])
    expect(
      boot(() => ({
        getItem: () => {
          throw new Error('denied')
        },
      })),
    ).toEqual([])
  })
})

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

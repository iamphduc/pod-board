import { readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

// `model` stays pure: it gets file text in and hands a model out. Anything
// that reads disk, spawns processes, or talks to the network lives in
// `server`. This test enforces that rule on every file under src/.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, '')))

// Network packages that aren't Node builtins but still do I/O.
const NETWORK_PACKAGES = ['undici', 'node-fetch', 'axios', 'ws', 'got']

/** Every module specifier a source file imports, re-exports, or requires. */
function specifiers(source: string): string[] {
  const found: string[] = []
  const patterns = [
    /\bimport\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, // import x from 'a'
    /\bimport\s*['"]([^'"]+)['"]/g, // import 'a'
    /\bexport\s+[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, // export { x } from 'a'
    /\bimport\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, // import('a')
    /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, // require('a')
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) found.push(match[1])
    }
  }
  return found
}

function isIo(specifier: string): boolean {
  if (specifier.startsWith('node:')) return true
  const root = specifier.split('/')[0] ?? specifier
  if (BUILTINS.has(root)) return true
  return NETWORK_PACKAGES.includes(root)
}

/** The I/O modules a source file pulls in. */
export function ioImports(source: string): string[] {
  return specifiers(source).filter(isIo)
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(c|m)?[jt]sx?$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('no-io rule', () => {
  test('catches each import form of an I/O module', () => {
    expect(ioImports(`import { readFileSync } from 'node:fs'`)).toEqual(['node:fs'])
    expect(ioImports(`import fs from 'fs'`)).toEqual(['fs'])
    expect(ioImports(`import * as path from "path"`)).toEqual(['path'])
    expect(ioImports(`import type { Stats } from 'fs/promises'`)).toEqual(['fs/promises'])
    expect(ioImports(`import {\n  spawn,\n} from 'child_process'`)).toEqual(['child_process'])
    expect(ioImports(`import 'http'`)).toEqual(['http'])
    expect(ioImports(`export { request } from 'https'`)).toEqual(['https'])
    expect(ioImports(`const net = await import('net')`)).toEqual(['net'])
    expect(ioImports(`const os = require("os")`)).toEqual(['os'])
    expect(ioImports(`import { fetch } from 'undici'`)).toEqual(['undici'])
  })

  test('lets plain imports through', () => {
    expect(ioImports(`import { parsePlan } from './pod-flow/model'`)).toEqual([])
    expect(ioImports(`import type { Dispatch } from './types'`)).toEqual([])
    expect(ioImports(`const s = 'see the path module docs'`)).toEqual([])
  })

  test('model src does no I/O', () => {
    const files = sourceFiles(SRC)
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.flatMap((file) =>
      ioImports(readFileSync(file, 'utf8')).map(
        (spec) => `${relative(SRC, file).replace(/\\/g, '/')} imports ${spec}`,
      ),
    )
    expect(offenders).toEqual([])
  })
})

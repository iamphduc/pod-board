import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { resolveBin } from './bin-path.ts'

const WIN = process.platform === 'win32'
const SEP = WIN ? ';' : ':'

let tmp: string
const home = process.cwd()
let dirA: string
let dirB: string

/** A fake `tool` in `dir`: `tool.exe` and `tool.bat` on Windows, an executable `tool` on POSIX. */
function plant(dir: string): void {
  mkdirSync(dir, { recursive: true })
  if (WIN) {
    writeFileSync(join(dir, 'tool.exe'), '')
    writeFileSync(join(dir, 'tool.bat'), '@echo off\r\n')
  } else {
    writeFileSync(join(dir, 'tool'), '#!/bin/sh\n')
    chmodSync(join(dir, 'tool'), 0o755)
  }
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'bin-path-'))
  dirA = join(tmp, 'a')
  dirB = join(tmp, 'b')
  plant(dirA)
  mkdirSync(dirB)
  // Run from the temp folder, so a relative path to it is truly relative (not another drive).
  process.chdir(tmp)
})

afterEach(() => {
  process.chdir(home)
  rmSync(tmp, { recursive: true, force: true })
})

describe('resolveBin', () => {
  test('skips empty and relative PATH entries, even ones that hold the bin', () => {
    const rel = path.relative(process.cwd(), dirA)
    expect(path.isAbsolute(rel)).toBe(false)
    // `rel` names a real folder with the bin, from the board's own folder; it's still skipped.
    expect(resolveBin('tool', { PATH: ['', '.', rel, ''].join(SEP) })).toBeUndefined()
  })

  test('returns an absolute path from the first absolute PATH entry that has the bin', () => {
    const rel = path.relative(process.cwd(), dirA)
    const hit = resolveBin('tool', { PATH: [rel, '.', dirB, dirA].join(SEP) })
    expect(hit).toBeDefined()
    expect(path.isAbsolute(hit!)).toBe(true)
    expect(path.dirname(hit!)).toBe(dirA)
  })

  test('a bin named with a relative folder comes back absolute', () => {
    const rel = path.relative(process.cwd(), join(dirA, 'tool'))
    expect(path.isAbsolute(rel)).toBe(false)
    const hit = resolveBin(rel, { PATH: '' })
    expect(hit).toBeDefined()
    expect(path.isAbsolute(hit!)).toBe(true)
    expect(path.dirname(hit!)).toBe(dirA)
  })

  test.runIf(WIN)('on Windows `exts` limits the extensions that count', () => {
    const env = { PATH: dirA, PATHEXT: '.BAT;.EXE' }
    expect(resolveBin('tool', env)).toBe(join(dirA, 'tool.bat'))
    expect(resolveBin('tool', env, 'win32', { exts: ['.com', '.exe'] })).toBe(join(dirA, 'tool.exe'))
  })
})

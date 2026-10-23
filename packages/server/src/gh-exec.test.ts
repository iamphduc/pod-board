import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createGhExec, ghBin } from './gh.ts'

const WIN = process.platform === 'win32'
const SEP = WIN ? ';' : ':'
const SYS32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')

let tmp: string
const home = process.cwd()
let repo: string
let pathDir: string
let emptyDir: string

/**
 * A harmless stand-in for `gh` in `dir`. On Windows a copy of a system tool (`hostname.exe`
 * for the planted one, `whoami.exe` for the one on PATH); on POSIX a script that prints `says`.
 */
function plantGh(dir: string, says: 'planted' | 'from-path'): void {
  mkdirSync(dir, { recursive: true })
  if (WIN) {
    copyFileSync(join(SYS32, says === 'planted' ? 'hostname.exe' : 'whoami.exe'), join(dir, 'gh.exe'))
  } else {
    writeFileSync(join(dir, 'gh'), `#!/bin/sh\necho ${says}\n`)
    chmodSync(join(dir, 'gh'), 0o755)
  }
}

/** What the PATH stand-in prints when it runs. */
const fromPathOutput = () => (WIN ? execFileSync(join(SYS32, 'whoami.exe'), { encoding: 'utf8' }).trim() : 'from-path')

/** The test process's env with PATH replaced (SystemRoot kept, which Windows tools need). */
const envWithPath = (...dirs: string[]): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) if (k.toUpperCase() !== 'PATH') env[k] = v
  return { ...env, PATH: dirs.join(SEP) }
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'gh-exec-'))
  repo = join(tmp, 'repo')
  pathDir = join(tmp, 'bin')
  emptyDir = join(tmp, 'empty')
  mkdirSync(emptyDir)
  // A cloned repo with its own gh at its root.
  plantGh(repo, 'planted')
  // Run from the temp folder, so a relative path to it is truly relative (not another drive).
  process.chdir(tmp)
})

afterEach(() => {
  process.chdir(home)
  rmSync(tmp, { recursive: true, force: true })
})

describe('gh exec', () => {
  test('a gh in the repo folder never runs, even with `.` or an empty entry on PATH', async () => {
    const exec = createGhExec(envWithPath('.', '', emptyDir))
    const r = await exec([], repo)
    expect(r.status).toBe('not-found')
  })

  test('runs the gh found on PATH, not the one in the repo folder', async () => {
    plantGh(pathDir, 'from-path')
    const exec = createGhExec(envWithPath('.', pathDir))
    const r = await exec([], repo)
    expect(r.status).toBe('ok')
    expect(r.stdout.trim()).toBe(fromPathOutput())
  })

  test('a gh installed after a not-found is picked up on the next call', async () => {
    const exec = createGhExec(envWithPath(pathDir))
    expect((await exec([], repo)).status).toBe('not-found')
    plantGh(pathDir, 'from-path')
    expect((await exec([], repo)).status).toBe('ok')
  })

  test('ghBin is an absolute path from an absolute PATH entry', () => {
    plantGh(pathDir, 'from-path')
    const rel = path.relative(process.cwd(), repo)
    expect(path.isAbsolute(rel)).toBe(false)
    expect(ghBin(envWithPath('.', rel, emptyDir))).toBeUndefined()
    const bin = ghBin(envWithPath('.', rel, pathDir))
    expect(bin).toBeDefined()
    expect(path.isAbsolute(bin!)).toBe(true)
    expect(path.dirname(bin!)).toBe(pathDir)
  })

  test.runIf(WIN)('on Windows only gh.exe or gh.com count, as the old bare-name lookup did', () => {
    mkdirSync(pathDir)
    writeFileSync(join(pathDir, 'gh.bat'), '@echo off\r\n')
    writeFileSync(join(pathDir, 'gh.cmd'), '@echo off\r\n')
    expect(ghBin(envWithPath(pathDir))).toBeUndefined()
  })
})

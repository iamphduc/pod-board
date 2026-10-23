import { accessSync, constants, statSync } from 'node:fs'
import path from 'node:path'

/** The env value of `name`, matched in any case (Windows env names ignore case). */
export const envKey = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name)
  return key === undefined ? undefined : env[key]
}

export const isFile = (file: string): boolean => {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

const isExecutable = (file: string): boolean => {
  try {
    accessSync(file, constants.X_OK)
    return isFile(file)
  } catch {
    return false
  }
}

/**
 * The file `bin` names, looked up on the env's PATH when it's a bare name. On Windows
 * only files with a PATHEXT extension count, so npm's extensionless sh shim is skipped
 * for its `.cmd` twin.
 */
export function resolveBin(bin: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string | undefined {
  const win = platform === 'win32'
  const p = win ? path.win32 : path.posix
  const exts = win
    ? (envKey(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean).map((e) => e.toLowerCase())
    : []
  const hasExt = exts.includes(p.extname(bin).toLowerCase())
  const named = (base: string): string[] => (win ? [...(hasExt ? [base] : []), ...exts.map((e) => base + e)] : [base])
  const ok = win ? isFile : isExecutable

  const hasDir = bin.includes('/') || (win && bin.includes('\\'))
  if (hasDir) return named(bin).find(ok)
  const dirs = (envKey(env, 'PATH') ?? '').split(win ? ';' : ':').filter(Boolean)
  for (const dir of dirs) {
    const hit = named(p.join(dir, bin)).find(ok)
    if (hit) return hit
  }
  return undefined
}

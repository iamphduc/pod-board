import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repo-relative path → file text, as the Shared contract's Repo snapshot. */
export type RepoFiles = Record<string, string>

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

/** The fixture repos: each folder directly under `fixtures/`. */
function fixtureNames(): string[] {
  return readdirSync(FIXTURES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(full) : [full]
  })
}

/** One fixture repo's files, keyed by path from the repo root with `/` on every OS. */
export function loadFixture(name: string): RepoFiles {
  // Only a folder name listed under fixtures/ counts, so `../x` or `a/b` can't reach elsewhere.
  if (!fixtureNames().includes(name)) {
    throw new Error(`unknown fixture "${name}"; known: ${fixtureNames().join(', ')}`)
  }
  const root = join(FIXTURES, name)
  const files: RepoFiles = {}
  for (const file of filesUnder(root).sort()) {
    if (!statSync(file).isFile()) continue
    files[relative(root, file).split(/[\\/]/).join('/')] = readFileSync(file, 'utf8')
  }
  return files
}

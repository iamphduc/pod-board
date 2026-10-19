import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { MAX_DOC_BYTES, readRepoFiles } from './repo-files.ts'

let repo: string

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'pod-board-d1-repo-'))
})

afterEach(async () => {
  await rm(repo, { recursive: true, force: true })
})

async function put(rel: string, text: string | Buffer): Promise<void> {
  const full = join(repo, ...rel.split('/'))
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, text)
}

describe('reads only pod docs', () => {
  test('reads the listed files with "/" keys and leaves the rest out', async () => {
    const wanted = [
      'pod-docs/README.md',
      'pod-docs/handoff-queue.md',
      'pod-docs/plans/board-read.md',
      'pod-docs/plans/archive/old-plan.md',
      'pod-docs/sprints/server-runs.md',
      'pod-docs/sprints/archive/bootstrap-model.md',
    ]
    for (const rel of wanted) await put(rel, `# ${rel}\n`)

    const unwanted = [
      'README.md',
      'pod-docs/features.md',
      'pod-docs/codebase-structure.md',
      'pod-docs/known-issues/x.md',
      'pod-docs/plans/notes.txt',
      'pod-docs/plans/draft.MD.bak',
      'pod-docs/plans/deep/inner.md',
      'pod-docs/plans/archive/deeper/inner.md',
      'pod-docs/sprints/archive/2025/x.md',
      'pod-docs/sprints/x.markdown',
      'docs/plans/x.md',
    ]
    for (const rel of unwanted) await put(rel, 'nope')
    // A folder named like a doc is not a doc.
    await mkdir(join(repo, 'pod-docs', 'sprints', 'folder.md'))

    const files = await readRepoFiles(repo)
    expect(Object.keys(files).sort()).toEqual([...wanted].sort())
    for (const rel of wanted) expect(files[rel]).toBe(`# ${rel}\n`)
  })

  test('over-size files are left out; a file at the limit is read', async () => {
    await put('pod-docs/README.md', '# readme\n')
    await put('pod-docs/plans/at-limit.md', Buffer.alloc(MAX_DOC_BYTES, 'a'))
    await put('pod-docs/sprints/too-big.md', Buffer.alloc(MAX_DOC_BYTES + 1, 'a'))
    expect(MAX_DOC_BYTES).toBe(5 * 1024 * 1024)
    const files = await readRepoFiles(repo)
    expect(Object.keys(files).sort()).toEqual(['pod-docs/README.md', 'pod-docs/plans/at-limit.md'])
    expect(files['pod-docs/plans/at-limit.md']).toHaveLength(MAX_DOC_BYTES)
  })

  test('a repo without pod-docs gives {} and a missing repo throws', async () => {
    expect(await readRepoFiles(repo)).toEqual({})
    await put('pod-docs/plans/a.md', 'a')
    expect(await readRepoFiles(repo)).toEqual({ 'pod-docs/plans/a.md': 'a' })
    await expect(readRepoFiles(join(repo, 'gone'))).rejects.toThrow()
  })

  test('reading leaves every file and folder as it was', async () => {
    await put('pod-docs/README.md', '# readme\n')
    await put('pod-docs/plans/a.md', 'a')
    const before = await Promise.all(['pod-docs', 'pod-docs/README.md', 'pod-docs/plans/a.md'].map((r) => stat(join(repo, r))))
    await readRepoFiles(repo)
    const after = await Promise.all(['pod-docs', 'pod-docs/README.md', 'pod-docs/plans/a.md'].map((r) => stat(join(repo, r))))
    expect(after.map((s) => [s.mtimeMs, s.size])).toEqual(before.map((s) => [s.mtimeMs, s.size]))
  })
})

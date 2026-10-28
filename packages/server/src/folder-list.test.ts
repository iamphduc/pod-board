import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { listFolders, type EntryKind, type FolderFs, type FolderListDeps, type FolderListing } from './folder-list.ts'

type Node = { kind: 'dir'; readdirError?: string } | { kind: 'file' } | { kind: 'link'; to: string }
type Tree = Record<string, Node>

const NETWORK = /^[\\/]{2}/

const errno = (code: string) => Object.assign(new Error(code), { code })
const kind = (k: Node['kind']): EntryKind => ({ isDirectory: () => k === 'dir', isSymbolicLink: () => k === 'link' })

/**
 * A file system held in a map of full paths. It follows links like the real
 * one does, records every call, and records each time a call reached a
 * network target (which it then treats as an existing folder, so a listing
 * that follows one would show it).
 */
function fakeFs(platform: NodeJS.Platform, tree: Tree, opts: { delay?: Record<string, number>; hang?: string[] } = {}) {
  const p = platform === 'win32' ? path.win32 : path.posix
  const calls: string[] = []
  const touched: string[] = []
  const REMOTE = '<remote>'

  /** The path with each link on the way replaced by its target; the last part only when `followLast`. */
  function walk(x: string, followLast: boolean): string {
    const { root } = p.parse(x)
    const parts = x.slice(root.length).split(p.sep).filter(Boolean)
    let cur = root
    for (let i = 0; i < parts.length; i++) {
      cur = p.join(cur, parts[i]!)
      const last = i === parts.length - 1
      let hops = 0
      for (let node = tree[cur]; node?.kind === 'link' && (!last || followLast); node = tree[cur]) {
        if (platform === 'win32' && NETWORK.test(node.to)) {
          touched.push(node.to)
          return REMOTE
        }
        cur = p.resolve(p.dirname(cur), node.to)
        if (++hops > 20) throw errno('ELOOP')
      }
    }
    return cur
  }

  async function answer<T>(x: string, value: () => T): Promise<T> {
    if (opts.hang?.includes(x)) return new Promise<T>(() => {})
    const ms = opts.delay?.[x]
    if (ms !== undefined) await new Promise((r) => setTimeout(r, ms))
    return value()
  }

  const fs: FolderFs = {
    readdir: async (dir) => {
      calls.push(`readdir ${dir}`)
      const at = walk(dir, true)
      if (at === REMOTE) return []
      const node = tree[at]
      if (!node) throw errno('ENOENT')
      if (node.kind !== 'dir') throw errno('ENOTDIR')
      if (node.readdirError) throw errno(node.readdirError)
      return Object.keys(tree)
        .filter((k) => k !== at && p.dirname(k) === at)
        .map((k) => ({ name: p.basename(k), ...kind(tree[k]!.kind) }))
    },
    stat: (x) => {
      calls.push(`stat ${x}`)
      return answer(x, () => {
        const at = walk(x, true)
        if (at === REMOTE) return kind('dir')
        const node = tree[at]
        if (!node) throw errno('ENOENT')
        return kind(node.kind)
      })
    },
    lstat: async (x) => {
      calls.push(`lstat ${x}`)
      const at = walk(x, false)
      if (at === REMOTE) return kind('dir')
      const node = tree[at]
      if (!node) throw errno('ENOENT')
      return kind(node.kind)
    },
    readlink: async (x) => {
      calls.push(`readlink ${x}`)
      const node = tree[walk(x, false)]
      if (!node) throw errno('ENOENT')
      if (node.kind !== 'link') throw errno('EINVAL')
      return node.to
    },
  }
  return { fs, calls, touched }
}

const dir: Node = { kind: 'dir' }
const file: Node = { kind: 'file' }
const link = (to: string): Node => ({ kind: 'link', to })

function deps(platform: NodeJS.Platform, fs: FolderFs, home = platform === 'win32' ? 'C:\\Users\\u' : '/home/u'): FolderListDeps {
  return { fs, platform, home }
}

async function listing(dirPath: string | undefined, d: FolderListDeps): Promise<FolderListing> {
  const result = await listFolders(dirPath, d)
  if ('error' in result) throw new Error(`expected a listing, got ${result.error}`)
  return result
}

afterEach(() => {
  vi.useRealTimers()
})

describe('folder list', () => {
  test('lists folders only', async () => {
    const { fs } = fakeFs('linux', {
      '/': dir,
      '/r': dir,
      '/r/beta': dir,
      '/r/beta/pod-docs': file,
      '/r/Alpha': dir,
      '/r/Alpha/pod-docs': dir,
      '/r/gamma': dir,
      '/r/apple': dir,
      '/r/B': dir,
      '/r/b': dir,
      '/r/file.txt': file,
      '/r/broken': link('/nowhere'),
      '/r/tofile': link('/r/file.txt'),
      '/r/tofolder': link('/elsewhere/real'),
      '/r/relative': link('../elsewhere/real'),
      '/elsewhere': dir,
      '/elsewhere/real': dir,
      '/elsewhere/real/pod-docs': dir,
    })
    const result = await listing('/r', deps('linux', fs))
    expect(result).toEqual({
      path: '/r',
      parent: '/',
      locked: false,
      truncated: false,
      folders: [
        { name: 'Alpha', path: '/r/Alpha', podDocs: true },
        { name: 'apple', path: '/r/apple', podDocs: false },
        { name: 'B', path: '/r/B', podDocs: false },
        { name: 'b', path: '/r/b', podDocs: false },
        { name: 'beta', path: '/r/beta', podDocs: false },
        { name: 'gamma', path: '/r/gamma', podDocs: false },
        { name: 'relative', path: '/r/relative', podDocs: true },
        { name: 'tofolder', path: '/r/tofolder', podDocs: true },
      ],
    })
  })

  test('lists folders only on win32 too, junctions to local folders included', async () => {
    const { fs } = fakeFs('win32', {
      'C:\\': dir,
      'C:\\r': dir,
      'C:\\r\\Zed': dir,
      'C:\\r\\app': dir,
      'C:\\r\\app\\pod-docs': dir,
      'C:\\r\\notes.md': file,
      'C:\\r\\junction': link('D:\\work'),
      'C:\\r\\dead': link('D:\\gone'),
      'D:\\': dir,
      'D:\\work': dir,
    })
    const result = await listing('C:\\r', deps('win32', fs))
    expect(result.folders).toEqual([
      { name: 'app', path: 'C:\\r\\app', podDocs: true },
      { name: 'junction', path: 'C:\\r\\junction', podDocs: false },
      { name: 'Zed', path: 'C:\\r\\Zed', podDocs: false },
    ])
  })

  test('a link to a network path is skipped', async () => {
    const { fs, calls, touched } = fakeFs('win32', {
      'C:\\': dir,
      'C:\\r': dir,
      'C:\\r\\share': link('\\\\host\\share'),
      'C:\\r\\slashes': link('//host/share'),
      'C:\\r\\device': link('\\\\?\\C:\\x'),
      'C:\\r\\chain': link('C:\\hop'),
      'C:\\hop': link('\\\\host\\share'),
      'C:\\x': dir,
      'C:\\r\\repo': dir,
      'C:\\r\\repo\\pod-docs': link('C:\\real-docs'),
      'C:\\real-docs': dir,
      'C:\\r\\ok': dir,
      'C:\\r\\ok\\pod-docs': dir,
    })
    const result = await listing('C:\\r', deps('win32', fs))
    expect(result.folders).toEqual([
      { name: 'ok', path: 'C:\\r\\ok', podDocs: true },
      { name: 'repo', path: 'C:\\r\\repo', podDocs: false },
    ])
    expect(touched).toEqual([])
    expect(calls.filter((c) => c.includes('host'))).toEqual([])
  })

  test('on POSIX a linked pod-docs counts', async () => {
    const { fs } = fakeFs('linux', {
      '/': dir,
      '/r': dir,
      '/r/repo': dir,
      '/r/repo/pod-docs': link('/docs'),
      '/docs': dir,
    })
    expect((await listing('/r', deps('linux', fs))).folders).toEqual([{ name: 'repo', path: '/r/repo', podDocs: true }])
  })

  test('a requested path that is a link to a network path is refused', async () => {
    const { fs, touched } = fakeFs('win32', { 'C:\\': dir, 'C:\\net': link('\\\\host\\share'), 'C:\\local': link('C:\\x'), 'C:\\x': dir, 'C:\\x\\a': dir })
    expect(await listFolders('C:\\net', deps('win32', fs))).toEqual({ error: 'not a local path' })
    expect(touched).toEqual([])
    const local = await listing('C:\\local', deps('win32', fs))
    expect(local.path).toBe('C:\\local')
    expect(local.folders).toEqual([{ name: 'a', path: 'C:\\local\\a', podDocs: false }])
  })

  describe('roots', () => {
    test('on win32, every drive that answers within 1500 ms', async () => {
      vi.useFakeTimers()
      const { fs } = fakeFs(
        'win32',
        { 'C:\\': dir, 'D:\\': dir, 'E:\\': dir, 'E:\\pod-docs': dir, 'F:\\': dir, 'G:\\': dir, 'Z:\\': dir },
        { hang: ['D:\\'], delay: { 'F:\\': 1499, 'G:\\': 1600 } },
      )
      const pending = listFolders(undefined, deps('win32', fs))
      await vi.advanceTimersByTimeAsync(1500)
      expect(await pending).toEqual({
        path: null,
        parent: null,
        locked: false,
        truncated: false,
        folders: [
          { name: 'C:\\', path: 'C:\\', podDocs: false },
          { name: 'E:\\', path: 'E:\\', podDocs: true },
          { name: 'F:\\', path: 'F:\\', podDocs: false },
          { name: 'Z:\\', path: 'Z:\\', podDocs: false },
        ],
      })
    })

    test('on win32 all 26 drives are asked at once', async () => {
      vi.useFakeTimers()
      const { fs, calls } = fakeFs('win32', { 'C:\\': dir }, { hang: ['A:\\', 'B:\\'] })
      const pending = listFolders(undefined, deps('win32', fs))
      await vi.advanceTimersByTimeAsync(0)
      expect(calls.filter((c) => c.startsWith('stat ')).length).toBe(26)
      await vi.advanceTimersByTimeAsync(1500)
      expect(((await pending) as FolderListing).folders.map((f) => f.path)).toEqual(['C:\\'])
    })

    test('on POSIX, / and the home folder', async () => {
      const { fs } = fakeFs('linux', { '/': dir, '/home': dir, '/home/u': dir, '/home/u/pod-docs': dir })
      expect(await listing(undefined, deps('linux', fs))).toEqual({
        path: null,
        parent: null,
        locked: false,
        truncated: false,
        folders: [
          { name: '/', path: '/', podDocs: false },
          { name: '/home/u', path: '/home/u', podDocs: true },
        ],
      })
    })

    test('on POSIX, a home folder at / is listed once', async () => {
      const { fs } = fakeFs('darwin', { '/': dir })
      expect((await listing(undefined, deps('darwin', fs, '/'))).folders).toEqual([{ name: '/', path: '/', podDocs: false }])
    })
  })

  test('path and parent', async () => {
    const { fs } = fakeFs('win32', { 'C:\\': dir, 'C:\\x': dir, 'C:\\b': dir, 'C:\\b\\c': dir })
    const d = deps('win32', fs)
    const x = await listing('C:\\x', d)
    expect([x.path, x.parent]).toEqual(['C:\\x', 'C:\\'])
    const root = await listing('C:\\', d)
    expect([root.path, root.parent]).toEqual(['C:\\', null])
    expect(root.folders.map((f) => f.path)).toEqual(['C:\\b', 'C:\\x'])
    const b = await listing('C:/a/../b/', d)
    expect([b.path, b.parent]).toEqual(['C:\\b', 'C:\\'])
    expect(b.folders).toEqual([{ name: 'c', path: 'C:\\b\\c', podDocs: false }])

    const posix = fakeFs('linux', { '/': dir, '/x': dir })
    const top = await listing('/', deps('linux', posix.fs))
    expect([top.path, top.parent]).toEqual(['/', null])
    expect(top.folders.map((f) => f.path)).toEqual(['/x'])
    const sub = await listing('/x/', deps('linux', posix.fs))
    expect([sub.path, sub.parent]).toEqual(['/x', '/'])
  })

  test('unreadable folder is locked', async () => {
    for (const code of ['EACCES', 'EPERM']) {
      const { fs } = fakeFs('linux', { '/': dir, '/r': { kind: 'dir', readdirError: code } })
      expect(await listFolders('/r', deps('linux', fs)), code).toEqual({ path: '/r', parent: '/', locked: true, truncated: false, folders: [] })
    }
  })

  test('another read error is locked too, and a folder gone before the read is not a directory', async () => {
    const io = fakeFs('linux', { '/': dir, '/r': { kind: 'dir', readdirError: 'EIO' } })
    expect(await listFolders('/r', deps('linux', io.fs))).toEqual({ path: '/r', parent: '/', locked: true, truncated: false, folders: [] })
    const gone = fakeFs('linux', { '/': dir, '/r': { kind: 'dir', readdirError: 'ENOENT' } })
    expect(await listFolders('/r', deps('linux', gone.fs))).toEqual({ error: 'not a directory' })
  })

  test('caps at 1000', async () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `d${String(i).padStart(4, '0')}`)
    const tree: Tree = { '/': dir, '/big': dir }
    // Written in reverse, so the cap must come after the sort.
    for (const name of names(1001).reverse()) tree[`/big/${name}`] = dir
    const { fs, calls } = fakeFs('linux', tree)
    const result = await listing('/big', deps('linux', fs))
    expect(result.truncated).toBe(true)
    expect(result.folders.length).toBe(1000)
    expect(result.folders[0]!.name).toBe('d0000')
    expect(result.folders[999]!.name).toBe('d0999')
    // The folder past the cap is never asked about.
    expect(calls.filter((c) => c.includes('d1000'))).toEqual([])

    const exact: Tree = { '/': dir, '/big': dir }
    for (const name of names(1000)) exact[`/big/${name}`] = dir
    const full = await listing('/big', deps('linux', fakeFs('linux', exact).fs))
    expect([full.folders.length, full.truncated]).toEqual([1000, false])
  })

  test('refuses bad paths', async () => {
    const win = fakeFs('win32', { 'C:\\': dir, 'C:\\file.txt': file })
    const w = deps('win32', win.fs)
    for (const p of ['\\\\host\\share', '//host/share', '\\/host/share', '\\\\?\\C:\\x', '\\\\.\\C:']) {
      expect(await listFolders(p, w), JSON.stringify(p)).toEqual({ error: 'not a local path' })
    }
    for (const p of ['x\\y', 'x', 'C:x', 'C:', '\\x', '/x', '']) {
      expect(await listFolders(p, w), JSON.stringify(p)).toEqual({ error: 'not absolute' })
    }
    expect(win.calls).toEqual([])
    // A NUL is checked first, so even a network path holding one is a bad request.
    for (const p of ['C:\\a\0b', '\\\\host\\share\0', '\0']) expect(await listFolders(p, w), JSON.stringify(p)).toEqual({ error: 'bad request' })
    expect(win.calls).toEqual([])
    expect(await listFolders('C:\\missing', w)).toEqual({ error: 'not a directory' })
    expect(await listFolders('C:\\file.txt', w)).toEqual({ error: 'not a directory' })

    const posix = fakeFs('linux', { '/': dir, '/f': file })
    const x = deps('linux', posix.fs)
    for (const p of ['x/y', 'C:\\x', '']) expect(await listFolders(p, x), JSON.stringify(p)).toEqual({ error: 'not absolute' })
    expect(await listFolders('/a\0', x)).toEqual({ error: 'bad request' })
    expect(posix.calls).toEqual([])
    expect(await listFolders('/missing', x)).toEqual({ error: 'not a directory' })
    expect(await listFolders('/f', x)).toEqual({ error: 'not a directory' })
  })

  test('reads names only', async () => {
    const source = await readFile(fileURLToPath(new URL('./folder-list.ts', import.meta.url)), 'utf8')
    expect(source).not.toMatch(/\b(readFile|readFileSync|open|openSync|opendir|createReadStream|writeFile|appendFile|mkdir|rm|rename)\b/)
    const fsImports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(node:)?fs(\/promises)?'/g)]
    expect(fsImports.map((m) => m[0].match(/'[^']+'/)![0])).toEqual(["'node:fs/promises'"])
    const names = fsImports[0]![1]!
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .sort()
    expect(names).toEqual(['lstat', 'readdir', 'readlink', 'stat'])
    // No other way in to the file system.
    expect(source).not.toMatch(/from\s*'(node:)?fs'|require\(|import\(/)
  })
})

// The resume spike: can the board resume a Claude Code session headless with the human's own login?
//
// It only ever touches a throwaway session it makes itself, in a new empty folder, and removes
// that folder and the session's files afterwards. It never resumes or reads any other session.
//
// Run (from packages/server):
//   pnpm exec tsx scripts/resume-spike.ts [--root <folder for the temp dir>] [--keep]
// It makes five small `claude -p` calls on your own login (never an API key, never --bare):
//   1. create:     claude -p hello --output-format json        → the session id
//   2. resume:     the runner's `-p --resume <id> continue`    → same id, same transcript?
//   3. concurrent: two runner resumes at once                  → does the conversation split?
//   4. tools:      claude -p --resume <id> "<echo via Bash>" --output-format json, with the temp
//                  folder's .claude/settings.json allowing only that echo → allowed or denied?
// It prints a JSON report. Exit code 0 when every call ran, 1 when one couldn't.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { childEnv, claudeBin, createClaudeRunner, resolveBin, shimTarget, type StartResult } from '../src/claude-runner.ts'
import { claudeDir, projectDirName } from '../src/transcript-files.ts'

const CALL_TIMEOUT_MS = 180_000
const ECHO = 'pod-spike-ok'
const TOOL_PROMPT = `Use the Bash tool to run exactly this command and nothing else: echo ${ECHO}`

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(name)
const option = (name: string) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}

/**
 * The env the spawned claude sees: the board's (this process's) minus the API key variables,
 * and minus Claude Code's own session variables, since the board doesn't run inside Claude
 * Code. Those would point a nested claude at the session that launched this script.
 */
function spikeEnv(): NodeJS.ProcessEnv {
  const env = childEnv(process.env)
  for (const k of Object.keys(env)) {
    const u = k.toUpperCase()
    if (u === 'CLAUDECODE' || u.startsWith('CLAUDE_CODE_') || u === 'CLAUDE_PID' || u === 'CLAUDE_EFFORT') delete env[k]
  }
  return env
}

type Run = { code: number | null; stdout: string; stderr: string; ms: number; error?: string }

/** Runs claude directly (no shell) with fixed arguments and collects its output. */
function runClaude(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<Run> {
  const t0 = Date.now()
  const bin = resolveBin(claudeBin(env), env)
  if (!bin) return Promise.resolve({ code: null, stdout: '', stderr: '', ms: 0, error: 'claude not found' })
  const target = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin) ? shimTarget(bin, env) : { file: bin, pre: [] }
  if (!target) return Promise.resolve({ code: null, stdout: '', stderr: '', ms: 0, error: `can't read the shim ${bin}` })
  return new Promise((resolve) => {
    const child = spawn(target.file, [...target.pre, ...args], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => child.kill(), CALL_TIMEOUT_MS)
    child.once('error', (e) => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr, ms: Date.now() - t0, error: e.message })
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, ms: Date.now() - t0 })
    })
  })
}

const parseJson = (text: string): Record<string, unknown> | undefined => {
  try {
    return JSON.parse(text.trim()) as Record<string, unknown>
  } catch {
    return undefined
  }
}

type Line = { type?: string; uuid?: string; parentUuid?: string | null; sessionId?: string; isSidechain?: boolean }

const readLines = (file: string): Line[] =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => (parseJson(l) ?? {}) as Line)
    : []

/** Parents with more than one user/assistant child: the conversation branched there. */
function branchPoints(lines: Line[]): string[] {
  const kids = new Map<string, number>()
  for (const l of lines) {
    if ((l.type !== 'user' && l.type !== 'assistant') || l.isSidechain || !l.parentUuid) continue
    kids.set(l.parentUuid, (kids.get(l.parentUuid) ?? 0) + 1)
  }
  return [...kids].filter(([, n]) => n > 1).map(([p]) => p)
}

/** The leaf messages: user/assistant lines nothing else points at. More than one → split. */
function leaves(lines: Line[]): number {
  const msgs = lines.filter((l) => (l.type === 'user' || l.type === 'assistant') && !l.isSidechain && l.uuid)
  const parents = new Set(msgs.map((l) => l.parentUuid).filter(Boolean))
  return msgs.filter((l) => !parents.has(l.uuid)).length
}

const jsonlFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')) : [])

async function main() {
  const report: Record<string, unknown> = { at: new Date().toISOString(), platform: process.platform, node: process.version }
  const env = spikeEnv()
  report.envNames = {
    passed: Object.keys(env).filter((k) => /^(CLAUDE|ANTHROPIC)/i.test(k)).sort(),
    removed: Object.keys(process.env).filter((k) => !(k in env)).sort(),
  }
  const bin = resolveBin(claudeBin(env), env)
  report.bin = bin ?? null
  if (bin && /\.(cmd|bat)$/i.test(bin)) report.shimRuns = shimTarget(bin, env)?.file ?? null
  const version = await runClaude(['--version'], process.cwd(), env)
  report.version = version.stdout.trim() || version.error || version.stderr.trim()

  const root = mkdtempSync(path.join(option('--root') ?? tmpdir(), 'pod-resume-spike-'))
  const work = path.join(root, 'work')
  const logDir = path.join(root, 'logs')
  mkdirSync(path.join(work, '.claude'), { recursive: true })
  writeFileSync(
    path.join(work, '.claude', 'settings.json'),
    JSON.stringify({ permissions: { allow: [`Bash(echo ${ECHO})`] } }, null, 2),
  )
  const projectDir = path.join(claudeDir(process.env, homedir()), 'projects', projectDirName(work))
  report.work = work
  report.projectDir = projectDir
  if (existsSync(projectDir)) throw new Error(`refusing to run: ${projectDir} already exists`)
  let id: string | undefined
  let ok = true

  try {
    // 1. create
    const create = await runClaude(['-p', 'hello', '--output-format', 'json'], work, env)
    const created = parseJson(create.stdout)
    id = typeof created?.session_id === 'string' ? created.session_id : undefined
    report.create = {
      code: create.code,
      ms: create.ms,
      error: create.error,
      stderr: create.stderr.slice(-500),
      sessionIdInJson: id ?? null,
      jsonKeys: created ? Object.keys(created).sort() : null,
      isError: created?.is_error,
    }
    if (!id) {
      ok = false
      return
    }
    const transcript = path.join(projectDir, `${id}.jsonl`)
    const before = readLines(transcript)
    report.transcript = { path: transcript, exists: existsSync(transcript), lines: before.length }

    // 2. resume through the runner, waiting for it to finish
    // While it runs, watch when the transcript is first touched: the idle rule only works when
    // a run writes to it soon after it starts.
    const runner = createClaudeRunner({ bin: claudeBin(env), logDir, env, windowMs: CALL_TIMEOUT_MS })
    const mtime0 = existsSync(transcript) ? statSync(transcript).mtimeMs : 0
    const startedAt = Date.now()
    const touches: number[] = []
    let last = mtime0
    const poll = setInterval(() => {
      const m = existsSync(transcript) ? statSync(transcript).mtimeMs : 0
      if (m !== last) touches.push(Date.now() - startedAt)
      last = m
    }, 250)
    const resumed: StartResult = await runner.start({ session: id, word: 'continue', cwd: work })
    clearInterval(poll)
    const after = readLines(transcript)
    const added = after.slice(before.length)
    report.resume = {
      result: resumed,
      ms: Date.now() - startedAt,
      firstTouchMs: touches[0] ?? null,
      touchesMs: touches,
      linesAdded: added.length,
      newLineSessionIds: [...new Set(added.map((l) => l.sessionId).filter(Boolean))],
      jsonlFiles: jsonlFiles(projectDir),
      transcriptMtime: existsSync(transcript) ? statSync(transcript).mtime.toISOString() : null,
    }

    // 3. two resumes at once
    const both = await Promise.all([
      runner.start({ session: id, word: 'continue', cwd: work }),
      runner.start({ session: id, word: 'continue', cwd: work }),
    ])
    const afterBoth = readLines(transcript)
    report.concurrent = {
      results: both,
      linesAdded: afterBoth.length - after.length,
      jsonlFiles: jsonlFiles(projectDir),
      branchPoints: branchPoints(afterBoth).length,
      leaves: leaves(afterBoth),
      leavesBefore: leaves(after),
      sessionIds: [...new Set(afterBoth.map((l) => l.sessionId).filter(Boolean))],
    }

    // 4. tools: a resumed -p run, with the folder's settings allowing one echo
    const tool = await runClaude(['-p', '--resume', id, TOOL_PROMPT, '--output-format', 'json'], work, env)
    const toolJson = parseJson(tool.stdout)
    report.tools = {
      code: tool.code,
      error: tool.error,
      sessionIdInJson: toolJson?.session_id ?? null,
      permissionDenials: toolJson?.permission_denials ?? null,
      resultHasEcho: typeof toolJson?.result === 'string' && toolJson.result.includes(ECHO),
      transcriptHasEcho: existsSync(transcript) && readFileSync(transcript, 'utf8').includes(`"${ECHO}`),
      result: typeof toolJson?.result === 'string' ? toolJson.result.slice(0, 300) : null,
    }
    report.logs = existsSync(logDir)
      ? readdirSync(logDir).map((f) => ({ file: f, text: readFileSync(path.join(logDir, f), 'utf8').slice(-300) }))
      : []
  } finally {
    report.cleanup = flag('--keep') ? 'kept' : cleanup(root, projectDir, id)
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = ok ? 0 : 1
  }
}

/** Removes the temp folder, the throwaway's project folder, and only files named for its id. */
function cleanup(root: string, projectDir: string, id: string | undefined): string[] {
  const removed: string[] = []
  const rm = (p: string) => {
    if (!existsSync(p)) return
    rmSync(p, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    removed.push(p)
  }
  rm(root)
  if (path.basename(projectDir).includes('pod-resume-spike-')) rm(projectDir)
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const base = claudeDir(process.env, homedir())
    for (const sub of ['session-env', 'file-history', 'todos', 'debug', 'tasks', 'shell-snapshots']) {
      const dir = path.join(base, sub)
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir)) if (f.startsWith(id)) rm(path.join(dir, f))
    }
  }
  return removed
}

await main()

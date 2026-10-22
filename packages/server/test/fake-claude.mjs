#!/usr/bin/env node
// A fake `claude` for the runner tests. Tests install it as `claude` (POSIX) or
// `claude.cmd` (Windows) in a temp folder. It never talks to anything.
//
// Env it reads (all set by the test):
//   FAKE_CLAUDE_RECORD  file to write { argv, env, cwd, pid } to, at start. `cwd` is
//                       resolved, as macOS reports it (/var -> /private/var).
//   FAKE_CLAUDE_MODE    `exit:<code>` (default `exit:0`) or `wait:<ms>` (then exit 0)
//   FAKE_CLAUDE_STDERR  text to write to stderr before exiting
//   FAKE_CLAUDE_DONE    file to write once it finishes waiting
import { realpathSync, writeFileSync } from 'node:fs'

const env = process.env
if (env.FAKE_CLAUDE_RECORD) {
  const record = { argv: process.argv.slice(2), env: { ...env }, cwd: realpathSync.native(process.cwd()), pid: process.pid }
  writeFileSync(env.FAKE_CLAUDE_RECORD, JSON.stringify(record))
}

const finish = (code) => {
  if (env.FAKE_CLAUDE_STDERR) process.stderr.write(env.FAKE_CLAUDE_STDERR)
  if (env.FAKE_CLAUDE_DONE) writeFileSync(env.FAKE_CLAUDE_DONE, 'done')
  process.exitCode = code
}

const [kind, value] = (env.FAKE_CLAUDE_MODE ?? 'exit:0').split(':')
if (kind === 'wait') setTimeout(() => finish(0), Number(value))
else finish(Number(value ?? 0))

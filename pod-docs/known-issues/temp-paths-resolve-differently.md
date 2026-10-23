# Temp folder paths resolve differently on macOS and Windows CI

_Found: 2026-10-22 · sprint queue-and-replies (`queue-writer.test.ts`), again in sprint resume-runs (`claude-runner.test.ts`)_

**Symptom:** a test passes locally on Windows and on Linux CI, but fails on macOS CI (and sometimes Windows CI) with two paths that differ only in their prefix, such as `expected '/private/var/folders/…' to be '/var/folders/…'`.

**Cause:** `os.tmpdir()` returns an unresolved path. On macOS `/var` is a link to `/private/var`; on Windows CI the temp folder can come back as an 8.3 short name. Anything that resolves paths (`fs.realpath`, a child process's `process.cwd()`) reports the long, resolved form, so a test that builds its expected paths from the raw `mkdtemp(tmpdir())` compares two spellings of the same folder.

**Workaround:** resolve the temp root once at setup, `const root = await realpath(await mkdtemp(join(tmpdir(), 'x-')))`, and build every path in the test from it. To reproduce the failure on Windows, point `TMP`/`TEMP` at a junction before running the test.

**Also (2026-10-22, sprint resume-runs):** on Node 24 on Windows, removing a temp folder right after killing a child that ran in it fails with `EPERM` (or `EBUSY` on CI). `process.kill` reports the child gone at once, but Windows releases the folder about 50 ms later, and `rmSync`'s own `maxRetries` doesn't retry this error. Retry the removal yourself a few times with a short delay; one retry was enough in every measured case.

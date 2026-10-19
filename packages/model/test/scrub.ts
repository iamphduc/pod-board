// Fixtures are real pod-run docs that go into git history, and the repo is
// meant to become public. Each rule below is text that must never land there.
// Pure: it gets a path and text, and names every rule they trip.

type Rule = { name: string; pattern: RegExp }

const RULES: Rule[] = [
  { name: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  // A home folder in any OS spelling. `(?<![\w.~-])` keeps URL paths such as
  // `example.com/home/` out: there the slash follows a host name.
  { name: 'home path', pattern: /[A-Za-z]:[\\/]+Users[\\/]|(?<![\w.~-])\/(?:Users|home)\//gi },
  // A drive letter that starts a word, so `https://` (`s:` after `http`) passes.
  { name: 'drive path', pattern: /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/g },
  {
    name: 'token',
    pattern:
      /\bgh[opsu]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bsk-[A-Za-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}|-----BEGIN/g,
  },
]

/** Every scrub rule `text` trips, as `<rule>: <path>: <match>`; a file that isn't `.md` is `not markdown`. */
export function findLeaks(path: string, text: string): string[] {
  if (!path.endsWith('.md')) return [`not markdown: ${path}`]
  return RULES.flatMap(({ name, pattern }) =>
    [...text.matchAll(pattern)].map((match) => `${name}: ${path}: ${match[0]}`),
  )
}

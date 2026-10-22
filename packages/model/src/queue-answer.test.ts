import { describe, expect, it } from 'vitest'
import { latestHalt, parseQueue } from './pod-flow/model.ts'
import { cleanAnswer, isAnswerable, queueLines, splitAnswer, withAnswer } from './queue-answer.ts'
import { buildRepoModel, type QueueItem } from './run-model.ts'

// Every snapshot is built inline: test/no-io.test.ts scans this folder, so no file reads here.

const README = '# pod docs\n\npod docs: 2\n'
const queueOf = (md: string): QueueItem[] => buildRepoModel({ 'pod-docs/README.md': README, 'pod-docs/handoff-queue.md': md }).queue

describe('queue answers', () => {
  it('lines match parseQueue', () => {
    const md = [
      '﻿- `[2026-10-21 · PENDING · engineer → human]` first, after a BOM **Resolution:** pending',
      '# Handoff Queue',
      '',
      '   - `[2026-10-20 · NOTE · engineer → orchestrator · slice: A1]` indented, with trailing spaces **Resolution:** pending   ',
      '- [2026-10-19 · BLOCKED · orchestrator → human] no backticks **Resolution:** pending\r',
      '-`[no date parts]`tight',
      '- `[]` an empty header is not an entry',
      '* `[2026-10-18 · PENDING · engineer → human]` a star bullet is not an entry',
      '  continued text on its own line is not an entry',
      '- `[2026-10-18 · PENDING · engineer → human]` CRLF line **Resolution:** pending\r',
      '- `[ · PENDING · engineer → human]` blank date **Resolution:** pending',
      '- `[2026-10-17 · SOLVED · engineer → human]` last, no final newline',
    ].join('\n')
    const parsed = parseQueue(md)
    const lines = queueLines(md)
    expect(lines).toHaveLength(parsed.length)
    expect(lines).toHaveLength(7)
    // The line is the file's line, trimmed (a BOM, indent, trailing spaces, and a CR drop off).
    expect(lines[0]).toBe('- `[2026-10-21 · PENDING · engineer → human]` first, after a BOM **Resolution:** pending')
    expect(lines[1]).toBe('- `[2026-10-20 · NOTE · engineer → orchestrator · slice: A1]` indented, with trailing spaces **Resolution:** pending')
    expect(lines[2]).toBe('- [2026-10-19 · BLOCKED · orchestrator → human] no backticks **Resolution:** pending')
    expect(lines[3]).toBe('-`[no date parts]`tight')

    // Each item carries its line, in parseQueue's order, and the header's first part as its date.
    const items = queueOf(md)
    expect(items.map((e) => e.line)).toEqual(lines)
    expect(items.map((e) => e.body)).toEqual(parsed.map((e) => e.body))
    expect(items.map((e) => e.date)).toEqual(['2026-10-21', '2026-10-20', '2026-10-19', 'no date parts', '2026-10-18', undefined, '2026-10-17'])
    // A blank first part gives no date field at all.
    expect(items[5]).not.toHaveProperty('date')
    expect(queueLines('')).toEqual([])
  })

  it('reads the answer apart from the body', () => {
    // At the line's end, after the Resolution.
    expect(splitAnswer('Pick a name **Resolution:** pending **Answer (human):** call it Ladder ')).toEqual({ body: 'Pick a name', answer: 'call it Ladder' })
    // Before the Resolution: the answer runs up to it.
    expect(splitAnswer('Pick a name **Answer (human):** Ladder **Resolution:** pending')).toEqual({ body: 'Pick a name', answer: 'Ladder' })
    // The first answer marker counts; any case reads the same.
    expect(splitAnswer('Q **Resolution:** pending **answer (HUMAN):** one **Answer (human):** two')).toEqual({ body: 'Q', answer: 'one **Answer (human):** two' })
    // No answer → no answer field; the body is parseQueue's.
    expect(splitAnswer('Pick a name **Resolution:** pending')).toEqual({ body: 'Pick a name' })
    expect(splitAnswer('Pick a name **Resolution:** pending')).not.toHaveProperty('answer')
    expect(splitAnswer('  just text  ')).toEqual({ body: 'just text' })
    // Another sender's marker is not an answer.
    expect(splitAnswer('Q **Answer (pod):** x **Resolution:** pending')).toEqual({ body: 'Q **Answer (pod):** x' })
    // An empty answer is still an answer, so the entry isn't answered twice.
    expect(splitAnswer('Q **Resolution:** pending **Answer (human):**')).toEqual({ body: 'Q', answer: '' })

    const [after, before, none] = queueOf(
      [
        '- `[2026-10-21 · PENDING · engineer → human]` Pick a name **Resolution:** pending **Answer (human):** Ladder',
        '- `[2026-10-21 · PENDING · engineer → human]` Pick a name **Answer (human):** Ladder **Resolution:** pending',
        '- `[2026-10-21 · PENDING · engineer → human]` Pick a name **Resolution:** pending',
      ].join('\n'),
    )
    expect([after?.body, after?.answer, after?.isPending]).toEqual(['Pick a name', 'Ladder', true])
    expect([before?.body, before?.answer, before?.isPending]).toEqual(['Pick a name', 'Ladder', true])
    expect(none?.body).toBe('Pick a name')
    expect(none?.answer).toBeUndefined()
    expect(none).not.toHaveProperty('answer')
  })

  it('the answer leaves the entry\'s reading unchanged', () => {
    const lines = [
      '- `[2026-10-21 · BLOCKED · orchestrator → human · plan: alpha]` Gate 2 stopped the run: tests fail **Resolution:** pending',
      '- `[2026-10-21 · PENDING · engineer → human · sprint: one · slice: A1]` Pick a name **Resolution:** pending',
      '- `[2026-10-21 · PENDING · orchestrator → human · plan: alpha]` plan alpha complete — final PR https://github.com/o/r/pull/9 **Resolution:** pending',
      '- `[2026-10-21 · PENDING · engineer → human]` no resolution at all',
    ]
    const text = 'Use the old name; see `docs/x.md` [link](http://x) and a ] bracket'
    for (const line of lines) {
      const answered = withAnswer(line, text)
      // Appended at the line's very end.
      expect(answered).toBe(`${line} **Answer (human):** ${text}`)
      const [was] = parseQueue(line)
      const [now] = parseQueue(answered)
      expect(now).toEqual(was)
      expect(queueOf(answered)[0]?.answer).toBe(text)
      expect(queueOf(answered)[0]?.body).toBe(queueOf(line)[0]?.body)
    }
    // Trailing spaces on the line don't double up.
    expect(withAnswer(`${lines[1]}  `, 'ok')).toBe(`${lines[1]} **Answer (human):** ok`)
    // latestHalt finds the same halt in the whole queue before and after.
    const md = lines.join('\n')
    const answeredMd = lines.map((l) => withAnswer(l, 'yes')).join('\n')
    expect(latestHalt(md)).toBeDefined()
    expect(latestHalt(answeredMd)).toEqual(latestHalt(md))
  })

  it('which entries can be answered', () => {
    const entry = (type: string, route: string, resolution: string, tail = '') =>
      `- \`[2026-10-21 · ${type} · ${route}]\` body **Resolution:** ${resolution}${tail}`
    const items = queueOf(
      [
        entry('PENDING', 'engineer → human', 'pending'),
        entry('BLOCKED', 'engineer → orchestrator', 'pending'),
        entry('blocked', 'orchestrator → human', 'pending'),
        entry('NOTE', 'reporter → human', 'pending'),
        entry('SOLVED', 'engineer → human', 'pending'),
        entry('PENDING', 'engineer → human', '2026-10-21 — fixed'),
        entry('PENDING', 'engineer → orchestrator', 'pending'),
        entry('PENDING', 'engineer → human', 'pending', ' **Answer (human):** done'),
        entry('BLOCKED', 'orchestrator → human', 'pending', ' **Answer (human):**'),
      ].join('\n'),
    )
    expect(items.map(isAnswerable)).toEqual([true, true, true, false, false, false, false, false, false])
    // A NOTE that waits on you is still not answerable.
    expect(items[3]?.needsYou).toBe(true)
  })

  it('cleans the answer text', () => {
    expect(cleanAnswer('  use\r\n\r\nthe   old\tname \n')).toEqual({ ok: true, text: 'use the old name' })
    expect(cleanAnswer('a\u0000b\u0007c\u001Fd\u007Fe')).toEqual({ ok: true, text: 'abcde' })
    // A dropped control character between spaces leaves one space.
    expect(cleanAnswer('a \u0001 b')).toEqual({ ok: true, text: 'a b' })
    expect(cleanAnswer('a b c')).toEqual({ ok: true, text: 'a b c' })

    const empty = { ok: false, error: 'Write an answer first.' }
    expect(cleanAnswer('')).toEqual(empty)
    expect(cleanAnswer(' \n\t ')).toEqual(empty)
    expect(cleanAnswer('\u0001\u0002')).toEqual(empty)

    const long = { ok: false, error: 'Keep the answer under 2000 characters.' }
    expect(cleanAnswer('x'.repeat(2000))).toEqual({ ok: true, text: 'x'.repeat(2000) })
    expect(cleanAnswer('x'.repeat(2001))).toEqual(long)
    // Counted after cleaning: spaces that collapse don't count.
    expect(cleanAnswer(`${'x'.repeat(1000)}\n\n\n${'x'.repeat(999)}`)).toEqual({ ok: true, text: `${'x'.repeat(1000)} ${'x'.repeat(999)}` })
    // Counted in characters, so an emoji is one.
    expect(cleanAnswer('😀'.repeat(2000))).toEqual({ ok: true, text: '😀'.repeat(2000) })
    expect(cleanAnswer('😀'.repeat(2001))).toEqual(long)

    const marker = { ok: false, error: "The answer can't contain **Resolution:** or **Answer (…):**." }
    for (const bad of ['done **Resolution:** fixed', 'done **resolution:** x', 'x **Answer (human):** y', 'x **answer (pod):** y', '**ANSWER (']) {
      expect(cleanAnswer(bad), bad).toEqual(marker)
    }
    // Words alone are fine.
    expect(cleanAnswer('Resolution: answer (later)')).toEqual({ ok: true, text: 'Resolution: answer (later)' })
  })
})

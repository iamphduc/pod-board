// Queue answers: the lines `parseQueue` reads, an entry's answer apart from its body, which
// entries you can answer, the answer text's rules, and the line with an answer appended.
// Pure. The format and why are in pod-docs/feature-details/run-model.md.

export function queueLines(_md: string): string[] {
  return []
}

export function splitAnswer(rest: string): { body: string; answer?: string } {
  return { body: rest }
}

export function isAnswerable(_item: { type: string; isPending: boolean; needsYou: boolean; answer?: string }): boolean {
  return false
}

export type CleanAnswer = { ok: true; text: string } | { ok: false; error: string }

export function cleanAnswer(text: string): CleanAnswer {
  return { ok: true, text }
}

export function withAnswer(line: string, _text: string): string {
  return line
}

import { titleParts } from './view.ts'

/** A sprint or plan doc title, with its backticked spans shown as inline code. */
export function DocTitle({ text }: { text: string }) {
  return (
    <>
      {titleParts(text).map((part, i) =>
        part.code ? (
          <code key={i} className="doc-code">
            {part.text}
          </code>
        ) : (
          part.text
        ),
      )}
    </>
  )
}

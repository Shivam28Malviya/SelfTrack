/**
 * Splits a SQL script into individual statements.
 *
 * Neon's HTTP transport sends one statement per request, so a migration file
 * cannot be handed over whole. Splitting on every semicolon would break the
 * moment a statement contains one inside a string literal or a dollar-quoted
 * body, so this tracks what it is inside:
 *
 *  - single-quoted strings, including the '' escape
 *  - dollar-quoted blocks ($$ … $$ and $tag$ … $tag$)
 *  - line comments (-- …) and block comments (slash-star … star-slash)
 *
 * Comments are preserved inside statements; only whitespace-or-comment-only
 * fragments are dropped.
 */
export function splitStatements(script) {
  const src = String(script ?? '')
  const out = []
  let buf = ''
  let i = 0

  const isMeaningful = (s) => {
    const stripped = s
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
    return stripped.length > 0
  }

  while (i < src.length) {
    const c = src[i]
    const two = src.slice(i, i + 2)

    if (two === '--') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      buf += src.slice(i, stop)
      i = stop
      continue
    }

    if (two === '/*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      buf += src.slice(i, stop)
      i = stop
      continue
    }

    if (c === "'") {
      buf += c
      i++
      while (i < src.length) {
        if (src[i] === "'" && src[i + 1] === "'") { buf += "''"; i += 2; continue }
        if (src[i] === "'") { buf += "'"; i++; break }
        buf += src[i]
        i++
      }
      continue
    }

    if (c === '$') {
      // A dollar quote opens with $tag$ where tag is empty or an identifier.
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(src.slice(i))
      if (match) {
        const tag = match[0]
        const end = src.indexOf(tag, i + tag.length)
        const stop = end === -1 ? src.length : end + tag.length
        buf += src.slice(i, stop)
        i = stop
        continue
      }
    }

    if (c === ';') {
      if (isMeaningful(buf)) out.push(buf.trim())
      buf = ''
      i++
      continue
    }

    buf += c
    i++
  }

  if (isMeaningful(buf)) out.push(buf.trim())
  return out
}

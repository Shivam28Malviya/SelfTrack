/**
 * Minimal RFC 4180 CSV reader.
 *
 * Handles quoted fields, escaped quotes, embedded commas and newlines, and
 * both CRLF and LF line endings — a name like `O'Brien, Sean` or a note
 * containing a comma would otherwise silently shift every later column.
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const src = String(text ?? '').replace(/^﻿/, '') // strip a spreadsheet BOM

  const endField = () => { row.push(field); field = '' }
  const endRow = () => { endField(); rows.push(row); row = [] }

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
      continue
    }
    if (c === '"') { inQuotes = true; continue }
    if (c === ',') { endField(); continue }
    if (c === '\r') { if (src[i + 1] === '\n') i++; endRow(); continue }
    if (c === '\n') { endRow(); continue }
    field += c
  }
  // A trailing newline should not produce a phantom empty row.
  if (field !== '' || row.length > 0) endRow()

  return rows.filter(r => r.some(cell => String(cell).trim() !== ''))
}

/** Turns a CSV into objects keyed by a normalised header name. */
export function parseCsvObjects(text) {
  const rows = parseCsv(text)
  if (rows.length === 0) return { headers: [], records: [] }
  const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  const records = rows.slice(1).map((r, i) => {
    const obj = { __line: i + 2 } // +2: one-based, plus the header row
    headers.forEach((h, j) => { obj[h] = (r[j] ?? '').trim() })
    return obj
  })
  return { headers, records }
}

export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = columns.map(c => esc(c.label ?? c.key)).join(',')
  const body = rows.map(r => columns.map(c => esc(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','))
  return [head, ...body].join('\r\n')
}

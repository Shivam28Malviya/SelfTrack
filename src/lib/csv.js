// CSV builder + browser download — no deps.
function escapeCell(v) {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(rows, headers) {
  const head = headers.map(escapeCell).join(',')
  const body = rows.map(r => r.map(escapeCell).join(',')).join('\n')
  return `${head}\n${body}`
}

export function downloadCsv(filename, rows, headers) {
  const csv = toCsv(rows, headers)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

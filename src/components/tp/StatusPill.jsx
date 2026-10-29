// Status is never communicated by colour alone — each pill carries a glyph and
// its text label, so it survives colour blindness, greyscale printing and a
// screen reader.
const TONES = {
  'On track': { bg: 'var(--tp-ok-bg)', fg: 'var(--tp-ok-fg)', glyph: '●' },
  Watch: { bg: 'var(--tp-warn-bg)', fg: 'var(--tp-warn-fg)', glyph: '▲' },
  Overtime: { bg: 'var(--tp-warn-bg)', fg: 'var(--tp-warn-fg)', glyph: '▲' },
  'Burnout watch': { bg: 'var(--tp-warn-bg)', fg: 'var(--tp-warn-fg)', glyph: '▲' },
  'At risk': { bg: 'var(--tp-bad-bg)', fg: 'var(--tp-bad-fg)', glyph: '■' },
  Unknown: { bg: 'var(--tp-info-bg)', fg: 'var(--tp-info-fg)', glyph: '○' },
}

export default function StatusPill({ status, title }) {
  const tone = TONES[status] || TONES.Unknown
  const label = status || 'Not enough data'
  return (
    <span className="tp-pill" style={{ background: tone.bg, color: tone.fg }} title={title}>
      <span aria-hidden="true">{tone.glyph}</span>
      {label}
    </span>
  )
}

import { DASH } from '../../lib/tpFormat'

/**
 * A stat tile, which is the right form for a single headline number — no
 * chart earns its place around one value.
 *
 * `value` of null renders an em dash and the reason, so an empty month reads
 * as "nothing recorded" and not as a score of zero.
 */
export default function KpiTile({ label, value, unit = '', target, basis, tone = 'plain', hint }) {
  const has = value != null
  const bg = {
    plain: 'rgba(255,255,255,0.6)',
    ok: 'var(--tp-ok-bg)',
    warn: 'var(--tp-warn-bg)',
    bad: 'var(--tp-bad-bg)',
  }[tone]
  const fg = { plain: 'var(--tp-ink)', ok: 'var(--tp-ok-fg)', warn: 'var(--tp-warn-fg)', bad: 'var(--tp-bad-fg)' }[tone]
  const glyph = { ok: '●', warn: '▲', bad: '■' }[tone]

  return (
    <div className="rounded-[28px] px-5 py-4 flex flex-col gap-1.5" style={{ background: bg, color: fg }}>
      <span className="text-3xl tracking-[-0.03em] tabular-nums">
        {has ? `${value}${unit}` : DASH}
        {has && glyph && <span aria-hidden="true" className="text-sm ml-2">{glyph}</span>}
      </span>
      <span className="tp-label" style={{ color: 'inherit', opacity: 0.85 }}>{label}</span>
      <span className="text-[11px]" style={{ opacity: 0.8 }}>
        {has
          ? [target != null ? `target ${target}${unit}` : null, basis].filter(Boolean).join(' · ')
          : (hint || 'nothing recorded in this period')}
      </span>
    </div>
  )
}

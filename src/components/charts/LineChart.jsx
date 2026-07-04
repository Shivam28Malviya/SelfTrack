// Hand-rolled SVG line chart — no deps.
export default function LineChart({ data, height = 140, stroke = '#a97e5d', fill = 'rgba(169,126,93,0.15)' }) {
  if (!data || data.length === 0) {
    return <p className="text-neutral-400 text-sm py-6 text-center">No data yet.</p>
  }
  const w = 100 // viewBox width (percent-based, scales)
  const h = height
  const max = Math.max(...data.map(d => d.value), 1)
  const n = data.length
  const stepX = n > 1 ? w / (n - 1) : 0
  const pts = data.map((d, i) => {
    const x = n > 1 ? i * stepX : w / 2
    const y = h - 18 - (d.value / max) * (h - 34)
    return [x, y]
  })
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ')
  const areaPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(2)} ${h - 18} L ${pts[0][0].toFixed(2)} ${h - 18} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="1.6" fill={stroke} vectorEffect="non-scaling-stroke" />
      ))}
      {data.map((d, i) => (
        <text key={i} x={pts[i][0]} y={h - 4} fontSize="4" fill="#8a8880" textAnchor="middle">{d.label}</text>
      ))}
    </svg>
  )
}

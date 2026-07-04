// Hand-rolled SVG bar chart — no deps.
export default function BarChart({ data, height = 160 }) {
  if (!data || data.length === 0) {
    return <p className="text-neutral-400 text-sm py-6 text-center">No data yet.</p>
  }
  const max = Math.max(...data.map(d => d.value), 1)
  const colors = ['#fbbf24', '#cbd5e1', '#fb923c', '#a5b4fc', '#818cf8', '#c4b5fd', '#f0abfc', '#5eead4', '#fda4af', '#93c5fd']

  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
            <span className="text-[10px] text-neutral-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {d.value.toLocaleString()}
            </span>
            <div
              className="w-full rounded-t-md transition-all duration-700"
              style={{ height: `${pct}%`, background: colors[i % colors.length], minHeight: 2 }}
              title={`${d.label}: ${d.value.toLocaleString()}`}
            />
            <span className="text-[10px] text-neutral-500 mt-1 truncate max-w-full">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isAurora = theme === 'aurora'
  return (
    <button
      onClick={toggle}
      title={`Theme: ${theme} (click to switch)`}
      className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-lg active:scale-95"
      aria-label="Toggle theme"
    >
      {isAurora ? '🌅' : '🌙'}
    </button>
  )
}

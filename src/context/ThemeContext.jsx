import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

// Two ambiances over the mountain background. Both keep white-text contrast.
const THEMES = ['midnight', 'aurora']

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('selftrack_theme') || 'midnight')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('selftrack_theme', theme)
  }, [theme])

  const toggle = () => setTheme(t => (t === 'midnight' ? 'aurora' : 'midnight'))

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

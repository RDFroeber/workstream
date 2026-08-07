import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { themeColor } from './colors'

const STORAGE_KEY = 'lines-theme'
const ThemeContext = createContext({ preference: 'system', isDark: false, setPreference: () => {} })

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

function readPreference() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readPreference)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const isDark = preference === 'dark' || (preference === 'system' && systemDark)

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
    // Keep the browser/OS chrome in step with the app.
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
    if (meta) meta.setAttribute('content', isDark ? '#14181D' : '#F7F8FA')
  }, [isDark])

  const setPreference = useCallback((next) => {
    setPreferenceState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private browsing — the theme just won't persist */
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ preference, isDark, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

/**
 * Returns a function mapping a stored line color to the variant for the active
 * theme. Components call this rather than using `ws.color` directly, because
 * half the light palette is unreadable on a dark panel.
 */
export function useLineColor() {
  const { isDark } = useTheme()
  return useCallback((hex) => themeColor(hex, isDark), [isDark])
}

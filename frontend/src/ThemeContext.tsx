import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import type { ThemeMode, Locale } from './i18n'

interface AppContextType {
  themeMode: ThemeMode
  setThemeMode: (m: ThemeMode) => void
  isDark: boolean
  locale: Locale
  setLocale: (l: Locale) => void
}

export type SurfaceTheme = {
  appBg: string
  panelBg: string
  panelBgElevated: string
  navBg: string
  navRailBg: string
  cardBg: string
  cardBorder: string
  strongBorder: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  brand: string
  brandSoft: string
  success: string
  warning: string
  danger: string
  shadow: string
  shadowSoft: string
}

const lightSurfaceTheme: SurfaceTheme = {
  appBg: '#f5f7fb',
  panelBg: '#ffffff',
  panelBgElevated: '#fcfcfd',
  navBg: 'rgba(255,255,255,0.88)',
  navRailBg: '#eef2f7',
  cardBg: '#ffffff',
  cardBorder: '#e6eaf2',
  strongBorder: '#d8deea',
  textPrimary: '#111827',
  textSecondary: '#4b5563',
  textMuted: '#94a3b8',
  brand: '#2563eb',
  brandSoft: 'rgba(37,99,235,0.10)',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  shadow: '0 16px 40px rgba(15, 23, 42, 0.08)',
  shadowSoft: '0 6px 18px rgba(15, 23, 42, 0.06)',
}

const darkSurfaceTheme: SurfaceTheme = {
  appBg: '#0b1020',
  panelBg: '#111827',
  panelBgElevated: '#0f172a',
  navBg: 'rgba(11,16,32,0.86)',
  navRailBg: 'rgba(148,163,184,0.08)',
  cardBg: '#111827',
  cardBorder: '#1f2937',
  strongBorder: '#334155',
  textPrimary: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  brand: '#60a5fa',
  brandSoft: 'rgba(96,165,250,0.16)',
  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#f87171',
  shadow: '0 20px 48px rgba(2, 6, 23, 0.45)',
  shadowSoft: '0 8px 24px rgba(2, 6, 23, 0.28)',
}

const AppContext = createContext<AppContextType>({
  themeMode: 'system',
  setThemeMode: () => {},
  isDark: false,
  locale: 'zh',
  setLocale: () => {},
})

export const useAppContext = () => useContext(AppContext)
export const getSurfaceTheme = (isDark: boolean) => isDark ? darkSurfaceTheme : lightSurfaceTheme

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme') as ThemeMode) || 'dark'
  })
  const [locale, setLocaleState] = useState<Locale>(() => {
    return (localStorage.getItem('locale') as Locale) || 'zh'
  })
  const [systemDark, setSystemDark] = useState(getSystemDark)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const isDark = useMemo(() => {
    if (themeMode === 'dark') return true
    if (themeMode === 'light') return false
    return systemDark
  }, [themeMode, systemDark])

  const setThemeMode = (m: ThemeMode) => {
    setThemeModeState(m)
    localStorage.setItem('theme', m)
  }

  const setLocale = (l: Locale) => {
    setLocaleState(l)
    localStorage.setItem('locale', l)
  }

  return (
    <AppContext.Provider value={{ themeMode, setThemeMode, isDark, locale, setLocale }}>
      {children}
    </AppContext.Provider>
  )
}

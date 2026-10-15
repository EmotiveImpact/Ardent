import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemeId = 'light' | 'dark' | 'midnight' | 'glass' | 'luxe' | 'system'

export interface ThemeDefinition {
  id: ThemeId
  name: string
  description: string
  preview: string // CSS gradient for the selector preview
  isDark: boolean
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'light',
    name: 'Light',
    description: 'Clean & professional',
    preview: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    isDark: false,
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Refined minimal dark',
    preview: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    isDark: true,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep OLED black',
    preview: 'linear-gradient(135deg, #000000 0%, #0a0a0f 100%)',
    isDark: true,
  },
  {
    id: 'glass',
    name: 'Glass',
    description: 'Frosted glassmorphism',
    preview: 'linear-gradient(135deg, #1a1a2e80 0%, #0d0d1580 50%, #252540 100%)',
    isDark: true,
  },
  {
    id: 'luxe',
    name: 'Luxe',
    description: 'Rich gradient warmth',
    preview: 'linear-gradient(135deg, #1a1020 0%, #2d1b3d 50%, #1a2030 100%)',
    isDark: true,
  },
]

interface ThemeContextValue {
  theme: ThemeId
  resolvedTheme: Exclude<ThemeId, 'system'>
  setTheme: (theme: ThemeId) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
  isDark: false,
})

export function useTheme() {
  return useContext(ThemeContext)
}

function getSystemTheme(): 'light' | 'dark' {
  // Default to light when there's no system preference signal — this
  // keeps SSR / no-window paths consistent with the new light default.
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const STORAGE_KEY = 'haumea_theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window === 'undefined') return 'light'
    return (localStorage.getItem(STORAGE_KEY) as ThemeId) || 'light'
  })

  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme
  const isDark = THEMES.find(t => t.id === resolvedTheme)?.isDark ?? false

  const setTheme = useCallback((newTheme: ThemeId) => {
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
  }, [])

  // Apply theme to document — both `class="dark|light"` AND `data-theme="X"` so
  // HeroUI v3's class-based component CSS works alongside our custom themes.
  useEffect(() => {
    const root = document.documentElement

    // Remove all theme classes
    THEMES.forEach(t => root.classList.remove(`theme-${t.id}`))
    root.classList.remove('dark', 'light')

    // Apply resolved theme
    root.classList.add(`theme-${resolvedTheme}`)
    root.classList.add(isDark ? 'dark' : 'light')

    // Set data attribute for CSS selectors
    root.setAttribute('data-theme', resolvedTheme)
  }, [resolvedTheme, isDark])

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setThemeState('system') // triggers re-render
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  // Honour `prefers-reduced-motion` by setting HeroUI v3's `data-reduce-motion`
  // attribute on the html element. HeroUI extends Tailwind's `motion-reduce:`
  // variant to read both the native media query and this attribute, so wiring
  // it explicitly lets us flip motion on/off independent of OS state in future.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = (matches: boolean) => {
      if (matches) {
        document.documentElement.setAttribute('data-reduce-motion', 'true')
      } else {
        document.documentElement.removeAttribute('data-reduce-motion')
      }
    }
    apply(mq.matches)
    const handler = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const contextValue = useMemo(
    () => ({ theme, resolvedTheme, setTheme, isDark }),
    [theme, resolvedTheme, setTheme, isDark],
  )

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

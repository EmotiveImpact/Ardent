// App theme (light / dark "pro-tool" mode), powered by HeroUI Native + Uniwind.
//
// Uniwind.setTheme() flips the active theme; every HeroUI component and every
// semantic-token className (bg-surface, text-foreground, border-border, …)
// re-resolves automatically. We persist the choice in AsyncStorage so it sticks
// across launches. The brand navy chrome, brand orange (--accent), and status
// colors are intentionally theme-INDEPENDENT and stay fixed in both modes.
import { useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Uniwind, useUniwind } from 'uniwind'

const THEME_KEY = 'haumea.theme'
export type ThemeName = 'light' | 'dark'

/** Apply the persisted theme on boot. Call once in the root layout (before/at first paint). */
export async function loadPersistedTheme(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') Uniwind.setTheme(saved)
  } catch {
    // ignore — falls back to the default (light)
  }
}

/** Current theme + a persisted setter/toggle. Re-renders consumers on change. */
export function useAppTheme() {
  const { theme } = useUniwind()
  const isDark = theme === 'dark'
  const setTheme = useCallback((next: ThemeName) => {
    Uniwind.setTheme(next)
    void AsyncStorage.setItem(THEME_KEY, next)
  }, [])
  const toggle = useCallback(() => setTheme(isDark ? 'light' : 'dark'), [isDark, setTheme])
  return { theme: (theme as ThemeName) ?? 'light', isDark, setTheme, toggle }
}

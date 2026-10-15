import { Check } from 'lucide-react'
import { useTheme, THEMES, type ThemeId } from '@/contexts/theme-context'

export function ThemeSelector() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="grid grid-cols-3 gap-2">
      {THEMES.map((t) => {
        const isActive = theme === t.id
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`
              relative group flex flex-col items-center gap-1.5 p-2 rounded-xl
              border transition-all duration-200 cursor-pointer
              ${isActive
                ? 'border-brand-500 ring-2 ring-brand-500/20 bg-brand-500/5'
                : 'border-border-default hover:border-border-strong hover:bg-surface-elevated/50'
              }
            `}
          >
            {/* Theme preview swatch */}
            <div
              className="w-full aspect-[4/3] rounded-lg border border-white/10 overflow-hidden relative"
              style={{ background: t.preview }}
            >
              {/* Mini card mockup */}
              <div className={`absolute inset-2 top-3 rounded-md ${t.isDark ? 'bg-white/10' : 'bg-black/5'} backdrop-blur-sm`}>
                <div className={`h-1 w-6 rounded-full mx-1.5 mt-1.5 ${t.isDark ? 'bg-white/30' : 'bg-black/20'}`} />
                <div className={`h-1 w-4 rounded-full mx-1.5 mt-1 ${t.isDark ? 'bg-white/15' : 'bg-black/10'}`} />
              </div>
              {isActive && (
                <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-brand-500 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </div>
            <div className="text-center">
              <p className={`text-xs font-medium ${isActive ? 'text-brand-500' : 'text-text-primary'}`}>
                {t.name}
              </p>
              <p className="text-[10px] text-text-muted leading-tight">{t.description}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** Compact inline theme switcher for topbar/sidebar */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  const nextTheme = (): ThemeId => {
    const order: ThemeId[] = ['light', 'dark', 'midnight', 'glass', 'luxe']
    const idx = order.indexOf(resolvedTheme)
    return order[(idx + 1) % order.length]
  }

  const currentTheme = THEMES.find(t => t.id === resolvedTheme)

  return (
    <button
      onClick={() => setTheme(nextTheme())}
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs
        text-text-secondary hover:text-text-primary hover:bg-surface-elevated
        border border-border-default transition-all"
      title={`Theme: ${currentTheme?.name}`}
    >
      <div
        className="w-3 h-3 rounded-full border border-white/20"
        style={{ background: currentTheme?.preview }}
      />
      <span className="hidden sm:inline">{currentTheme?.name}</span>
    </button>
  )
}

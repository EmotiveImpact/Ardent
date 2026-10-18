/**
 * Ardent design tokens, framework neutral.
 *
 * Plain values only, so Tailwind (Core) and React Native (mobile) can both
 * import them. Core mirrors these as CSS variables in src/index.css; change
 * both together.
 */

export const color = {
  /** Page background. */
  bg: '#070707',
  /** Panels and cards. */
  surface: '#111111',
  /** Recessed wells inside a panel. */
  inset: '#0c0c0c',
  /** Controls, chips, hovered rows. */
  raised: '#1a1a1a',
  line: '#222222',
  lineStrong: '#2e2e2e',
  fg: '#f2f2f2',
  fgMuted: '#9a9a9a',
  fgFaint: '#5f5f5f',
  /** The one brand accent. Use sparingly: active state, primary signal, live things. */
  ember: '#ff6a1a',
  emberSoft: 'rgba(255, 106, 26, 0.15)',
  /** Status colours. Only for state, never decoration. */
  ok: '#22c55e',
  warn: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  violet: '#8b5cf6',
} as const

export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  pill: 999,
} as const

/** 4pt grid. */
export const space = {
  0: 0,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const

export const font = {
  /** Wordmark, hero lines and big screen titles. Wide, uppercase, tracked out. */
  display: 'Unbounded',
  /** Everything else. */
  body: 'Geist',
  /** Every number, money value, job ref, postcode and registration. */
  mono: 'Geist Mono',
} as const

export const type = {
  caption: { size: 11, lineHeight: 14 },
  small: { size: 12, lineHeight: 16 },
  body: { size: 13, lineHeight: 18 },
  bodyLarge: { size: 15, lineHeight: 22 },
  title: { size: 18, lineHeight: 24 },
  metric: { size: 28, lineHeight: 32 },
  display: { size: 32, lineHeight: 36, letterSpacing: 1.5 },
} as const

export const tokens = { color, radius, space, font, type } as const
export type Tokens = typeof tokens

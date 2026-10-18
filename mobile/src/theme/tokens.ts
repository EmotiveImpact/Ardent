// Ardent design tokens, mobile mirror of Ardent Core's :root in
// core/src/index.css. Core owns them: keep names and values in step.

export const color = {
  bg: '#070707',
  surface: '#111111',
  inset: '#0c0c0c',
  raised: '#1a1a1a',
  line: '#222222',
  lineStrong: '#2e2e2e',
  fg: '#f2f2f2',
  fgMuted: '#9a9a9a',
  fgFaint: '#5f5f5f',
  ember: '#ff6a1a',
  emberSoft: '#ff6a1a26',
  ok: '#22c55e',
  warn: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  violet: '#8b5cf6',
} as const;

export const font = {
  /** Wide display face for mode names and headlines. Mobile only, proposed to Core. */
  display: 'Michroma_400Regular',
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemi: 'Geist_600SemiBold',
  /** Every number, code and postcode, as in Core. */
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Core's --radius is 10px; sm, md and xl follow its calc steps. */
export const radius = { sm: 6, md: 8, lg: 10, xl: 14, pill: 999 } as const;

export const tracking = { display: 1.2, label: 2.4 } as const;

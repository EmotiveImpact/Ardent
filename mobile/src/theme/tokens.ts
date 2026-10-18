// Ardent design tokens, mobile mirror.
// Ardent Core owns the canonical set. These values are kept framework neutral
// (plain hex, numbers, font names) so they can be swapped for Core's shared
// export without touching any screen.

export const color = {
  void: '#0B0C0D',
  carbon: '#121416',
  graphite: '#1A1D20',
  slate: '#2A2F33',
  line: 'rgba(232, 226, 214, 0.10)',
  bone: '#E8E2D6',
  boneDim: 'rgba(232, 226, 214, 0.62)',
  boneFaint: 'rgba(232, 226, 214, 0.32)',
  ember: '#D9B98A',
  signal: '#9FD3A8',
  hazard: '#E2A23B',
  alert: '#E0644F',
} as const;

export const font = {
  display: 'Michroma_400Regular',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const tracking = { display: 1.2, label: 2.4 } as const;

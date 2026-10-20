// Ardent design tokens on mobile. Colours, radius, spacing and type scale
// come from the Ardent design kit (src/kit, synced from engine/kit).
// React Native needs loaded font family names, so only `font` is mapped.
export { color, radius, space, type } from '@/kit/tokens';

export const font = {
  display: 'Michroma_400Regular',
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemi: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

/** Letter spacing for the wide display face. */
export const tracking = { display: 1.5, label: 2.4 } as const;

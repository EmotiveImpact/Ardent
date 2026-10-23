// Ardent design tokens on mobile. Colours, radius, spacing, motion, the bloom
// and the type scale come from the Ardent design kit (src/kit, synced from
// engine/kit). React Native needs loaded font family names, so only `font` is
// mapped here.
export { bloom, color, motion, radius, space, type } from '@/kit/tokens';
export { toneColor, type Tone } from '@/kit/states';

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

/** Panels sit a shade above the field and let a little of the bloom through. */
export const glass = 'rgba(18,18,18,0.82)';

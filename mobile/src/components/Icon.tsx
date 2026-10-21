import Svg, { Path } from 'react-native-svg';

import { color } from '@/theme/tokens';

/* Ardent's own icon set, the same one Core uses: one stroke weight, drawn on a 24 grid. */
const paths = {
  today: 'M7 4h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4V2.5h6V4M8.5 10h7M8.5 14h7M8.5 18h4',
  week: 'M5.5 5h13a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3.5 10h17M8 2.5v5M16 2.5v5',
  me: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM4 21c1.2-4.2 4.4-6 8-6s6.8 1.8 8 6',
  pin: 'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
  camera: 'M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 10.5a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4z',
  box: 'M12 2.8l8 4.4v9.6l-8 4.4-8-4.4V7.2zM4 7.2l8 4.4 8-4.4M12 11.6v9.6',
  gauge: 'M3.5 16a8.5 8.5 0 1 1 17 0M12 16l4-5M12 16a1 1 0 1 0 0 .01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  phone: 'M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z',
  route: 'M5 19a2 2 0 1 0 0-.01M19 5a2 2 0 1 0 0-.01M7 19h7.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H17',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  pause: 'M8.5 5v14M15.5 5v14',
  mic: 'M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3',
  door: 'M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21M3.5 21h17M14.5 12.5v.01',
  pound: 'M16 5.5A4.5 4.5 0 0 0 8.5 9v3.5c0 3-1.5 5.5-3 7h13M6 13h8',
  signal: 'M4 20v-3M9 20v-7M14 20v-11M19 20V5',
  cross: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  flame: 'M12 21a6 6 0 0 0 6-6c0-4.2-3.2-6.4-4.2-10-1.1 2.7-2.3 3.9-3.7 4.9C9.2 8.6 8.6 7.3 8.6 7.3 7 9.2 6 11.8 6 15a6 6 0 0 0 6 6zM12 21a2.5 2.5 0 0 0 2.5-2.5c0-1.8-1.5-2.7-2.5-4.5-1 1.8-2.5 2.7-2.5 4.5A2.5 2.5 0 0 0 12 21z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  note: 'M6 3.5h12a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5zM8 9h8M8 13h8M8 17h5',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, tint = color.fg, strokeWidth = 1.6 }: { name: IconName; size?: number; tint?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={paths[name]} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

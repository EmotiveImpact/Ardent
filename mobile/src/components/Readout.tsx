import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { color, font } from '@/theme/tokens';

type Glyph = 'jobs' | 'quotes' | 'owed';

function Icon({ glyph }: { glyph: Glyph }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Circle cx={8} cy={8} r={8} fill={color.fg} />
      {glyph === 'jobs' && <Path d="M5 6.2h6v4.6H5zM6.6 6.2V5h2.8v1.2" stroke={color.bg} strokeWidth={1.2} fill="none" />}
      {glyph === 'quotes' && <Path d="M5.4 4.8h5.2v6.4H5.4zM6.8 7h2.4M6.8 8.8h2.4" stroke={color.bg} strokeWidth={1.2} fill="none" />}
      {glyph === 'owed' && <Path d="M9.8 5.4a2 2 0 0 0-3.4 1.4v3.8M5.6 8h3M5.4 10.8h5" stroke={color.bg} strokeWidth={1.2} fill="none" strokeLinecap="round" />}
    </Svg>
  );
}

export function Readout({ glyph, value }: { glyph: Glyph; value: string }) {
  return (
    <View style={styles.row}>
      <Icon glyph={glyph} />
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { color: color.fgMuted, fontFamily: font.monoMedium, fontSize: 11, letterSpacing: 0.3 },
});

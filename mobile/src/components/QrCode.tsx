import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { radius } from '@/theme/tokens';

/**
 * A QR code a customer's phone camera can read: dark modules on a white
 * square with a quiet zone round it, the way scanners expect. The white
 * square is the one light thing on a dark screen, which helps it stand out
 * at arm's length.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  // As big as the screen allows: an offline code carries the whole invoice, so it is dense.
  const { width } = useWindowDimensions();
  const size = Math.min(340, Math.max(220, width - 44));
  const { path, count } = useMemo(() => {
    // A short link can afford more error correction; a long offline code stays readable with less.
    const qr = qrcode(0, value.length > 200 ? 'L' : 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    // One rectangle per run of dark modules along a row, so there are no seams inside a run.
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        let run = 1;
        while (c + run < n && qr.isDark(r, c + run)) run++;
        d += `M${c} ${r}h${run}v1h-${run}z`;
        c += run - 1;
      }
    }
    return { path: d, count: n };
  }, [value]);
  // Four modules of quiet zone on every side.
  const quiet = 4;
  const box = count + quiet * 2;
  return (
    <View style={[styles.wrap, { width: size, height: size }]} accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${box} ${box}`}>
        <Rect x={-quiet} y={-quiet} width={box} height={box} fill="#ffffff" />
        <Path d={path} fill="#070707" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.xl + 2, overflow: 'hidden', backgroundColor: '#ffffff', alignSelf: 'center' },
});

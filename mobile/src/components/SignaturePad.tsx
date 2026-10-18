import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { color, font, radius } from '@/theme/tokens';

// Strokes are stored in a fixed 1000 by 400 box so a signature drawn on any
// phone renders the same everywhere else.
const W = 1000;
const H = 400;

export function SignaturePad({ onChange }: { onChange: (svg: string) => void }) {
  const [strokes, setStrokes] = useState<string[]>([]);
  const size = useRef({ w: 1, h: 1 });
  const live = useRef('');
  const [, force] = useState(0);

  const toBox = (x: number, y: number) =>
    `${Math.round((x / size.current.w) * W)} ${Math.round((y / size.current.h) * H)}`;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          live.current = `M${toBox(e.nativeEvent.locationX, e.nativeEvent.locationY)}`;
          force((n) => n + 1);
        },
        onPanResponderMove: (e) => {
          live.current += ` L${toBox(e.nativeEvent.locationX, e.nativeEvent.locationY)}`;
          force((n) => n + 1);
        },
        onPanResponderRelease: () => {
          const done = live.current;
          live.current = '';
          setStrokes((s) => {
            const next = [...s, done];
            onChange(next.join(' '));
            return next;
          });
        },
      }),
    [onChange],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };

  const clear = () => {
    setStrokes([]);
    onChange('');
  };

  const empty = strokes.length === 0 && !live.current;

  return (
    <View>
      <View style={styles.pad} onLayout={onLayout} {...pan.panHandlers}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} pointerEvents="none">
          {[...strokes, live.current].filter(Boolean).map((d, i) => (
            <Path key={i} d={d} stroke={color.fg} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {empty && <Text style={styles.hint} pointerEvents="none">Sign here</Text>}
        <View style={styles.baseline} pointerEvents="none" />
      </View>
      {!empty && (
        <Text onPress={clear} style={styles.clear} accessibilityRole="button">
          Clear
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    aspectRatio: W / H,
    borderRadius: radius.xl,
    backgroundColor: color.inset,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    overflow: 'hidden',
  },
  hint: { position: 'absolute', alignSelf: 'center', top: '40%', color: color.fgFaint, fontFamily: font.sans, fontSize: 14 },
  baseline: { position: 'absolute', left: '8%', right: '8%', bottom: '22%', height: StyleSheet.hairlineWidth, backgroundColor: color.lineStrong },
  clear: { alignSelf: 'flex-end', marginTop: 8, color: color.fgMuted, fontFamily: font.sansMedium, fontSize: 13 },
});

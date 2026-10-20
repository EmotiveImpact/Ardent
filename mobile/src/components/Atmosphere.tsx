import { useEffect } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { OperatorState } from '@/data/types';
import { bloom, color, motion } from '@/theme/tokens';

const grain = require('../../assets/grain.png');

/** Where the light sits for each working mode, as fractions of the screen. */
const AT: Record<OperatorState, { x: number; y: number }> = {
  on_site: { x: 0.8, y: 0.56 },
  en_route: { x: 0.22, y: 0.4 },
  on_call: { x: 0.72, y: 0.3 },
  workshop: { x: 0.5, y: 0.68 },
  delayed: { x: 0.3, y: 0.36 },
  off_shift: { x: 0.36, y: 0.8 },
};

const STATES = Object.keys(AT) as OperatorState[];

function Bloom({ state, active }: { state: OperatorState; active: boolean }) {
  const { width, height } = useWindowDimensions();
  const o = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    o.value = withTiming(active ? 1 : 0, { duration: motion.light, easing: Easing.out(Easing.cubic) });
  }, [active, o]);

  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: 0.92 + o.value * 0.08 }] }));
  const { color: tint, strength } = bloom[state];
  const at = AT[state];
  const gid = `bloom-${state}`;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={gid} cx={at.x * width} cy={at.y * height} rx={width * 0.9} ry={height * 0.52} fx={at.x * width} fy={at.y * height} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={tint} stopOpacity={Math.min(0.75, strength * 2.6)} />
            <Stop offset="0.3" stopColor={tint} stopOpacity={strength * 0.9} />
            <Stop offset="0.65" stopColor={color.raised} stopOpacity={0.35} />
            <Stop offset="1" stopColor={color.bg} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  );
}

/** Near-black field, a slow bloom of light that follows the working mode, and film grain over everything. */
export function Atmosphere({ state }: { state: OperatorState }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.bg }]}>
      {STATES.map((s) => (
        <Bloom key={s} state={s} active={s === state} />
      ))}
      <Image source={grain} resizeMode="repeat" style={[StyleSheet.absoluteFill, styles.grain]} />
    </View>
  );
}

const styles = StyleSheet.create({
  grain: { width: '100%', height: '100%', opacity: 0.55 },
});

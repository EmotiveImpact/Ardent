import { useEffect } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { MODES, type ModeSpec } from '@/data/modes';
import { color } from '@/theme/tokens';
import type { OperatorMode } from '@/data/types';

const grain = require('../../assets/grain.png');

function Bloom({ spec, active }: { spec: ModeSpec; active: boolean }) {
  const { width, height } = useWindowDimensions();
  const o = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    o.value = withTiming(active ? 1 : 0, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [active, o]);

  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: 0.92 + o.value * 0.08 }] }));
  const gid = `g-${spec.id}`;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient
            id={gid}
            cx={spec.glowAt.x * width}
            cy={spec.glowAt.y * height}
            rx={width * 0.85}
            ry={height * 0.5}
            fx={spec.glowAt.x * width}
            fy={spec.glowAt.y * height}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={spec.glow} stopOpacity={0.5} />
            <Stop offset="0.35" stopColor={spec.glow} stopOpacity={0.16} />
            <Stop offset="0.7" stopColor={color.raised} stopOpacity={0.4} />
            <Stop offset="1" stopColor={color.bg} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  );
}

/** Near-black field, a cool steel haze, a slow light bloom that follows the mode, and film grain on top. */
export function Atmosphere({ mode }: { mode: OperatorMode }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.bg }]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="cool" cx="62%" cy="38%" rx="80%" ry="45%" fx="62%" fy="38%">
            <Stop offset="0" stopColor="#4A5A60" stopOpacity={0.45} />
            <Stop offset="0.6" stopColor="#2A3236" stopOpacity={0.25} />
            <Stop offset="1" stopColor={color.bg} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#cool)" />
      </Svg>
      {MODES.map((m) => (
        <Bloom key={m.id} spec={m} active={m.id === mode} />
      ))}
      <Image source={grain} resizeMode="repeat" style={[StyleSheet.absoluteFill, styles.grain]} />
    </View>
  );
}

const styles = StyleSheet.create({
  grain: { width: '100%', height: '100%', opacity: 0.55 },
});

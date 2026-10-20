import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { color, font, tracking } from '@/theme/tokens';

const HOLD_MS = 650;
const haptic = (fn: () => Promise<void>) => {
  if (Platform.OS !== 'web') fn().catch(() => {});
};

/**
 * The bar where the home indicator sits in the mockup. Press and hold to fill
 * it; letting go early drains it. Deliberate enough that it never fires from
 * a pocket.
 */
export function HoldToEnter({ label, onEnter }: { label: string; onEnter: () => void }) {
  const p = useSharedValue(0);
  const fired = useRef(false);

  const done = () => {
    if (fired.current) return;
    fired.current = true;
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    onEnter();
    setTimeout(() => {
      fired.current = false;
      p.value = 0;
    }, 600);
  };

  const start = () => {
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    p.value = withTiming(1, { duration: HOLD_MS * (1 - p.value), easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) scheduleOnRN(done);
    });
  };

  const release = () => {
    if (fired.current) return;
    cancelAnimation(p);
    p.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
  };

  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  const hint = useAnimatedStyle(() => ({ opacity: 0.5 + p.value * 0.5 }));

  return (
    <Pressable onPressIn={start} onPressOut={release} hitSlop={24} style={styles.wrap} accessibilityRole="button" accessibilityLabel={label}>
      <Animated.Text style={[styles.label, hint]}>{label}</Animated.Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fill]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 14, gap: 12 },
  label: { color: color.fg, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label },
  track: { width: 148, height: 4, borderRadius: 2, backgroundColor: color.lineStrong, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.ember, borderRadius: 2 },
});

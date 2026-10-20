import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { color, font, motion, tracking } from '@/theme/tokens';

const haptic = (fn: () => Promise<void>) => {
  if (Platform.OS !== 'web') fn().catch(() => {});
};

/**
 * Press and hold to commit. A thin bar fills in ember while you hold and
 * drains if you let go early. Deliberate enough that it never fires from a
 * pocket. For anything that can't be casually undone.
 */
export function HoldToCommit({ label, onCommit, disabled }: { label: string; onCommit: () => void; disabled?: boolean }) {
  const p = useSharedValue(0);
  const fired = useRef(false);

  const done = () => {
    if (fired.current) return;
    fired.current = true;
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    onCommit();
    setTimeout(() => {
      fired.current = false;
      p.value = 0;
    }, 600);
  };

  const start = () => {
    if (disabled) return;
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    p.value = withTiming(1, { duration: motion.hold * (1 - p.value), easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) scheduleOnRN(done);
    });
  };

  const release = () => {
    if (fired.current) return;
    cancelAnimation(p);
    p.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
  };

  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  const hint = useAnimatedStyle(() => ({ opacity: 0.55 + p.value * 0.45 }));

  return (
    <Pressable
      onPressIn={start}
      onPressOut={release}
      hitSlop={20}
      style={[styles.wrap, disabled && { opacity: 0.35 }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, press and hold`}
      accessibilityState={{ disabled }}
      // Screen readers can't hold, so a double tap commits for them.
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate' && !disabled) done();
      }}
    >
      <Animated.Text style={[styles.label, hint]}>{label.toUpperCase()}</Animated.Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fill]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 14, gap: 12 },
  label: { color: color.fg, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label, textAlign: 'center' },
  track: { width: 148, height: 4, borderRadius: 2, backgroundColor: color.lineStrong, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.ember, borderRadius: 2 },
});

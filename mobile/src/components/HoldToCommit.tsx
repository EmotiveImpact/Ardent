import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon, type IconName } from '@/components/Icon';
import { color, font, motion, radius } from '@/theme/tokens';

const haptic = (fn: () => Promise<void>) => {
  if (Platform.OS !== 'web') fn().catch(() => {});
};

/**
 * The screen's main move, docked under the thumb. Press and hold to commit: a bar
 * fills along the bottom while you hold and drains if you let go early, so it never
 * fires from a pocket. Pressing twice works too, for shaky hands, gloves and screen
 * readers. Ember for the one thing that matters now; grey for a quieter commit.
 */
export function HoldToCommit({
  label,
  onCommit,
  disabled,
  icon,
  tone = 'ember',
}: {
  label: string;
  onCommit: () => void;
  disabled?: boolean;
  icon?: IconName;
  tone?: 'ember' | 'grey';
}) {
  const p = useSharedValue(0);
  const fired = useRef(false);
  // The tap that ends a full hold isn't a first press.
  const swallow = useRef(false);
  const [armed, setArmed] = useState(false);
  const disarm = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(disarm.current), []);

  const done = () => {
    if (fired.current) return;
    fired.current = true;
    setArmed(false);
    clearTimeout(disarm.current);
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    onCommit();
    setTimeout(() => {
      fired.current = false;
      p.value = 0;
    }, 600);
  };

  const held = () => {
    swallow.current = true;
    done();
  };

  const start = () => {
    if (disabled) return;
    swallow.current = false;
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    p.value = withTiming(1, { duration: motion.hold * (1 - p.value), easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) scheduleOnRN(held);
    });
  };

  const release = () => {
    if (fired.current) return;
    cancelAnimation(p);
    p.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
  };

  const press = () => {
    if (disabled) return;
    if (swallow.current) {
      swallow.current = false;
      return;
    }
    if (armed) return done();
    setArmed(true);
    haptic(() => Haptics.selectionAsync());
    clearTimeout(disarm.current);
    disarm.current = setTimeout(() => setArmed(false), 4000);
  };

  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  const ember = tone === 'ember';
  const ink = ember ? color.bg : color.fg;
  const text = armed ? 'Press again to confirm' : label;

  return (
    <Pressable
      onPressIn={start}
      onPressOut={release}
      onPress={press}
      hitSlop={12}
      style={[styles.wrap, ember ? styles.ember : styles.grey, disabled && { opacity: 0.35 }]}
      accessibilityRole="button"
      accessibilityLabel={armed ? `${label}. Press again to confirm` : `${label}. Press and hold, or press twice`}
      accessibilityState={{ disabled }}
      // Screen readers can't hold, so their activate commits straight away.
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'activate' && !disabled) done();
      }}
    >
      <View style={styles.inner}>
        {icon && !armed && <Icon name={icon} size={18} tint={ink} />}
        <Text style={[styles.label, { color: ink }]} numberOfLines={1}>
          {text.toUpperCase()}
        </Text>
      </View>
      <Animated.View style={[styles.fill, { backgroundColor: ember ? 'rgba(7,7,7,0.45)' : color.ember }, fill]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 64, borderRadius: radius.xl + 2, overflow: 'hidden', justifyContent: 'center' },
  ember: { backgroundColor: color.ember },
  grey: { backgroundColor: color.raised },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  label: { fontFamily: font.display, fontSize: 12, letterSpacing: 2.2, textAlign: 'center', flexShrink: 1 },
  fill: { position: 'absolute', left: 0, bottom: 0, height: 4 },
});

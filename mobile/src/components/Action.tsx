import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { color, font, radius, space } from '@/theme/tokens';

const tap = () => {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

type Tone = 'plain' | 'ember' | 'ghost';

export function Action({
  title,
  onPress,
  tone = 'plain',
  disabled,
  flex,
}: {
  title: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
  flex?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        tone === 'ember' && styles.ember,
        tone === 'ghost' && styles.ghost,
        flex && { flex: 1 },
        (pressed || disabled) && { opacity: disabled ? 0.35 : 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.text, tone === 'ember' && { color: color.bg }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderRadius: radius.lg,
    backgroundColor: color.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ember: { backgroundColor: color.ember },
  ghost: { backgroundColor: 'transparent' },
  text: { color: color.fg, fontFamily: font.sansSemi, fontSize: 14 },
});

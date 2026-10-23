// Small shared pieces of the Field look. No borders anywhere: surfaces part by
// shade and space, and the only lines are hairlines between rows of a list.
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type TextStyle } from 'react-native';

import { Chip, IconButton } from '@/components/ardent';
import type { OperatorState } from '@/data/types';
import { copy } from '@/kit/copy';
import { operatorState } from '@/kit/states';
import { stateLabel, useField, waiting } from '@/sync/hooks';
import { color, font, radius, space, toneColor, type Tone } from '@/theme/tokens';

// Browsers draw a focus ring round inputs; Ardent shows focus by the caret alone.
const noRing = (Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0 } : {}) as TextStyle;

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={color.fgFaint} selectionColor={color.fg} {...props} style={[styles.input, noRing, props.style]} />;
}

/** The bottom of the screen, where the one main action sits under the thumb. */
export function Dock({ children }: { children: ReactNode }) {
  return <View style={styles.dock}>{children}</View>;
}

/** Back to where you came from. */
export function Back({ label, onPress }: { label: string; onPress?: () => void }) {
  const router = useRouter();
  return <IconButton icon="back" label={`Back to ${label}`} onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/today')))} />;
}

/** The working mode, always in view. Tap to change it. */
export function ModeChip({ state }: { state: OperatorState }) {
  const router = useRouter();
  return <Chip label={stateLabel(state)} tint={toneColor[operatorState[state].tone]} onPress={() => router.push('/start')} hint="Change mode" />;
}

/** How many changes are waiting for signal, or held back. Tap for the detail. */
export function SyncChip() {
  const router = useRouter();
  const s = useField();
  const n = waiting(s);
  const held = s.state.setAside.length;
  const text = held ? `${held} not sent` : n ? copy.waitingToSend(n) : copy.allSent;
  const tone: Tone = held ? 'danger' : n ? 'warn' : 'faint';
  return (
    <Pressable onPress={() => router.push('/me')} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${text}. Open sync`} style={({ pressed }) => [styles.sync, pressed && { opacity: 0.7 }]}>
      <View style={[styles.dot, { backgroundColor: toneColor[tone] }]} />
      <Text style={[styles.syncText, n || held ? { color: color.fg } : null]} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dot: { width: 6, height: 6, borderRadius: 3 },
  input: {
    minHeight: 52,
    color: color.fg,
    fontFamily: font.sans,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.xl,
    backgroundColor: color.surface,
  },
  dock: { paddingHorizontal: 22, paddingTop: space[3], paddingBottom: space[3], gap: space[2] },
  sync: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, height: 32, borderRadius: 16, backgroundColor: color.raised, flexShrink: 1 },
  syncText: { color: color.fgMuted, fontFamily: font.mono, fontSize: 11, letterSpacing: 0.6 },
});

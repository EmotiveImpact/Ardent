// Small shared pieces of the Field look. No borders anywhere: surfaces part by
// shade and space, and the only lines are hairlines between rows of a list.
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import type { OperatorState } from '@/data/types';
import { copy } from '@/kit/copy';
import { operatorState } from '@/kit/states';
import { stateLabel, useField, waiting } from '@/sync/hooks';
import { color, font, glass, radius, space, toneColor, tracking, type Tone } from '@/theme/tokens';

/** Faint wide label above a section. */
export function Label({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text style={styles.label}>{children.toUpperCase()}</Text>
    </View>
  );
}

/** A state in words with its dot. Colour only ever means state. */
export function StateText({ label, tone, size = 12 }: { label: string; tone: Tone; size?: number }) {
  const c = toneColor[tone];
  return (
    <View style={styles.state}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={{ color: c, fontFamily: font.sansMedium, fontSize: size }}>{label}</Text>
    </View>
  );
}

/** A panel a shade above the field. */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

/** A row in a panel. Rows after the first get the hairline divider. */
export function Row({ children, first, style, onPress }: { children: ReactNode; first?: boolean; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const s = [styles.row, !first && styles.divider, style];
  if (!onPress) return <View style={s}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...s, pressed && { opacity: 0.6 }]} accessibilityRole="button">
      {children}
    </Pressable>
  );
}

// Browsers draw a focus ring round inputs; Ardent shows focus by the caret alone.
const noRing = (Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0 } : {}) as TextStyle;

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={color.fgFaint} selectionColor={color.fg} {...props} style={[styles.input, noRing, props.style]} />;
}

/** The bottom of the screen, where the one main action sits under the thumb. */
export function Dock({ children }: { children: ReactNode }) {
  return <View style={styles.dock}>{children}</View>;
}

/** Back to where you came from, in the display face. */
export function Back({ label, onPress }: { label: string; onPress?: () => void }) {
  const router = useRouter();
  return (
    <Pressable onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/today')))} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Back to ${label}`}>
      <Text style={styles.back}>‹ {label.toUpperCase()}</Text>
    </Pressable>
  );
}

/** The working mode, always in view. Tap to change it. */
export function ModeChip({ state }: { state: OperatorState }) {
  const router = useRouter();
  const meta = { ...operatorState[state], label: stateLabel(state) };
  return (
    <Pressable onPress={() => router.push('/start')} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${meta.label}. Change mode`} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
      <View style={[styles.dot, { backgroundColor: toneColor[meta.tone] }]} />
      <Text style={styles.chipText}>{meta.label.toUpperCase()}</Text>
    </Pressable>
  );
}

/** "All sent", or how many changes are waiting for signal. Tap for the detail. */
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

/** Initials in a disc, for the way to Me. */
export function Avatar({ initials, onPress }: { initials: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel="Me" style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}>
      <Text style={styles.avatarText}>{initials}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  label: { color: color.fgFaint, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label * 1.5 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  panel: { borderRadius: radius.xl, backgroundColor: glass, paddingHorizontal: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  input: {
    minHeight: 46,
    color: color.fg,
    fontFamily: font.sans,
    fontSize: 15,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    borderRadius: radius.lg,
    backgroundColor: color.raised,
  },
  dock: { paddingHorizontal: space[6], paddingTop: space[3], paddingBottom: space[3], backgroundColor: 'rgba(7,7,7,0.92)' },
  back: { color: color.fgMuted, fontFamily: font.display, fontSize: 10, letterSpacing: tracking.label },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], paddingVertical: 7, borderRadius: radius.pill, backgroundColor: color.raised },
  chipText: { color: color.fg, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label },
  sync: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space[3], paddingVertical: 7, borderRadius: radius.pill, backgroundColor: color.inset, flexShrink: 1 },
  syncText: { color: color.fgMuted, fontFamily: font.sansMedium, fontSize: 11 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: color.fg, fontFamily: font.monoMedium, fontSize: 11 },
});

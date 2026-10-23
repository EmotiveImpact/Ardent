// The operator look's shared parts for Field, the same family as Core's: cap labels,
// wide display titles, instrument numbers, the stage track, step rings, action tiles,
// the Pass / Fail / N/A choice and the tab bar. No borders: fills, shade and space only.
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { color, font, radius, space } from '@/theme/tokens';

/** Directions in the phone's own maps app. */
export const openMaps = (where: string) => {
  const q = encodeURIComponent(where);
  void Linking.openURL(Platform.OS === 'ios' ? `maps:?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`);
};

/** What to call a customer on a button: a person by first name, a firm or agency by "them". */
export const ringName = (c: { name: string; kind: string }) => (c.kind === 'homeowner' || c.kind === 'landlord' ? c.name.split(' ')[0] : 'them');

/** Ring a number from the phone. */
export const ring = (phone: string) => void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);

const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

/** A small mono caps label: what a value is. Never under 11pt. */
export function Cap({ children, tint = color.fgMuted, style }: { children: ReactNode; tint?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.cap, { color: tint }, style]}>{typeof children === 'string' ? children.toUpperCase() : children}</Text>;
}

/** A screen or moment title in the wide display face. */
export function OpTitle({ children, size = 30, style }: { children: string; size?: number; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[s.title, { fontSize: size, lineHeight: size * 1.25 }, style]} accessibilityRole="header">
      {children.toUpperCase()}
    </Text>
  );
}

/** A number that reads like an instrument. */
export function Num({ children, size = 44, tint = color.fg, unit, style }: { children: ReactNode; size?: number; tint?: string; unit?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.numRow, style]}>
      <Text style={[s.num, { fontSize: size, lineHeight: size * 1.1, color: tint }]}>{children}</Text>
      {unit && <Text style={s.unit}>{unit.toUpperCase()}</Text>}
    </View>
  );
}

/** The top of every screen: the working mode on the left, a ref or the time on the right. */
export function TopRow({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.top}>
      {left}
      {typeof right === 'string' ? <Text style={s.topRight}>{right}</Text> : right}
    </View>
  );
}

/** A panel a shade above the page. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

/**
 * Booked, road, on site, done, paid: filled up to where the job is, the current stop ringed.
 * Pass `labels` for a shorter track with its stops named underneath.
 */
export function StageTrack({ at, stops = 5, labels, tint = color.fg, style }: { at: number; stops?: number; labels?: string[]; tint?: string; style?: StyleProp<ViewStyle> }) {
  const n = labels?.length ?? stops;
  const last = n - 1;
  return (
    <View style={style} accessibilityLabel={labels ? `${labels[Math.min(at, last)]}, step ${Math.min(at, last) + 1} of ${n}` : `Stage ${at + 1} of ${n}`}>
      <View style={s.track}>
        <View style={[s.trackLine, { backgroundColor: color.lineStrong }]} />
        <View style={[s.trackLine, { backgroundColor: tint, width: `${(Math.min(Math.max(0, at), last) / last) * 100}%` }]} />
        {Array.from({ length: n }, (_, i) => (
          <View
            key={i}
            style={[
              s.stop,
              { left: `${(i / last) * 100}%` },
              i < at && { backgroundColor: tint },
              i === at && [s.stopHere, { borderColor: tint }],
              i > at && { backgroundColor: color.lineStrong },
            ]}
          />
        ))}
      </View>
      {labels && (
        <View style={s.trackLabels}>
          {labels.map((l, i) => (
            <Text key={l} style={[s.trackLabel, i === at && { color: color.fg }, i === 0 && { textAlign: 'left' }, i === last && { textAlign: 'right' }]}>
              {l.toUpperCase()}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/** One step of the work: a ring with its number, a tick once done, and when it happened. */
export function StepRow({ n, label, time, state }: { n: number; label: string; time?: string; state: 'done' | 'now' | 'later' }) {
  return (
    <View style={s.step} accessibilityLabel={`${label}, ${state === 'done' ? `done ${time ?? ''}` : state === 'now' ? 'now' : 'to do'}`}>
      <View style={[s.ring, state === 'done' && s.ringDone, state === 'now' && s.ringNow]}>
        {state === 'done' ? <Icon name="check" size={14} tint={color.bg} strokeWidth={2.2} /> : <Text style={[s.ringN, state === 'now' && { color: color.fg }]}>{n}</Text>}
      </View>
      <Text style={[s.stepLabel, state === 'later' && { color: color.fgFaint }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[s.stepTime, state === 'now' && { color: color.fg }]}>{state === 'now' ? 'NOW' : (time ?? '--:--')}</Text>
    </View>
  );
}

/** A square action under the work: an icon and a word. */
export function Tile({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [s.tile, (pressed || disabled) && { opacity: disabled ? 0.35 : 0.7 }]}
    >
      <Icon name={icon} size={20} />
      <Text style={s.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A plain button: grey fill, or quiet text. For the second move on a screen. */
export function Plain({ title, onPress, icon, quiet, disabled, flex }: { title: string; onPress: () => void; icon?: IconName; quiet?: boolean; disabled?: boolean; flex?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [s.plain, quiet && s.quiet, flex && { flex: 1 }, (pressed || disabled) && { opacity: disabled ? 0.35 : 0.7 }]}
    >
      {icon && <Icon name={icon} size={17} tint={quiet ? color.fgMuted : color.fg} />}
      <Text style={[s.plainText, quiet && { color: color.fgMuted }]}>{title}</Text>
    </Pressable>
  );
}

export type Verdict = 'pass' | 'fail' | 'n/a';
const verdicts: { key: Verdict; label: string }[] = [
  { key: 'pass', label: 'Pass' },
  { key: 'fail', label: 'Fail' },
  { key: 'n/a', label: 'N/A' },
];

/** Pass, Fail or N/A. 44pt tall so it works with gloves on. */
export function Choice({ value, onChange, label }: { value?: Verdict; onChange: (v: Verdict) => void; label: string }) {
  return (
    <View style={s.choice} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {verdicts.map((v) => {
        const on = value === v.key;
        return (
          <Pressable
            key={v.key}
            onPress={() => {
              tap();
              onChange(v.key);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${label}: ${v.label}`}
            style={[s.choiceItem, on && { backgroundColor: v.key === 'fail' ? color.danger : color.fg }]}
          >
            <Text style={[s.choiceText, on && { color: v.key === 'fail' ? color.fg : color.bg }]}>{v.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const tabs: { to: '/today' | '/week' | '/me'; label: string; icon: IconName }[] = [
  { to: '/today', label: 'Today', icon: 'today' },
  { to: '/week', label: 'Week', icon: 'week' },
  { to: '/me', label: 'Me', icon: 'me' },
];

/** Today, Week and Me along the bottom. */
export function TabBar() {
  const router = useRouter();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.tabs, { paddingBottom: Math.max(insets.bottom, space[3]) }]} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = path === t.to;
        return (
          <Pressable
            key={t.to}
            onPress={() => !on && router.replace(t.to)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            style={({ pressed }) => [s.tab, pressed && { opacity: 0.7 }]}
          >
            <Icon name={t.icon} size={20} tint={on ? color.fg : color.fgFaint} />
            <Text style={[s.tabLabel, on && { color: color.fg }]}>{t.label.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A main move that is only a step forward, so a tap is enough: ember for the one thing that matters now. */
export function Go({ label, onPress, icon, tone = 'ember', disabled }: { label: string; onPress: () => void; icon?: IconName; tone?: 'ember' | 'grey'; disabled?: boolean }) {
  const ink = tone === 'ember' ? color.bg : color.fg;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [s.go, { backgroundColor: tone === 'ember' ? color.ember : color.raised }, (pressed || disabled) && { opacity: disabled ? 0.35 : 0.8 }]}
    >
      {icon && <Icon name={icon} size={18} tint={ink} />}
      <Text style={[s.goText, { color: ink }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

/** A state in a pill: a coloured dot and mono caps. */
export function Chip({ label, tint, onPress, hint }: { label: string; tint: string; onPress?: () => void; hint?: string }) {
  const body = (
    <>
      <View style={[s.dot, { backgroundColor: tint }]} />
      <Text style={s.chipText} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
    </>
  );
  if (!onPress) return <View style={s.chip}>{body}</View>;
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={hint ? `${label}. ${hint}` : label} style={({ pressed }) => [s.chip, pressed && { opacity: 0.7 }]}>
      {body}
    </Pressable>
  );
}

/** A square icon button, for back and close. */
export function IconButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [s.iconButton, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={18} />
    </Pressable>
  );
}

/** Two to four answers side by side in a sunken track; the picked one fills. */
export function Segmented<K extends string>({ options, value, onChange, label, style }: { options: { key: K; label: string }[]; value?: K; onChange: (k: K) => void; label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.seg, style]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              tap();
              onChange(o.key);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${label}: ${o.label}`}
            style={[s.segItem, on && { backgroundColor: color.fg }]}
          >
            <Text style={[s.segText, on && { color: color.bg }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A count with a minus and a plus, 44pt targets. */
export function Stepper({ value, onChange, min = 1, max, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  const step = (by: number) => {
    const next = Math.max(min, max === undefined ? value + by : Math.min(max, value + by));
    if (next !== value) {
      tap();
      onChange(next);
    }
  };
  return (
    <View style={s.stepper} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ now: value, min, max }}>
      <Pressable onPress={() => step(-1)} disabled={value <= min} accessibilityRole="button" accessibilityLabel={`One fewer ${label.toLowerCase()}`} style={({ pressed }) => [s.stepBtn, (pressed || value <= min) && { opacity: value <= min ? 0.35 : 0.7 }]}>
        <Icon name="minus" size={18} />
      </Pressable>
      <Text style={s.stepValue}>{value}</Text>
      <Pressable onPress={() => step(1)} disabled={max !== undefined && value >= max} accessibilityRole="button" accessibilityLabel={`One more ${label.toLowerCase()}`} style={({ pressed }) => [s.stepBtn, (pressed || (max !== undefined && value >= max)) && { opacity: max !== undefined && value >= max ? 0.35 : 0.7 }]}>
        <Icon name="plus" size={18} />
      </Pressable>
    </View>
  );
}

/** One answer in a list of answers. The picked one lifts and fills its ring. */
export function Radio({ label, on, onPress, style }: { label: string; on: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={({ pressed }) => [s.radio, on && { backgroundColor: color.raised }, pressed && { opacity: 0.8 }, style]}
    >
      <View style={[s.radioRing, on && { borderColor: color.fg }]}>{on && <View style={s.radioDot} />}</View>
      <Text style={[s.radioText, !on && { color: color.fgMuted }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A small card with a label and a value. */
export function Stat({ label, value, size = 24, style }: { label: string; value: string; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.stat, style]}>
      <Cap>{label}</Cap>
      <Text style={[s.statValue, { fontSize: size }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/** A label over a list, with an optional note on the right. */
export function Section({ label, right, style }: { label: string; right?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.section, style]}>
      <Cap>{label}</Cap>
      {typeof right === 'string' ? <Cap tint={color.fgFaint}>{right}</Cap> : right}
    </View>
  );
}

/** A row of a list: words on the left, a mono value on the right, a hairline above all but the first. */
export function Line({ left, right, sub, first, onPress, tint, style }: { left: string; right?: ReactNode; sub?: string; first?: boolean; onPress?: () => void; tint?: string; style?: StyleProp<ViewStyle> }) {
  const body = (
    <>
      <View style={{ flex: 1 }}>
        <Text style={s.lineLeft} numberOfLines={2}>
          {left}
        </Text>
        {sub ? <Text style={s.lineSub}>{sub}</Text> : null}
      </View>
      {typeof right === 'string' ? <Text style={[s.lineRight, tint ? { color: tint } : null]}>{right.toUpperCase()}</Text> : right}
    </>
  );
  const st = [s.line, !first && s.lineDivider, style];
  if (!onPress) return <View style={st}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [...st, pressed && { opacity: 0.6 }]}>
      {body}
    </Pressable>
  );
}

const s = StyleSheet.create({
  cap: { fontFamily: font.mono, fontSize: 11, letterSpacing: 1.8 },
  title: { color: color.fg, fontFamily: font.display, letterSpacing: 4 },
  numRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  num: { fontFamily: font.mono, letterSpacing: -1 },
  unit: { color: color.fgMuted, fontFamily: font.mono, fontSize: 14, letterSpacing: 1.6 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], minHeight: 36 },
  topRight: { color: color.fgMuted, fontFamily: font.mono, fontSize: 13, letterSpacing: 1 },
  card: { backgroundColor: color.surface, borderRadius: radius.xl + 2, padding: 18 },
  track: { height: 14, justifyContent: 'center', marginHorizontal: 6 },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  trackLabel: { flex: 1, textAlign: 'center', color: color.fgFaint, fontFamily: font.mono, fontSize: 11, letterSpacing: 1.8 },
  trackLine: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1 },
  stop: { position: 'absolute', width: 9, height: 9, borderRadius: 5, marginLeft: -4.5 },
  stopHere: { width: 14, height: 14, borderRadius: 7, marginLeft: -7, borderWidth: 2.5, backgroundColor: color.bg },
  step: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 50 },
  ring: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: color.raised },
  ringDone: { backgroundColor: color.fgMuted },
  ringNow: { backgroundColor: color.bg, borderWidth: 1.5, borderColor: color.fg },
  ringN: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11 },
  stepLabel: { flex: 1, color: color.fg, fontFamily: font.sans, fontSize: 16 },
  stepTime: { color: color.fgFaint, fontFamily: font.mono, fontSize: 12, letterSpacing: 1 },
  tile: { flex: 1, minHeight: 74, borderRadius: radius.xl, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 6 },
  tileLabel: { color: color.fg, fontFamily: font.sans, fontSize: 13 },
  plain: { minHeight: 52, borderRadius: radius.xl, backgroundColor: color.raised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: space[4] },
  quiet: { backgroundColor: 'transparent', minHeight: 44 },
  plainText: { color: color.fg, fontFamily: font.sansMedium, fontSize: 15 },
  choice: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: radius.lg + 2, backgroundColor: color.inset },
  choiceItem: { minWidth: 48, minHeight: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  choiceText: { color: color.fgMuted, fontFamily: font.mono, fontSize: 12, letterSpacing: 0.6 },
  seg: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: radius.lg + 2, backgroundColor: color.inset },
  segItem: { flex: 1, minHeight: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segText: { color: color.fgMuted, fontFamily: font.sansMedium, fontSize: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 3, borderRadius: radius.lg + 2, backgroundColor: color.inset },
  stepBtn: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: color.raised },
  stepValue: { minWidth: 40, textAlign: 'center', color: color.fg, fontFamily: font.mono, fontSize: 17 },
  tabs: { flexDirection: 'row', paddingTop: space[3], backgroundColor: 'rgba(7,7,7,0.94)' },
  tab: { flex: 1, alignItems: 'center', gap: 6, minHeight: 48, justifyContent: 'center' },
  go: { height: 64, borderRadius: radius.xl + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  goText: { fontFamily: font.display, fontSize: 12, letterSpacing: 2.2, flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, height: 32, borderRadius: 16, backgroundColor: color.raised, flexShrink: 1 },
  chipText: { color: color.fg, fontFamily: font.monoMedium, fontSize: 11, letterSpacing: 1.8 },
  iconButton: { width: 40, height: 40, borderRadius: radius.lg, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 50, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.xl, backgroundColor: color.surface },
  radioRing: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: color.fgFaint, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.fg },
  radioText: { flex: 1, color: color.fg, fontFamily: font.sans, fontSize: 15 },
  stat: { flex: 1, minHeight: 76, borderRadius: radius.xl, backgroundColor: color.surface, padding: 14, gap: 10, justifyContent: 'space-between' },
  statValue: { color: color.fg, fontFamily: font.mono, letterSpacing: -0.3 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingVertical: 12 },
  lineDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.lineStrong },
  lineLeft: { color: color.fg, fontFamily: font.sans, fontSize: 15 },
  lineSub: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, marginTop: 3, letterSpacing: 0.4 },
  lineRight: { color: color.fgMuted, fontFamily: font.mono, fontSize: 12, letterSpacing: 1 },
  tabLabel: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, letterSpacing: 1.8 },
});

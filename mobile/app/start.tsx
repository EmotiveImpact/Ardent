import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Cap, Chip, Line, Plain, Section, TopRow } from '@/components/ardent';
import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { Dock, SyncChip } from '@/components/ui';
import type { DayMode } from '@/data/types';
import { clock, dayDate } from '@/kit/format';
import { certificateState, jobDone, operatorState, toneColor, trade } from '@/kit/states';
import { setMode } from '@/sync/actions';
import { field } from '@/sync/field';
import { nextUp, standing, stateLabel, today, useField, vanStock, waiting } from '@/sync/hooks';
import { color, font, radius, space } from '@/theme/tokens';

/** The three ways to start the day. Set off and arrived take care of en route and on site. */
const MODES: { id: DayMode; label: string; blurb: string; hold: string }[] = [
  { id: 'on_call', label: 'On shift', blurb: 'Ready for work. The clocks start when you set off.', hold: 'Hold to start the day' },
  { id: 'workshop', label: 'Workshop', blurb: 'At the unit or the merchants. The office knows you are off the road.', hold: 'Hold to go to the workshop' },
  { id: 'off_shift', label: 'Off shift', blurb: 'Done for the day. Your jobs stay here to look over.', hold: 'Hold to go off shift' },
];

export default function Start() {
  const router = useRouter();
  const snap = useField();
  const { day, state } = snap;
  const now = day?.operator.state;
  const [mode, setPicked] = useState<DayMode>(now === 'workshop' || now === 'off_shift' ? now : 'on_call');
  const active = MODES.find((m) => m.id === mode)!;
  const jobs = day ? today(day) : [];
  const first = nextUp(jobs);
  const after = jobs.filter((j) => j.id !== first?.id && !jobDone.has(j.status)).slice(0, 3);
  const op = day?.operator;
  const van = day ? vanStock(day) : { rows: [], low: [], lowWords: '' };
  const reg = op?.registrations[0];
  const iso = new Date().toISOString();

  const pick = (next: DayMode) => {
    if (next === mode) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setPicked(next);
  };

  const commit = async () => {
    await setMode(mode).catch(() => undefined);
    await field.startDay();
    router.replace('/today');
  };

  return (
    <View style={styles.root}>
      <Atmosphere state={mode} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.pad}>
          <TopRow
            left={now ? <Chip label={stateLabel(now)} tint={toneColor[operatorState[now].tone]} /> : <View />}
            right={waiting(snap) || state.setAside.length ? <SyncChip /> : `${dayDate(iso).toUpperCase()}   ${clock(iso)}`}
          />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {op && (
            <Animated.View entering={FadeInDown.duration(420)} style={styles.who}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{op.initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>
                  {op.name.toUpperCase()}
                </Text>
                <Text style={styles.sub}>{op.trades.map((t) => trade[t]).join(' and ') || 'Engineer'}</Text>
                {reg && <Cap tint={color.fgFaint} style={{ marginTop: 6 }}>{`${reg.body} ${reg.number}`}</Cap>}
              </View>
            </Animated.View>
          )}

          {op && (
            <>
              <Section label="Kit check" />
              {op.registrations.map((r, i) => {
                const st = certificateState[standing(r.expires)];
                return <Line key={`${r.body}-${r.number}`} first={i === 0} left={`${r.body} card`} right={st.label === 'Valid' ? 'In date' : st.label} tint={st.tone === 'ok' ? color.fgMuted : toneColor[st.tone]} />;
              })}
              <Line first={!op.registrations.length} left="Van" right={op.van || 'None'} />
              {van.rows.length > 0 && <Line left="Van stock" sub={van.low.length ? van.lowWords : `${van.rows.length} parts, none low`} right={van.low.length ? `${van.low.length} low` : 'Stocked'} tint={van.low.length ? color.warn : color.fgMuted} />}
            </>
          )}

          {op && state.shareLocation === undefined && (
            <Animated.View entering={FadeIn.duration(300)}>
              <Card style={styles.ask}>
                <Cap>Share where the van is?</Cap>
                <Text style={styles.askText}>While you're on shift, the office sees where your van is, so an emergency goes to whoever's nearest. Off shift, nothing is shared. You can change this on Me.</Text>
                <View style={styles.askRow}>
                  <Plain flex title="Yes, share it" icon="pin" onPress={() => void field.setShareLocation(true)} />
                  <Plain flex quiet title="Not now" onPress={() => void field.setShareLocation(false)} />
                </View>
              </Card>
            </Animated.View>
          )}

          {first ? (
            <Animated.View entering={FadeInDown.delay(80).duration(420)}>
              <Card style={styles.first}>
                <View style={styles.firstTop}>
                  <Cap>{jobs.some((j) => jobDone.has(j.status)) ? 'Next up' : 'First up'}</Cap>
                  <Cap>{first.ref}</Cap>
                </View>
                <View style={styles.firstRow}>
                  <Text style={styles.firstTime}>{clock(first.start)}</Text>
                  <Text style={styles.firstTitle} numberOfLines={2}>
                    {first.title}
                  </Text>
                </View>
                {first.site && (
                  <Text style={styles.addr}>
                    {first.site.line1}, {first.site.postcode}
                  </Text>
                )}
              </Card>
              {after.map((j) => (
                <View key={j.id} style={styles.after}>
                  <Text style={styles.afterTime}>{clock(j.start)}</Text>
                  <Text style={styles.afterTitle} numberOfLines={1}>
                    {j.title}
                  </Text>
                  <Text style={styles.afterTime}>{j.site?.postcode.split(' ')[0]}</Text>
                </View>
              ))}
            </Animated.View>
          ) : (
            <Text style={[styles.sub, { marginTop: 24 }]}>Nothing booked for you today.</Text>
          )}

          <Section label="Start as" />
          <View style={styles.modes} accessibilityRole="radiogroup">
            {MODES.map((m) => (
              <Pressable key={m.id} onPress={() => pick(m.id)} accessibilityRole="radio" accessibilityState={{ checked: m.id === mode }} style={[styles.mode, m.id === mode && styles.modeOn]}>
                <Text style={[styles.modeText, m.id === mode && { color: color.bg }]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
          <Animated.Text key={mode} entering={FadeIn.duration(260)} style={styles.blurb}>
            {active.blurb}
          </Animated.Text>
        </ScrollView>

        <Dock>
          <HoldToCommit label={active.hold} icon="arrow" onCommit={commit} />
        </Dock>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  ask: { marginTop: 14, gap: 10 },
  askText: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20 },
  askRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  root: { flex: 1, backgroundColor: color.bg },
  pad: { paddingHorizontal: 22, paddingTop: space[3] },
  scroll: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: space[6] },
  who: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  badge: { width: 64, height: 64, borderRadius: radius.xl, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: color.fg, fontFamily: font.display, fontSize: 18, letterSpacing: 2 },
  name: { color: color.fg, fontFamily: font.display, fontSize: 20, letterSpacing: 3 },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, marginTop: 6 },
  first: { marginTop: 24, gap: 12 },
  firstTop: { flexDirection: 'row', justifyContent: 'space-between' },
  firstRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  firstTime: { color: color.fg, fontFamily: font.mono, fontSize: 32, letterSpacing: -0.5 },
  firstTitle: { flex: 1, color: color.fg, fontFamily: font.sansMedium, fontSize: 16 },
  addr: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14 },
  after: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, paddingHorizontal: 2 },
  afterTime: { color: color.fgFaint, fontFamily: font.mono, fontSize: 13 },
  afterTitle: { flex: 1, color: color.fgMuted, fontFamily: font.sans, fontSize: 15 },
  modes: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: radius.lg + 2, backgroundColor: color.inset },
  mode: { flex: 1, minHeight: 46, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  modeOn: { backgroundColor: color.fg },
  modeText: { color: color.fgMuted, fontFamily: font.sansMedium, fontSize: 14 },
  blurb: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, lineHeight: 18, marginTop: 10 },
});

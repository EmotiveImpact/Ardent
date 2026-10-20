import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { SyncChip } from '@/components/ui';
import type { DayMode } from '@/data/types';
import { dayDate } from '@/kit/format';
import { jobDone } from '@/kit/states';
import { setMode } from '@/sync/actions';
import { field } from '@/sync/field';
import { today, useField } from '@/sync/hooks';
import { color, font, space, tracking } from '@/theme/tokens';

/** The three ways to start the day. Set off and arrived take care of en route and on site. */
const MODES: { id: DayMode; label: string; blurb: string; hold: string }[] = [
  {
    id: 'on_call',
    label: 'On shift',
    blurb: 'Ready for work. Your run sheet with the next job up top, and the clocks start when you set off.',
    hold: 'Hold to go on shift',
  },
  {
    id: 'workshop',
    label: 'Workshop',
    blurb: 'At the unit or the merchants. Your jobs stay in reach and the office knows you are off the road.',
    hold: 'Hold to go to the workshop',
  },
  {
    id: 'off_shift',
    label: 'Off shift',
    blurb: 'Done for the day. The office sees you are off, and your jobs are still here to look over.',
    hold: 'Hold to go off shift',
  },
];

// How the other modes fade away beneath the one picked.
const FADE = [0.62, 0.32];

export default function Start() {
  const router = useRouter();
  const { day } = useField();
  const now = day?.operator.state;
  const [mode, setPicked] = useState<DayMode>(now === 'workshop' || now === 'off_shift' ? now : 'on_call');
  const active = MODES.find((m) => m.id === mode)!;
  const jobs = day ? today(day) : [];

  const queue = useMemo(() => {
    const i = MODES.findIndex((m) => m.id === mode);
    return [...MODES.slice(i + 1), ...MODES.slice(0, i)];
  }, [mode]);

  const pick = (next: DayMode) => {
    if (next === mode) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setPicked(next);
  };

  // Swipe up for the next mode, down for the one before.
  const step = useRef((_: 1 | -1) => {});
  step.current = (dir) => {
    const i = MODES.findIndex((m) => m.id === mode);
    pick(MODES[(i + dir + MODES.length) % MODES.length].id);
  };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 14 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderRelease: (_, g) => {
          if (g.dy < -40) step.current(1);
          else if (g.dy > 40) step.current(-1);
        },
      }),
    [],
  );

  const commit = async () => {
    await setMode(mode).catch(() => undefined);
    await field.startDay();
    router.replace('/today');
  };

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <Atmosphere state={mode} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View entering={FadeIn.duration(700)} style={styles.top}>
          <Text style={styles.readout}>{dayDate(new Date().toISOString())}</Text>
          <Text style={styles.readout}>
            {jobs.filter((j) => jobDone.has(j.status)).length}/{jobs.length} jobs
          </Text>
          <SyncChip />
        </Animated.View>

        <Text style={styles.wordmark}>ARDENT</Text>

        <View style={styles.stage}>
          <Animated.View key={active.id} entering={FadeInDown.duration(460)} style={styles.activeBlock}>
            <Text style={styles.activeLabel}>{active.label.toUpperCase()}</Text>
            <Text style={styles.blurb}>{active.blurb}</Text>
          </Animated.View>

          <View style={styles.queue}>
            {queue.map((m, i) => (
              <Animated.View key={m.id} layout={LinearTransition.duration(380)}>
                <Pressable onPress={() => pick(m.id)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Pick ${m.label}`}>
                  <Text style={[styles.queueLabel, { opacity: FADE[i] ?? 0.2 }]}>{m.label.toUpperCase()}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </View>

        <HoldToCommit label={active.hold} onCommit={commit} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1, paddingHorizontal: space[6] },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], paddingTop: space[3] },
  readout: { color: color.fgMuted, fontFamily: font.monoMedium, fontSize: 11, letterSpacing: 0.3 },
  wordmark: { marginTop: space[6], color: color.fgFaint, fontFamily: font.display, fontSize: 10, letterSpacing: tracking.label * 2 },
  stage: { flex: 1, justifyContent: 'flex-end', paddingBottom: space[10] },
  activeBlock: { marginBottom: space[6] },
  activeLabel: { color: color.fg, fontFamily: font.display, fontSize: 30, letterSpacing: tracking.display },
  blurb: { marginTop: space[2], maxWidth: 290, color: color.fgMuted, fontFamily: font.sans, fontSize: 13, lineHeight: 18 },
  queue: { gap: space[1], paddingLeft: space[6] },
  queueLabel: { color: color.fg, fontFamily: font.display, fontSize: 19, letterSpacing: tracking.display, paddingVertical: 2 },
});

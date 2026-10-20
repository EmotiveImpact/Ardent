import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Atmosphere } from '@/components/Atmosphere';
import { HoldToEnter } from '@/components/HoldToEnter';
import { Readout } from '@/components/Readout';
import { MODES, modeById } from '@/data/modes';
import type { OperatorMode } from '@/data/types';
import { pounds } from '@/format';
import { useOperator } from '@/state/operator';
import { color, font, space, tracking } from '@/theme/tokens';

// How the queue of other modes fades away beneath the active one.
const FADE = [0.92, 0.7, 0.46, 0.26];

export default function Opening() {
  const router = useRouter();
  const { mode, setMode, summary } = useOperator();
  const active = modeById(mode);

  const queue = useMemo(() => {
    const i = MODES.findIndex((m) => m.id === mode);
    return [...MODES.slice(i + 1), ...MODES.slice(0, i)];
  }, [mode]);

  const pick = (next: OperatorMode) => {
    if (next === mode) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setMode(next);
  };

  // Swipe up for the next mode, down for the previous one.
  const step = useRef((dir: 1 | -1) => {});
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

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <Atmosphere mode={mode} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View entering={FadeIn.duration(700)} style={styles.readouts}>
          <Readout glyph="jobs" value={summary ? `${summary.jobsDone}/${summary.jobsToday} jobs` : '–'} />
          <Readout glyph="quotes" value={summary ? `${summary.quotesOpen} ${summary.quotesOpen === 1 ? 'quote' : 'quotes'}` : '–'} />
          <Readout glyph="owed" value={summary ? `${pounds(summary.owedPence)} owed` : '–'} />
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
                <Pressable onPress={() => pick(m.id)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Switch to ${m.label}`}>
                  <Text style={[styles.queueLabel, { opacity: FADE[i] ?? 0.2 }]}>{m.label.toUpperCase()}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </View>

        <HoldToEnter label={`HOLD TO GO ${active.label.toUpperCase()}`} onEnter={() => router.push('/today')} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  safe: { flex: 1, paddingHorizontal: space[6] },
  readouts: { flexDirection: 'row', justifyContent: 'center', gap: space[4], paddingTop: space[3] },
  wordmark: {
    marginTop: space[6],
    color: color.fgFaint,
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: tracking.label * 2,
  },
  stage: { flex: 1, justifyContent: 'flex-end', paddingBottom: space[8] },
  activeBlock: { marginBottom: space[6] },
  activeLabel: { color: color.fg, fontFamily: font.display, fontSize: 30, letterSpacing: tracking.display },
  blurb: {
    marginTop: space[2],
    maxWidth: 270,
    color: color.fgMuted,
    fontFamily: font.sans,
    fontSize: 12.5,
    lineHeight: 17,
  },
  queue: { gap: space[1] },
  queueLabel: { color: color.fg, fontFamily: font.display, fontSize: 19, letterSpacing: tracking.display, paddingVertical: 2 },
});

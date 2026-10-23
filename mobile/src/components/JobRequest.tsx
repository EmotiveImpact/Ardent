// A job request from the office, over whatever screen is open: what the job is,
// how far, the time left to answer, hold to accept, or decline with a reason.
// No customer name or door number until the engineer says yes.
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Cap, Plain, Segmented } from '@/components/ardent';
import { HoldToCommit } from '@/components/HoldToCommit';
import type { DeclineReason, JobRequest as Request } from '@/data/types';
import { clock, ukDay } from '@/kit/format';
import { priority, toneColor, trade } from '@/kit/states';
import { useNow } from '@/sync/hooks';
import { answer, DECLINE_REASONS, secondsLeft, useOffers } from '@/sync/requests';
import { color, font, radius, space } from '@/theme/tokens';

const RING = 132;
const STROKE = 6;

function Countdown({ left, of }: { left: number; of: number }) {
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const low = left <= 10;
  return (
    <View style={styles.ring} accessibilityRole="timer" accessibilityLabel={`${left} seconds left to answer`}>
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={color.raised} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={low ? color.warn : color.fg}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - left / Math.max(1, of))}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <Text style={[styles.secs, low && { color: color.warn }]}>{left}</Text>
      <Cap tint={color.fgFaint}>seconds</Cap>
    </View>
  );
}

const when = (req: Request, now: number) => {
  const d = ukDay(req.brief.start);
  const day = d === ukDay(new Date(now).toISOString()) ? 'Today' : new Date(req.brief.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  return `${day}, ${clock(req.brief.start)} to ${clock(req.brief.end)}`;
};

function Sheet({ req }: { req: Request }) {
  const router = useRouter();
  const now = useNow(true, 250);
  const left = secondsLeft(req, now);
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState<DeclineReason>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [won, setWon] = useState(false);
  const mine = req.offers[0];
  const flag = priority[req.brief.priority];
  const away = [mine?.minutes !== undefined ? `${mine.minutes} min` : undefined, mine?.miles !== undefined ? `${mine.miles} mi` : undefined].filter(Boolean).join(', ');

  // A buzz when it lands, so it's noticed in a pocket.
  useEffect(() => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [req.id]);

  const accept = async () => {
    setBusy(true);
    try {
      await answer(req, 'accept');
      setWon(true);
      setTimeout(() => router.push({ pathname: '/job/[id]', params: { id: req.jobId } }), 900);
    } catch (e) {
      setNote((e as Error).message);
      setBusy(false);
    }
  };
  const decline = async () => {
    setBusy(true);
    await answer(req, 'decline', why).catch(() => undefined);
  };

  if (won) {
    return (
      <Animated.View entering={FadeIn.duration(200)} style={styles.won}>
        <Cap tint={color.ember}>It's yours</Cap>
        <Text style={styles.title}>{req.brief.title}</Text>
        <Text style={styles.sub}>{req.brief.ref} is on your day. Opening it now.</Text>
      </Animated.View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      <View style={styles.pad}>
        <Animated.View entering={FadeInDown.duration(320)} style={styles.head}>
          <Cap>Job request</Cap>
          <Cap tint={toneColor[flag.tone]}>{flag.label}</Cap>
        </Animated.View>

        <View style={styles.middle}>
          <Countdown left={left} of={req.wait} />
          <Text style={styles.title}>{req.brief.title}</Text>
          <Text style={styles.sub}>
            {trade[req.brief.trade]}, {req.brief.area}
          </Text>
          <View style={styles.facts}>
            <View style={styles.fact}>
              <Cap tint={color.fgFaint}>When</Cap>
              <Text style={styles.factValue}>{when(req, now)}</Text>
            </View>
            {away ? (
              <View style={styles.fact}>
                <Cap tint={color.fgFaint}>From you</Cap>
                <Text style={styles.factValue}>{away}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.hint}>
            {req.mode === 'all' ? 'Sent to more than one engineer. First to accept gets it.' : 'Offered to you first. If you pass, it goes to the next nearest.'} The address and customer show once it's yours.
          </Text>
          {note && <Text style={[styles.hint, { color: toneColor.danger }]}>{note}</Text>}
        </View>

        {declining ? (
          <View style={{ gap: 10 }}>
            <Segmented label="Why not" options={DECLINE_REASONS} value={why} onChange={setWhy} />
            <View style={styles.pair}>
              <Plain title="Back" quiet onPress={() => setDeclining(false)} flex />
              <Plain title={busy ? 'One moment' : 'Decline'} onPress={() => void decline()} disabled={busy} flex />
            </View>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <HoldToCommit label={busy ? 'One moment' : 'Hold to accept'} icon="check" onCommit={() => void accept()} disabled={busy || left === 0} />
            <Plain title="Decline" quiet onPress={() => setDeclining(true)} disabled={busy} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

/** Shown over everything while an offer is live. */
export function JobRequestOverlay() {
  const offers = useOffers();
  const now = useNow(offers.length > 0, 1000);
  const live = offers.find((o) => secondsLeft(o, now) > 0);
  if (!live) return null;
  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Sheet key={live.id} req={live} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.bg, zIndex: 50 },
  pad: { flex: 1, paddingHorizontal: 22, paddingTop: space[3], paddingBottom: space[4] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 },
  middle: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6 },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  secs: { color: color.fg, fontFamily: font.mono, fontSize: 44, letterSpacing: -1, lineHeight: 50 },
  title: { color: color.fg, fontFamily: font.sansMedium, fontSize: 22, lineHeight: 28, textAlign: 'center' },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 15, textAlign: 'center' },
  facts: { flexDirection: 'row', gap: 8, marginTop: 18, alignSelf: 'stretch' },
  fact: { flex: 1, backgroundColor: color.surface, borderRadius: radius.lg, padding: 14, gap: 6 },
  factValue: { color: color.fg, fontFamily: font.mono, fontSize: 14 },
  hint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 14, paddingHorizontal: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  won: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, backgroundColor: color.bg },
});

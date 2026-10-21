import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Cap, Num, OpTitle, Section, TabBar, TopRow } from '@/components/ardent';
import { Atmosphere } from '@/components/Atmosphere';
import { ModeChip, SyncChip } from '@/components/ui';
import type { Day, Job } from '@/data/types';
import { clock, duration, shortDate, ukDay } from '@/kit/format';
import { jobDone } from '@/kit/states';
import { field } from '@/sync/field';
import { card, elapsed, useField, useNow, waiting } from '@/sync/hooks';
import { color, font, radius, space } from '@/theme/tokens';

const DAY_MS = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const noon = (d: string) => `${d}T12:00:00Z`;
const weekday = (d: string) => new Date(noon(d)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
const dateNo = (d: string) => String(Number(d.slice(8)));
const hoursOf = (jobs: Job[]) => jobs.reduce((ms, j) => ms + Math.max(0, Date.parse(j.end) - Date.parse(j.start)), 0);
const short = (ms: number) => {
  const h = ms / 3_600_000;
  return h ? `${Number.isInteger(h) ? h : h.toFixed(1)}h` : '--';
};
/** A ten-hour day as ten bars. */
const BARS = 10;

function DayRow({ d, jobs, isToday, past, open, onToggle, day }: { d: string; jobs: Job[]; isToday: boolean; past: boolean; open: boolean; onToggle: () => void; day: Day }) {
  const router = useRouter();
  const ms = hoursOf(jobs);
  const lit = Math.min(BARS, Math.round(ms / 3_600_000));
  const on = isToday ? color.fg : past ? color.fgFaint : color.fgMuted;
  return (
    <View style={[styles.day, isToday && styles.dayToday]}>
      <Pressable onPress={onToggle} disabled={!jobs.length} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${weekday(d)} ${dateNo(d)}, ${jobs.length ? `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}, ${short(ms)} booked` : 'free'}`}>
        <View style={styles.dayTop}>
          <View style={styles.dayName}>
            <Text style={[styles.dayText, !isToday && { color: past ? color.fgFaint : color.fgMuted }]}>{weekday(d)}</Text>
            <Text style={[styles.dayText, !isToday && { color: past ? color.fgFaint : color.fgMuted }]}>{dateNo(d)}</Text>
          </View>
          <Text style={[styles.refs, isToday && { color: color.fgMuted }]} numberOfLines={1}>
            {jobs.length ? jobs.map((j) => j.ref).join('  ') : 'FREE'}
          </Text>
          <Text style={[styles.hours, !ms && { color: color.fgFaint }]}>{short(ms)}</Text>
        </View>
        <View style={styles.bars}>
          {Array.from({ length: BARS }, (_, i) => (
            <View key={i} style={[styles.bar, { backgroundColor: i < lit ? on : color.raised }]} />
          ))}
        </View>
      </Pressable>
      {open && (
        <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: 6 }}>
          {jobs.map((j) => {
            const c = card(day, j);
            return (
              <Pressable
                key={j.id}
                onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.job, pressed && { opacity: 0.6 }, jobDone.has(j.status) && { opacity: 0.45 }]}
              >
                <Text style={styles.jobTime}>{clock(j.start)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobTitle} numberOfLines={1}>
                    {j.title}
                  </Text>
                  <Text style={styles.jobAddr} numberOfLines={1}>
                    {[c.customer?.name, c.site?.postcode].filter(Boolean).join(', ')}
                  </Text>
                </View>
                <Text style={styles.jobRef}>{j.ref}</Text>
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

/** My week: each day's booked hours as bars, tap a day for its jobs. */
export default function Week() {
  const snap = useField();
  const { state, day } = snap;
  const now = useNow(!!day?.time.some((t) => !t.end), 30_000);
  const [open, setOpen] = useState<string>();
  if (!day) return <View style={styles.root} />;

  const today = ukDay(new Date(now).toISOString());
  const monday = addDays(today, -((new Date(noon(today)).getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const next = Array.from({ length: 7 }, (_, i) => addDays(monday, i + 7));
  const live = day.jobs.filter((j) => j.status !== 'cancelled');
  const on = (d: string) => live.filter((j) => ukDay(j.start) === d).sort((a, b) => a.start.localeCompare(b.start));
  const thisWeek = live.filter((j) => week.includes(ukDay(j.start)));
  const clocked = day.time.filter((t) => week.includes(ukDay(t.start)));
  const held = waiting(snap) > 0 || state.setAside.length > 0;
  const nextHas = next.some((d) => on(d).length);

  const rows = (days: string[]) =>
    days.map((d, i) => (
      <Animated.View key={d} entering={FadeInDown.delay(60 + i * 35).duration(380)}>
        <DayRow d={d} day={day} jobs={on(d)} isToday={d === today} past={d < today} open={open === d} onToggle={() => setOpen((o) => (o === d ? undefined : d))} />
      </Animated.View>
    ));

  return (
    <View style={styles.root}>
      <Atmosphere state={day.operator.state} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.pad}>
          <TopRow left={<ModeChip state={day.operator.state} />} right={held ? <SyncChip /> : `${shortDate(noon(monday)).toUpperCase()} TO ${shortDate(noon(week[6])).toUpperCase()}`} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={state.loading} onRefresh={() => void field.refresh()} tintColor={color.fgMuted} />}
        >
          <Animated.View entering={FadeInDown.duration(420)}>
            <OpTitle>Week</OpTitle>
          </Animated.View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Cap>Booked</Cap>
              <Num size={26}>{short(hoursOf(thisWeek))}</Num>
            </View>
            <View style={styles.stat}>
              <Cap>Jobs</Cap>
              <Num size={26}>{thisWeek.length}</Num>
            </View>
            <View style={styles.stat}>
              <Cap>On the tools</Cap>
              <Num size={26}>{duration(elapsed(clocked, 'labour', now)).replace(' ', '')}</Num>
            </View>
          </View>

          <View style={{ marginTop: 18 }}>{rows(week)}</View>

          {nextHas && (
            <>
              <Section label="Next week" />
              {rows(next)}
            </>
          )}
        </ScrollView>
        <TabBar />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  pad: { paddingHorizontal: 22, paddingTop: space[3] },
  scroll: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: space[8] },
  stats: { flexDirection: 'row', marginTop: 22 },
  stat: { flex: 1, gap: 8 },
  day: { paddingVertical: 14, paddingHorizontal: 14, marginHorizontal: -14, borderRadius: radius.xl },
  dayToday: { backgroundColor: color.surface },
  dayTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  dayName: { width: 62 },
  dayText: { color: color.fg, fontFamily: font.display, fontSize: 12, letterSpacing: 2, lineHeight: 17 },
  refs: { flex: 1, color: color.fgFaint, fontFamily: font.mono, fontSize: 12, letterSpacing: 0.6, marginTop: 2 },
  hours: { color: color.fg, fontFamily: font.mono, fontSize: 14, marginTop: 1 },
  bars: { flexDirection: 'row', gap: 4, marginTop: 10 },
  bar: { flex: 1, height: 4, borderRadius: 1 },
  job: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingVertical: 8 },
  jobTime: { color: color.fgMuted, fontFamily: font.mono, fontSize: 13, width: 46 },
  jobTitle: { color: color.fg, fontFamily: font.sans, fontSize: 15 },
  jobAddr: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, marginTop: 3 },
  jobRef: { color: color.fgFaint, fontFamily: font.mono, fontSize: 12 },
});

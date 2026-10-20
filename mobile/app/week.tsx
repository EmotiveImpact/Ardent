import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Atmosphere } from '@/components/Atmosphere';
import { Avatar, Label, ModeChip, Panel, Row, StateText, SyncChip } from '@/components/ui';
import { clock, dayDate, duration, ukDay } from '@/kit/format';
import { jobDone, jobStatus } from '@/kit/states';
import { field } from '@/sync/field';
import { card, elapsed, useField, useNow } from '@/sync/hooks';
import { color, font, radius, space, tracking } from '@/theme/tokens';

const DAY_MS = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const noon = (d: string) => `${d}T12:00:00Z`;

/** My week: what's coming up, and the hours booked against jobs. */
export default function Week() {
  const router = useRouter();
  const { state, day } = useField();
  const now = useNow(!!day?.time.some((t) => !t.end), 30_000);
  if (!day) return <View style={styles.root} />;

  const today = ukDay(new Date(now).toISOString());
  const monday = addDays(today, -((new Date(noon(today)).getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const ahead = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const live = day.jobs.filter((j) => j.status !== 'cancelled');
  const thisWeek = day.time.filter((t) => week.includes(ukDay(t.start)));
  const booked = live.filter((j) => week.includes(ukDay(j.start))).reduce((ms, j) => ms + Math.max(0, Date.parse(j.end) - Date.parse(j.start)), 0);

  return (
    <View style={styles.root}>
      <Atmosphere state={day.operator.state} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <ModeChip state={day.operator.state} />
          <SyncChip />
          <Avatar initials={day.operator.initials} onPress={() => router.push('/me')} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={state.loading} onRefresh={() => void field.refresh()} tintColor={color.fgMuted} />}
        >
          <Animated.View entering={FadeInDown.duration(420)}>
            <Text style={styles.hello}>
              Week of <Text style={styles.mono}>{dayDate(noon(monday))}</Text>
            </Text>
            <View style={styles.tabs}>
              <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Today">
                <Text style={styles.tabFaint}>TODAY</Text>
              </Pressable>
              <Text style={styles.headline}>WEEK</Text>
            </View>
          </Animated.View>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{duration(elapsed(thisWeek, 'labour', now))}</Text>
              <Text style={styles.statLabel}>On the tools</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{duration(elapsed(thisWeek, 'travel', now))}</Text>
              <Text style={styles.statLabel}>Travel</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{duration(booked)}</Text>
              <Text style={styles.statLabel}>Booked in</Text>
            </View>
          </View>
          <Text style={styles.hint}>Time from your clocks this week, Monday to Sunday. Booked in is the job windows the office gave you.</Text>

          <Label style={styles.section}>Coming up</Label>
          {ahead.map((d, di) => {
            const jobs = live.filter((j) => ukDay(j.start) === d).sort((a, b) => a.start.localeCompare(b.start));
            return (
              <Animated.View key={d} entering={FadeInDown.delay(80 + di * 45).duration(400)} style={{ marginBottom: space[4] }}>
                <View style={styles.dayHead}>
                  <Text style={[styles.dayName, d === today && { color: color.fg }]}>{d === today ? 'Today' : dayDate(noon(d))}</Text>
                  <Text style={styles.dayCount}>{jobs.length ? `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}` : ''}</Text>
                </View>
                {jobs.length ? (
                  <Panel>
                    {jobs.map((j, i) => {
                      const c = card(day, j);
                      const s = jobStatus[j.status];
                      return (
                        <Row key={j.id} first={i === 0} onPress={() => router.push({ pathname: '/job/[id]', params: { id: j.id } })} style={jobDone.has(j.status) ? { opacity: 0.42 } : undefined}>
                          <Text style={styles.time}>{clock(j.start)}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.title} numberOfLines={1}>
                              {j.title}
                            </Text>
                            <Text style={styles.addr} numberOfLines={1}>
                              {c.customer?.name}
                              {c.site ? ` · ${c.site.postcode}` : ''}
                            </Text>
                          </View>
                          <StateText label={s.label} tone={s.tone} size={11} />
                        </Row>
                      );
                    })}
                  </Panel>
                ) : (
                  <Text style={styles.nothing}>Nothing booked</Text>
                )}
              </Animated.View>
            );
          })}

          <Label style={styles.section}>This week by day</Label>
          <Panel>
            {week.map((d, i) => {
              const t = thisWeek.filter((x) => ukDay(x.start) === d);
              const ms = elapsed(t, 'all', now);
              return (
                <Row key={d} first={i === 0}>
                  <Text style={[styles.weekDay, d === today && { color: color.fg }]}>{dayDate(noon(d))}</Text>
                  <Text style={[styles.weekHours, !ms && { color: color.fgFaint }]}>{ms ? duration(ms) : 'None'}</Text>
                </Row>
              );
            })}
          </Panel>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], paddingHorizontal: space[6], paddingTop: space[2] },
  scroll: { paddingHorizontal: space[6], paddingTop: space[8], paddingBottom: space[12] },
  hello: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14 },
  mono: { fontFamily: font.mono },
  tabs: { flexDirection: 'row', alignItems: 'baseline', gap: space[5], marginTop: space[1] },
  headline: { color: color.fg, fontFamily: font.display, fontSize: 34, letterSpacing: tracking.display },
  tabFaint: { color: color.fgFaint, fontFamily: font.display, fontSize: 16, letterSpacing: tracking.display },
  stats: { flexDirection: 'row', marginTop: space[6], paddingVertical: space[4], paddingHorizontal: space[4], borderRadius: radius.xl, backgroundColor: color.inset },
  stat: { flex: 1 },
  statValue: { color: color.fg, fontFamily: font.monoMedium, fontSize: 18 },
  statLabel: { color: color.fgFaint, fontFamily: font.sansMedium, fontSize: 11, marginTop: 4, letterSpacing: 0.4 },
  hint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 12, lineHeight: 17, marginTop: space[2] },
  section: { marginTop: space[8], marginBottom: space[3] },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space[2] },
  dayName: { color: color.fgMuted, fontFamily: font.monoMedium, fontSize: 12 },
  dayCount: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11 },
  nothing: { color: color.fgFaint, fontFamily: font.sans, fontSize: 12 },
  time: { color: color.fg, fontFamily: font.monoMedium, fontSize: 12, width: 44 },
  title: { color: color.fg, fontFamily: font.sansSemi, fontSize: 14 },
  addr: { color: color.fgMuted, fontFamily: font.sans, fontSize: 12, marginTop: 2 },
  weekDay: { flex: 1, color: color.fgMuted, fontFamily: font.mono, fontSize: 12 },
  weekHours: { color: color.fg, fontFamily: font.mono, fontSize: 12 },
});

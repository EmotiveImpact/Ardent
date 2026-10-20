import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Action } from '@/components/Action';
import { Atmosphere } from '@/components/Atmosphere';
import { Avatar, Dock, Label, ModeChip, StateText, SyncChip } from '@/components/ui';
import type { JobCard } from '@/data/types';
import { copy } from '@/kit/copy';
import { clock, duration, longDate, relative } from '@/kit/format';
import { jobDone, jobStatus, priority } from '@/kit/states';
import { setOff } from '@/sync/actions';
import { field } from '@/sync/field';
import { elapsed, nextUp, today, useField, useNow } from '@/sync/hooks';
import { color, font, glass, radius, space, toneColor, tracking } from '@/theme/tokens';

function greeting() {
  const h = Number(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' }).slice(0, 2));
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Flag({ job }: { job: JobCard }) {
  if (job.priority !== 'emergency' && job.priority !== 'high') return null;
  const p = priority[job.priority];
  return <Text style={[styles.flag, { color: toneColor[p.tone] }]}>{p.label.toUpperCase()}</Text>;
}

function JobRow({ job, index, big }: { job: JobCard; index: number; big?: boolean }) {
  const router = useRouter();
  const s = jobStatus[job.status];
  const done = jobDone.has(job.status);
  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 45).duration(400)}>
      <Pressable
        onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${job.ref}, ${job.title}, ${s.label}`}
        style={({ pressed }) => [styles.job, big && styles.jobBig, pressed && styles.jobPressed, done && { opacity: 0.42 }]}
      >
        <View style={styles.jobTime}>
          <Text style={[styles.time, big && { fontSize: 15 }]}>{clock(job.start)}</Text>
          <Text style={styles.timeEnd}>{clock(job.end)}</Text>
        </View>
        <View style={styles.jobBody}>
          <View style={styles.jobTop}>
            <Text style={styles.ref}>{job.ref}</Text>
            <Flag job={job} />
          </View>
          <Text style={[styles.title, big && { fontSize: 17 }]}>{job.title}</Text>
          {job.customer && job.site && (
            <Text style={styles.addr}>
              {job.customer.name} · {job.site.line1}, <Text style={styles.postcode}>{job.site.postcode}</Text>
            </Text>
          )}
        </View>
        <View style={styles.statusWrap}>
          <StateText label={s.label} tone={s.tone} size={11} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function Today() {
  const router = useRouter();
  const { state, day } = useField();
  const now = useNow(!!day?.time.some((t) => !t.end), 30_000);

  if (!day) {
    return (
      <View style={styles.root}>
        <Atmosphere state="on_call" />
        <SafeAreaView style={styles.empty}>
          <Text style={styles.headline}>TODAY</Text>
          <Text style={styles.hello}>
            {state.loading ? 'Getting your day from the office.' : state.loadError ? `${state.loadError}. Pull down to try again.` : "Your day isn't on this phone yet. It comes down the next time there's signal."}
          </Text>
          <View style={{ marginTop: space[6], alignSelf: 'flex-start' }}>
            <Action title="Try again" onPress={() => void field.refresh()} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const jobs = today(day, now);
  const next = nextUp(jobs);
  const rest = jobs.filter((j) => j.id !== next?.id);
  const done = jobs.filter((j) => jobDone.has(j.status)).length;
  const todayTime = day.time.filter((t) => jobs.some((j) => j.id === t.jobId));
  const first = day.operator.name.split(' ')[0];

  const primary = () => {
    if (!next) return null;
    if (next.status === 'booked')
      return (
        <Action
          title={`${copy.setOff} for ${next.ref}`}
          tone="ember"
          onPress={async () => {
            await setOff(next);
            router.push({ pathname: '/job/[id]', params: { id: next.id } });
          }}
        />
      );
    return <Action title={`Open ${next.ref}`} tone="ember" onPress={() => router.push({ pathname: '/job/[id]', params: { id: next.id } })} />;
  };

  return (
    <View style={styles.root}>
      <Atmosphere state={day.operator.state} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
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
              {greeting()}, {first}. {longDate(new Date(now).toISOString())}
            </Text>
            <View style={styles.tabs}>
              <Text style={styles.headline}>TODAY</Text>
              <Pressable onPress={() => router.push('/week')} hitSlop={10} accessibilityRole="button" accessibilityLabel="My week">
                <Text style={styles.tabFaint}>WEEK</Text>
              </Pressable>
            </View>
          </Animated.View>

          <View style={styles.stats}>
            <Stat value={`${done}/${jobs.length}`} label="Jobs done" />
            <Stat value={duration(elapsed(todayTime, 'labour', now))} label="On the tools" />
            <Stat value={duration(elapsed(todayTime, 'travel', now))} label="Travel" />
          </View>

          {next ? (
            <>
              <View style={styles.sectionRow}>
                <Label>Next up</Label>
                {next.status === 'booked' && <Text style={styles.when}>Due {relative(next.start, now)}</Text>}
              </View>
              <JobRow job={next} index={0} big />
            </>
          ) : (
            <Text style={styles.nothing}>{jobs.length ? 'That’s everything booked for today.' : 'Nothing booked for you today.'}</Text>
          )}

          {rest.length > 0 && (
            <>
              <Label style={styles.section}>Run sheet</Label>
              {rest.map((j, i) => (
                <JobRow key={j.id} job={j} index={i + 1} />
              ))}
            </>
          )}
        </ScrollView>

        {next && <Dock>{primary()}</Dock>}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  empty: { flex: 1, padding: space[6], justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], paddingHorizontal: space[6], paddingTop: space[2] },
  scroll: { paddingHorizontal: space[6], paddingTop: space[8], paddingBottom: space[8] },
  hello: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20 },
  tabs: { flexDirection: 'row', alignItems: 'baseline', gap: space[5], marginTop: space[1] },
  headline: { color: color.fg, fontFamily: font.display, fontSize: 34, letterSpacing: tracking.display },
  tabFaint: { color: color.fgFaint, fontFamily: font.display, fontSize: 16, letterSpacing: tracking.display },
  stats: { flexDirection: 'row', marginTop: space[6], paddingVertical: space[4], paddingHorizontal: space[4], borderRadius: radius.xl, backgroundColor: color.inset },
  stat: { flex: 1 },
  statValue: { color: color.fg, fontFamily: font.monoMedium, fontSize: 18 },
  statLabel: { color: color.fgFaint, fontFamily: font.sansMedium, fontSize: 11, marginTop: 4, letterSpacing: 0.4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space[8], marginBottom: space[3] },
  when: { color: color.fgMuted, fontFamily: font.mono, fontSize: 11 },
  section: { marginTop: space[8], marginBottom: space[3] },
  nothing: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, marginTop: space[8] },
  job: { flexDirection: 'row', gap: space[3], padding: space[4], marginBottom: space[2], borderRadius: radius.xl, backgroundColor: glass },
  jobBig: { paddingVertical: space[5], backgroundColor: color.raised },
  jobPressed: { backgroundColor: color.raised },
  jobTime: { width: 46 },
  time: { color: color.fg, fontFamily: font.monoMedium, fontSize: 13 },
  timeEnd: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, marginTop: 2 },
  jobBody: { flex: 1 },
  jobTop: { flexDirection: 'row', gap: space[2], alignItems: 'center' },
  ref: { color: color.fgFaint, fontFamily: font.mono, fontSize: 10.5 },
  flag: { fontFamily: font.display, fontSize: 8, letterSpacing: tracking.label },
  title: { color: color.fg, fontFamily: font.sansSemi, fontSize: 15, marginTop: 3 },
  addr: { color: color.fgMuted, fontFamily: font.sans, fontSize: 12, marginTop: 3, lineHeight: 17 },
  postcode: { fontFamily: font.mono, fontSize: 11.5 },
  statusWrap: { alignSelf: 'flex-start', marginTop: 1 },
});

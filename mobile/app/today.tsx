import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Cap, Go, Num, OpTitle, openMaps, Plain, ring, ringName, Section, StageTrack, TabBar, TopRow } from '@/components/ardent';
import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { Dock, ModeChip, SyncChip } from '@/components/ui';
import type { JobCard } from '@/data/types';
import { copy } from '@/kit/copy';
import { clock, duration, relative } from '@/kit/format';
import { jobDone, priority, toneColor } from '@/kit/states';
import * as act from '@/sync/actions';
import { field } from '@/sync/field';
import { elapsed, hms, nextUp, stageOf, today, useField, useNow, waiting } from '@/sync/hooks';
import { color, font, space } from '@/theme/tokens';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The job in hand or the next one: what it is, where, and how far along. */
function Hero({ job, now, first }: { job: JobCard; now: number; first: boolean }) {
  const router = useRouter();
  const { day } = useField();
  const time = day?.time.filter((t) => t.jobId === job.id) ?? [];
  const live = job.status === 'en_route' ? 'travel' : job.status === 'on_site' ? 'labour' : undefined;
  const cap = job.status === 'en_route' ? 'On the road' : job.status === 'on_site' ? 'On site' : job.status === 'paused' ? 'Paused' : first ? 'First up' : 'Next up';
  const flag = job.priority === 'emergency' || job.priority === 'high' ? priority[job.priority] : undefined;
  return (
    <Pressable onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })} accessibilityRole="button" accessibilityLabel={`${cap}, ${job.ref}, ${job.title}. Open the job`}>
      <Card style={{ gap: 14 }}>
        <View style={styles.heroTop}>
          <Cap tint={job.status === 'paused' ? color.warn : color.fgMuted}>{cap}</Cap>
          <View style={styles.heroRef}>
            {flag && <Cap tint={toneColor[flag.tone]}>{flag.label}</Cap>}
            <Cap>{job.ref}</Cap>
          </View>
        </View>
        {live ? (
          <Num size={40} unit={live === 'travel' ? 'travel' : 'on site'}>
            {hms(elapsed(time, live, now))}
          </Num>
        ) : (
          <Num size={44} unit={job.status === 'booked' ? relative(job.start, now) : 'paused'}>
            {clock(job.start)}
          </Num>
        )}
        <View>
          <Text style={styles.heroTitle}>{job.title}</Text>
          {job.customer && job.site && (
            <Text style={styles.heroAddr}>
              {job.customer.name}, {job.site.line1}, {job.site.postcode}
            </Text>
          )}
        </View>
        <StageTrack at={stageOf(job.status)} style={{ marginVertical: 4 }} />
        <View style={styles.pair}>
          {job.site && <Plain title="Directions" icon="route" onPress={() => openMaps(`${job.site!.line1}, ${job.site!.postcode}`)} flex />}
          {job.customer && <Plain title={`Ring ${ringName(job.customer)}`} icon="phone" onPress={() => ring(job.customer!.phone)} flex />}
        </View>
      </Card>
    </Pressable>
  );
}

function LaterRow({ job, index }: { job: JobCard; index: number }) {
  const router = useRouter();
  const done = jobDone.has(job.status);
  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 45).duration(400)}>
      <Pressable
        onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${clock(job.start)}, ${job.title}, ${done ? 'done' : 'to do'}`}
        style={({ pressed }) => [styles.later, pressed && { opacity: 0.6 }, done && { opacity: 0.45 }]}
      >
        <Text style={styles.laterTime}>{clock(job.start)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.laterTitle} numberOfLines={1}>
            {job.title}
          </Text>
          <Text style={styles.laterAddr} numberOfLines={1}>
            {done ? 'Done' : [job.customer?.name, job.site?.postcode].filter(Boolean).join(', ')}
          </Text>
        </View>
        <Text style={styles.laterRef}>{job.ref}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function Today() {
  const router = useRouter();
  const snap = useField();
  const { state, day } = snap;
  const now = useNow(!!day?.time.some((t) => !t.end), 1000);

  if (!day) {
    return (
      <View style={styles.root}>
        <Atmosphere state="on_call" />
        <SafeAreaView style={styles.empty}>
          <OpTitle>Today</OpTitle>
          <Text style={styles.sub}>
            {state.loading ? 'Getting your day from the office.' : state.loadError ? `${state.loadError}. Pull down to try again.` : "Your day isn't on this phone yet. It comes down the next time there's signal."}
          </Text>
          <View style={{ marginTop: space[6] }}>
            <Plain title="Try again" onPress={() => void field.refresh()} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const jobs = today(day, now);
  const next = nextUp(jobs);
  const rest = jobs.filter((j) => j.id !== next?.id);
  const done = jobs.filter((j) => jobDone.has(j.status)).length;
  const booked = jobs.reduce((ms, j) => ms + Math.max(0, Date.parse(j.end) - Date.parse(j.start)), 0);
  const held = waiting(snap) > 0 || state.setAside.length > 0;
  const open = (id: string) => router.push({ pathname: '/job/[id]', params: { id } });

  const dock = () => {
    if (!next) return null;
    switch (next.status) {
      case 'booked':
        return (
          <HoldToCommit
            label={`Hold to set off for ${next.ref}`}
            icon="route"
            onCommit={async () => {
              await act.setOff(next);
              open(next.id);
            }}
          />
        );
      case 'en_route':
        return <HoldToCommit label="Hold, I've arrived" icon="pin" onCommit={() => void act.arrived(next)} />;
      case 'paused':
        return <HoldToCommit label={`Hold, ${copy.resume.toLowerCase()}`} icon="arrow" onCommit={() => void act.backOnIt(next)} />;
      default:
        return <Go label={`Open ${next.ref}`} icon="arrow" onPress={() => open(next.id)} />;
    }
  };

  return (
    <View style={styles.root}>
      <Atmosphere state={day.operator.state} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.pad}>
          <TopRow left={<ModeChip state={day.operator.state} />} right={held ? <SyncChip /> : clock(new Date(now).toISOString())} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={state.loading} onRefresh={() => void field.refresh()} tintColor={color.fgMuted} />}
        >
          <Animated.View entering={FadeInDown.duration(420)}>
            <OpTitle>Today</OpTitle>
            <Text style={styles.sub}>
              {jobs.length ? `${plural(jobs.length, 'job')}, ${duration(booked)} booked.${done ? ` ${done} done.` : ''}` : 'Nothing booked for you today.'}
            </Text>
          </Animated.View>

          {next ? (
            <Animated.View entering={FadeInDown.delay(60).duration(420)} style={{ marginTop: 22 }}>
              <Hero job={next} now={now} first={done === 0} />
            </Animated.View>
          ) : (
            jobs.length > 0 && <Text style={[styles.sub, { marginTop: 22 }]}>That's everything booked for today.</Text>
          )}

          {rest.length > 0 && (
            <>
              <Section label="Later" right={done ? `${done} of ${jobs.length} done` : undefined} />
              {rest.map((j, i) => (
                <LaterRow key={j.id} job={j} index={i} />
              ))}
            </>
          )}
        </ScrollView>

        {next && <Dock>{dock()}</Dock>}
        <TabBar />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  empty: { flex: 1, padding: 22, justifyContent: 'center' },
  pad: { paddingHorizontal: 22, paddingTop: space[3] },
  scroll: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: space[8] },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 15, lineHeight: 21, marginTop: 6 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroRef: { flexDirection: 'row', gap: 12 },
  heroTitle: { color: color.fg, fontFamily: font.sansMedium, fontSize: 17 },
  heroAddr: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20, marginTop: 6 },
  pair: { flexDirection: 'row', gap: 8 },
  later: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingVertical: 12, minHeight: 56 },
  laterTime: { color: color.fgFaint, fontFamily: font.mono, fontSize: 15, width: 48, marginTop: 1 },
  laterTitle: { color: color.fg, fontFamily: font.sans, fontSize: 15 },
  laterAddr: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, marginTop: 4 },
  laterRef: { color: color.fgFaint, fontFamily: font.mono, fontSize: 12, marginTop: 2 },
});

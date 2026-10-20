import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Atmosphere } from '@/components/Atmosphere';
import { todayJobs } from '@/data/client';
import { modeById } from '@/data/modes';
import type { JobCard } from '@/data/types';
import { clock, pounds } from '@/format';
import { useOperator } from '@/state/operator';
import { DONE, FLAG, STATUS } from '@/theme/status';
import { color, font, radius, space, tracking } from '@/theme/tokens';

function greeting() {
  const h = new Date().getHours();
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

function JobRow({ job, index }: { job: JobCard; index: number }) {
  const router = useRouter();
  const s = STATUS[job.status];
  const done = DONE.has(job.status);
  const flag = FLAG[job.priority];
  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 70).duration(420)}>
      <Pressable
        onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
        accessibilityRole="button"
        style={({ pressed }) => [styles.job, pressed && styles.jobPressed, done && { opacity: 0.55 }]}>
        <View style={styles.jobTime}>
          <Text style={styles.time}>{clock(job.start)}</Text>
          <Text style={styles.timeEnd}>{clock(job.end)}</Text>
        </View>
        <View style={styles.jobBody}>
          <View style={styles.jobTop}>
            <Text style={styles.ref}>{job.ref}</Text>
            {flag && <Text style={[styles.flag, { color: flag }]}>{job.priority.toUpperCase()}</Text>}
          </View>
          <Text style={styles.title}>{job.title}</Text>
          <Text style={styles.addr}>
            {job.customer.name} · {job.site.line1}, <Text style={styles.postcode}>{job.site.postcode}</Text>
          </Text>
        </View>
        <View style={styles.statusWrap}>
          <View style={[styles.dot, { backgroundColor: s.tint }]} />
          <Text style={[styles.status, { color: s.tint }]}>{s.label}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function Today() {
  const router = useRouter();
  const { mode, me, summary, refresh } = useOperator();
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const m = modeById(mode);

  // Reload on focus so a job finished on its own screen shows here straight away.
  useFocusEffect(
    useCallback(() => {
      if (me) todayJobs(me).then(setJobs);
      refresh();
    }, [me, refresh]),
  );

  const first = me?.name.split(' ')[0];

  return (
    <View style={styles.root}>
      <Atmosphere mode={mode} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Change mode" style={styles.modeChip}>
            <View style={[styles.dot, { backgroundColor: color.ember }]} />
            <Text style={styles.modeChipText}>{m.label.toUpperCase()}</Text>
          </Pressable>
          <Text style={styles.wordmark}>ARDENT</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(460)}>
            <Text style={styles.hello}>
              {greeting()}
              {first ? `, ${first}` : ''}
            </Text>
            <Text style={styles.headline}>TODAY</Text>
          </Animated.View>

          <View style={styles.stats}>
            <Stat value={summary ? `${summary.jobsDone}/${summary.jobsToday}` : '–'} label="Jobs" />
            <View style={styles.rule} />
            <Stat value={summary ? String(summary.quotesOpen) : '–'} label="Quotes out" />
            <View style={styles.rule} />
            <Stat value={summary ? pounds(summary.owedPence) : '–'} label="Owed" />
          </View>

          <Text style={styles.section}>RUN SHEET</Text>
          {jobs.map((j, i) => (
            <JobRow key={j.id} job={j} index={i} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[6], paddingTop: space[2] },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: color.raised,
  },
  modeChipText: { color: color.fg, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label },
  wordmark: { color: color.fgFaint, fontFamily: font.display, fontSize: 10, letterSpacing: tracking.label * 2 },
  scroll: { paddingHorizontal: space[6], paddingTop: space[8], paddingBottom: space[12] },
  hello: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14 },
  headline: { color: color.fg, fontFamily: font.display, fontSize: 34, letterSpacing: tracking.display, marginTop: space[1] },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space[6],
    paddingVertical: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  stat: { flex: 1 },
  statValue: { color: color.fg, fontFamily: font.monoMedium, fontSize: 20 },
  statLabel: { color: color.fgFaint, fontFamily: font.sansMedium, fontSize: 11, marginTop: 4, letterSpacing: 0.4 },
  rule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: color.line, marginHorizontal: space[3] },
  section: { color: color.fgFaint, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label * 1.5, marginTop: space[8], marginBottom: space[3] },
  job: {
    flexDirection: 'row',
    gap: space[3],
    padding: space[4],
    marginBottom: space[2],
    borderRadius: radius.xl,
    backgroundColor: 'rgba(18,18,18,0.78)',
  },
  jobPressed: { backgroundColor: color.raised },
  jobTime: { width: 44 },
  time: { color: color.fg, fontFamily: font.monoMedium, fontSize: 13 },
  timeEnd: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, marginTop: 2 },
  jobBody: { flex: 1 },
  jobTop: { flexDirection: 'row', gap: space[2], alignItems: 'center' },
  ref: { color: color.fgFaint, fontFamily: font.mono, fontSize: 10.5 },
  flag: { fontFamily: font.display, fontSize: 8, letterSpacing: tracking.label },
  title: { color: color.fg, fontFamily: font.sansSemi, fontSize: 15, marginTop: 3 },
  addr: { color: color.fgMuted, fontFamily: font.sans, fontSize: 12, marginTop: 3 },
  postcode: { fontFamily: font.mono, fontSize: 11.5 },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontFamily: font.sansMedium, fontSize: 11 },
});

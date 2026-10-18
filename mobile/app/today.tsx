import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Atmosphere } from '@/components/Atmosphere';
import { ardent } from '@/data/client';
import { modeById } from '@/data/modes';
import type { JobCard, JobStatus } from '@/data/types';
import { clock, pounds } from '@/format';
import { useOperator } from '@/state/operator';
import { color, font, radius, space, tracking } from '@/theme/tokens';

const STATUS: Record<JobStatus, { label: string; tint: string }> = {
  scheduled: { label: 'Booked', tint: color.boneDim },
  en_route: { label: 'En route', tint: color.ember },
  on_site: { label: 'On site', tint: color.signal },
  paused: { label: 'Paused', tint: color.hazard },
  complete: { label: 'Done', tint: color.boneFaint },
  invoiced: { label: 'Invoiced', tint: color.boneFaint },
};

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
  const s = STATUS[job.status];
  const done = job.status === 'complete' || job.status === 'invoiced';
  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 70).duration(420)}>
      <Pressable style={({ pressed }) => [styles.job, pressed && styles.jobPressed, done && { opacity: 0.55 }]}>
        <View style={styles.jobTime}>
          <Text style={styles.time}>{clock(job.scheduledStart)}</Text>
          <Text style={styles.timeEnd}>{clock(job.scheduledEnd)}</Text>
        </View>
        <View style={styles.jobBody}>
          <View style={styles.jobTop}>
            <Text style={styles.ref}>{job.ref}</Text>
            {job.priority !== 'routine' && <Text style={[styles.flag, { color: color.hazard }]}>{job.priority.toUpperCase()}</Text>}
          </View>
          <Text style={styles.title}>{job.title}</Text>
          <Text style={styles.addr}>
            {job.customer.name} · {job.site.addressLine}, {job.site.postcode}
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
  const { mode, operator, summary } = useOperator();
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const m = modeById(mode);

  useEffect(() => {
    ardent.getTodayJobs().then(setJobs);
  }, []);

  const first = operator?.name.split(' ')[0];

  return (
    <View style={styles.root}>
      <Atmosphere mode={mode} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Change mode" style={styles.modeChip}>
            <View style={[styles.dot, { backgroundColor: m.glow }]} />
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
            <Stat value={summary ? pounds(summary.unpaidPence) : '–'} label="Owed" />
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
  root: { flex: 1, backgroundColor: color.void },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingTop: space.sm },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.boneFaint,
    backgroundColor: 'rgba(11,12,13,0.4)',
  },
  modeChipText: { color: color.bone, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label },
  wordmark: { color: color.boneFaint, fontFamily: font.display, fontSize: 10, letterSpacing: tracking.label * 2 },
  scroll: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl },
  hello: { color: color.boneDim, fontFamily: font.body, fontSize: 14 },
  headline: { color: color.bone, fontFamily: font.display, fontSize: 34, letterSpacing: tracking.display, marginTop: space.xs },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xl,
    paddingVertical: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  stat: { flex: 1 },
  statValue: { color: color.bone, fontFamily: font.display, fontSize: 18 },
  statLabel: { color: color.boneFaint, fontFamily: font.bodyMedium, fontSize: 11, marginTop: 4, letterSpacing: 0.4 },
  rule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: color.line, marginHorizontal: space.md },
  section: { color: color.boneFaint, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label * 1.5, marginTop: space.xxl, marginBottom: space.md },
  job: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(26,29,32,0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  jobPressed: { backgroundColor: 'rgba(42,47,51,0.75)' },
  jobTime: { width: 44 },
  time: { color: color.bone, fontFamily: font.bodySemi, fontSize: 13 },
  timeEnd: { color: color.boneFaint, fontFamily: font.body, fontSize: 11, marginTop: 2 },
  jobBody: { flex: 1 },
  jobTop: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  ref: { color: color.boneFaint, fontFamily: font.bodyMedium, fontSize: 10.5, letterSpacing: 0.6 },
  flag: { fontFamily: font.display, fontSize: 8, letterSpacing: tracking.label },
  title: { color: color.bone, fontFamily: font.bodySemi, fontSize: 15, marginTop: 3 },
  addr: { color: color.boneDim, fontFamily: font.body, fontSize: 12, marginTop: 3 },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontFamily: font.bodyMedium, fontSize: 11 },
});

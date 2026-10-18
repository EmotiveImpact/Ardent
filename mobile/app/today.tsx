import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Atmosphere } from '@/components/Atmosphere';
import { ardent } from '@/data/client';
import { modeById } from '@/data/modes';
import type { JobCard, JobStatus, Priority } from '@/data/types';
import { clock, pounds } from '@/format';
import { useOperator } from '@/state/operator';
import { color, font, radius, space, tracking } from '@/theme/tokens';

const STATUS: Record<JobStatus, { label: string; tint: string }> = {
  enquiry: { label: 'Enquiry', tint: color.fgMuted },
  quoted: { label: 'Quoted', tint: color.fgMuted },
  booked: { label: 'Booked', tint: color.fgMuted },
  en_route: { label: 'En route', tint: color.info },
  on_site: { label: 'On site', tint: color.ok },
  paused: { label: 'Paused', tint: color.warn },
  complete: { label: 'Done', tint: color.fgFaint },
  invoiced: { label: 'Invoiced', tint: color.fgFaint },
  paid: { label: 'Paid', tint: color.fgFaint },
  cancelled: { label: 'Cancelled', tint: color.fgFaint },
};

const FLAG: Partial<Record<Priority, string>> = { emergency: color.danger, high: color.ember };
const DONE = new Set<JobStatus>(['complete', 'invoiced', 'paid', 'cancelled']);

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
  const done = DONE.has(job.status);
  const flag = FLAG[job.priority];
  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 70).duration(420)}>
      <Pressable style={({ pressed }) => [styles.job, pressed && styles.jobPressed, done && { opacity: 0.55 }]}>
        <View style={styles.jobTime}>
          <Text style={styles.time}>{clock(job.start)}</Text>
          <Text style={styles.timeEnd}>{clock(job.end)}</Text>
        </View>
        <View style={styles.jobBody}>
          <View style={styles.jobTop}>
            <Text style={styles.ref}>{job.number}</Text>
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
  const { mode, me, summary } = useOperator();
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const m = modeById(mode);

  useEffect(() => {
    ardent.getTodayJobs().then(setJobs);
  }, []);

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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingTop: space.sm },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
    backgroundColor: 'rgba(7,7,7,0.5)',
  },
  modeChipText: { color: color.fg, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label },
  wordmark: { color: color.fgFaint, fontFamily: font.display, fontSize: 10, letterSpacing: tracking.label * 2 },
  scroll: { paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xxxl },
  hello: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14 },
  headline: { color: color.fg, fontFamily: font.display, fontSize: 34, letterSpacing: tracking.display, marginTop: space.xs },
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
  statValue: { color: color.fg, fontFamily: font.monoMedium, fontSize: 20 },
  statLabel: { color: color.fgFaint, fontFamily: font.sansMedium, fontSize: 11, marginTop: 4, letterSpacing: 0.4 },
  rule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: color.line, marginHorizontal: space.md },
  section: { color: color.fgFaint, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label * 1.5, marginTop: space.xxl, marginBottom: space.md },
  job: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(17,17,17,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  jobPressed: { backgroundColor: color.raised },
  jobTime: { width: 44 },
  time: { color: color.fg, fontFamily: font.monoMedium, fontSize: 13 },
  timeEnd: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, marginTop: 2 },
  jobBody: { flex: 1 },
  jobTop: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  ref: { color: color.fgFaint, fontFamily: font.mono, fontSize: 10.5 },
  flag: { fontFamily: font.display, fontSize: 8, letterSpacing: tracking.label },
  title: { color: color.fg, fontFamily: font.sansSemi, fontSize: 15, marginTop: 3 },
  addr: { color: color.fgMuted, fontFamily: font.sans, fontSize: 12, marginTop: 3 },
  postcode: { fontFamily: font.mono, fontSize: 11.5 },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontFamily: font.sansMedium, fontSize: 11 },
});

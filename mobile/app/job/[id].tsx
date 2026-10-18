import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Atmosphere } from '@/components/Atmosphere';
import { Action } from '@/components/Action';
import { HoldToEnter } from '@/components/HoldToEnter';
import { ardent } from '@/data/client';
import { advance, elapsed, hms, pause, STEPS } from '@/data/jobs';
import type { ComplianceCheck, Customer, Job, Note, Photo, Site, TimeEntry } from '@/data/types';
import { clock, pounds } from '@/format';
import { useOperator } from '@/state/operator';
import { FLAG, STATUS } from '@/theme/status';
import { color, font, radius, space, tracking } from '@/theme/tokens';

const CHECK: Record<ComplianceCheck['state'], string> = {
  pass: color.ok,
  fail: color.danger,
  pending: color.warn,
  'n/a': color.fgFaint,
};

const STAGES: Photo['stage'][] = ['before', 'during', 'after'];

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me, setMode } = useOperator();

  const [job, setJob] = useState<Job>();
  const [customer, setCustomer] = useState<Customer>();
  const [site, setSite] = useState<Site>();
  const [time, setTime] = useState<TimeEntry[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stage, setStage] = useState<Photo['stage']>('before');
  const [draft, setDraft] = useState('');
  const [mat, setMat] = useState({ description: '', qty: '1', price: '' });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await ardent.jobs.get(id);
    if (!j) return;
    const [c, s, t, p, n] = await Promise.all([
      ardent.customers.get(j.customerId),
      ardent.sites.get(j.siteId),
      ardent.time.forJob(j.id),
      ardent.photos.forJob(j.id),
      ardent.notes.forJob(j.id),
    ]);
    setJob(j);
    setCustomer(c);
    setSite(s);
    setTime(t);
    setPhotos(p);
    setNotes(n);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const running = time.find((t) => !t.end);
  useEffect(() => {
    if (!running) return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [running]);

  if (!job || !me) return <View style={styles.root} />;

  const s = STATUS[job.status];
  const flag = FLAG[job.priority];
  const step = STEPS[job.status];
  const materials = job.lines.filter((l) => l.kind === 'material');

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const go = () =>
    run(async () => {
      await advance(job.id, me, running);
      // Keep the opening screen's mode in step with what the job just did.
      if (step?.next === 'en_route' || step?.next === 'on_site') setMode(step.next);
      if (step?.next === 'complete') {
        setMode('on_call');
        router.replace({ pathname: '/wrap/[id]', params: { id: job.id } });
      }
    });

  const snap = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const pick = perm.granted
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    const uri = pick.canceled ? undefined : pick.assets[0]?.uri;
    if (!uri) return;
    run(async () => {
      await ardent.photos.add({ jobId: job.id, operatorId: me.id, stage, uri, takenAt: new Date().toISOString() });
    });
  };

  const addMaterial = () => {
    const description = mat.description.trim();
    const quantity = Math.max(1, parseInt(mat.qty, 10) || 1);
    // Price typed in pounds; the model stores pence.
    const unitPrice = Math.round((parseFloat(mat.price.replace(/[£,]/g, '')) || 0) * 100);
    if (!description) return;
    setMat({ description: '', qty: '1', price: '' });
    run(async () => {
      await ardent.jobs.addLine(job.id, { kind: 'material', description, quantity, unitPrice });
    });
  };

  const addNote = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    run(async () => {
      await ardent.notes.add({ jobId: job.id, operatorId: me.id, body, at: new Date().toISOString() });
    });
  };

  return (
    <View style={styles.root}>
      <Atmosphere mode={job.status === 'en_route' ? 'en_route' : 'on_site'} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to today">
            <Text style={styles.back}>‹ TODAY</Text>
          </Pressable>
          <View style={styles.statusWrap}>
            <View style={[styles.dot, { backgroundColor: s.tint }]} />
            <Text style={[styles.status, { color: s.tint }]}>{s.label}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(420)}>
            <View style={styles.refRow}>
              <Text style={styles.ref}>{job.ref}</Text>
              {flag && <Text style={[styles.flag, { color: flag }]}>{job.priority.toUpperCase()}</Text>}
              <Text style={styles.ref}>
                {clock(job.start)} to {clock(job.end)}
              </Text>
            </View>
            <Text style={styles.title}>{job.title}</Text>
            {customer && site && (
              <Text style={styles.addr}>
                {customer.name} · {site.line1}, {site.town} <Text style={styles.mono}>{site.postcode}</Text>
              </Text>
            )}
          </Animated.View>

          <View style={styles.row}>
            {customer && <Action title="Call" onPress={() => Linking.openURL(`tel:${customer.phone.replace(/\s/g, '')}`)} />}
            {site && (
              <Action
                title="Navigate"
                onPress={() =>
                  Linking.openURL(
                    Platform.OS === 'ios'
                      ? `maps:?daddr=${encodeURIComponent(`${site.line1}, ${site.postcode}`)}`
                      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${site.line1}, ${site.postcode}`)}`,
                  )
                }
              />
            )}
          </View>

          {site?.accessNotes && (
            <View style={styles.access}>
              <Label>ACCESS</Label>
              <Text style={styles.body}>{site.accessNotes}</Text>
            </View>
          )}
          {job.notes && (
            <View style={styles.access}>
              <Label>FROM THE OFFICE</Label>
              <Text style={styles.body}>{job.notes}</Text>
            </View>
          )}

          <View style={styles.clocks}>
            {(['travel', 'labour'] as const).map((k) => {
              const live = running?.kind === k;
              return (
                <View key={k} style={styles.clock}>
                  <Text style={[styles.clockValue, live && { color: color.ember }]}>{hms(elapsed(time, k, now))}</Text>
                  <Text style={styles.clockLabel}>
                    {k === 'travel' ? 'Travel' : 'On the tools'}
                    {live ? ' · running' : ''}
                  </Text>
                </View>
              );
            })}
          </View>

          {job.checks.length > 0 && (
            <>
              <Label>CHECKS</Label>
              <View style={styles.panel}>
                {job.checks.map((c, i) => (
                  <View key={c.key} style={[styles.checkRow, i > 0 && styles.divider]}>
                    <View style={[styles.dot, { backgroundColor: CHECK[c.state] }]} />
                    <Text style={styles.checkLabel}>{c.label}</Text>
                    <Text style={styles.checkDetail}>{c.detail ?? c.state}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Label>PHOTOS</Label>
          <View style={styles.stages}>
            {STAGES.map((st) => (
              <Pressable key={st} onPress={() => setStage(st)} style={[styles.stage, stage === st && styles.stageOn]} accessibilityRole="button">
                <Text style={[styles.stageText, stage === st && { color: color.ember }]}>{st.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
            <Pressable onPress={snap} style={styles.snap} accessibilityRole="button" accessibilityLabel={`Add ${stage} photo`}>
              <Text style={styles.snapPlus}>+</Text>
              <Text style={styles.snapText}>{stage}</Text>
            </Pressable>
            {photos.map((p) => (
              <View key={p.id}>
                <Image source={{ uri: p.uri }} style={styles.photo} />
                <Text style={styles.photoStage}>{p.stage}</Text>
              </View>
            ))}
          </ScrollView>

          <Label>MATERIALS</Label>
          {materials.length > 0 && (
            <View style={[styles.panel, { marginBottom: space[3] }]}>
              {materials.map((l, i) => (
                <View key={l.id} style={[styles.checkRow, i > 0 && styles.divider]}>
                  <Text style={[styles.mono, styles.qty]}>{l.quantity}×</Text>
                  <Text style={styles.checkLabel}>{l.description}</Text>
                  <Text style={styles.mono}>{pounds(l.unitPrice * l.quantity)}</Text>
                  <Pressable
                    onPress={() => run(async () => void (await ardent.jobs.removeLine(job.id, l.id)))}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${l.description}`}
                  >
                    <Text style={styles.remove}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <View style={styles.matForm}>
            <TextInput
              value={mat.description}
              onChangeText={(description) => setMat({ ...mat, description })}
              placeholder="Part or material"
              placeholderTextColor={color.fgFaint}
              style={[styles.input, { flex: 1, minWidth: 0 }]}
            />
            <TextInput
              value={mat.qty}
              onChangeText={(qty) => setMat({ ...mat, qty })}
              placeholder="Qty"
              keyboardType="number-pad"
              placeholderTextColor={color.fgFaint}
              style={[styles.input, styles.monoInput, { flex: 0, width: 52, paddingHorizontal: space[1] }]}
            />
            <TextInput
              value={mat.price}
              onChangeText={(price) => setMat({ ...mat, price })}
              placeholder="£ each"
              keyboardType="decimal-pad"
              placeholderTextColor={color.fgFaint}
              style={[styles.input, styles.monoInput, { flex: 0, width: 76, paddingHorizontal: space[1] }]}
            />
          </View>
          <View style={{ marginTop: space[2] }}>
            <Action title="Log material" onPress={addMaterial} />
          </View>

          <Label>NOTES</Label>
          <View style={styles.noteBox}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="What did you find, what's left?"
              placeholderTextColor={color.fgFaint}
              style={styles.input}
              multiline
              onSubmitEditing={addNote}
            />
            <Action title="Add" onPress={addNote} />
          </View>
          {notes.map((n) => (
            <View key={n.id} style={styles.note}>
              <Text style={styles.noteAt}>{clock(n.at)}</Text>
              <Text style={styles.body}>{n.body}</Text>
            </View>
          ))}
        </ScrollView>

        {job.status === 'complete' && (
          <View style={styles.dock}>
            <Action title="Sign off and invoice" tone="ember" onPress={() => router.push({ pathname: '/wrap/[id]', params: { id: job.id } })} />
          </View>
        )}
        {step && (
          <View style={styles.dock}>
            {step.hold ? (
              <View style={styles.dockRow}>
                <Action title="Pause" onPress={() => run(() => pause(job.id, running))} />
                <View style={{ flex: 1 }}>
                  <HoldToEnter label={step.label.toUpperCase()} onEnter={go} />
                </View>
              </View>
            ) : (
              <Action title={step.label} tone="ember" onPress={go} />
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[6], paddingTop: space[2], paddingBottom: space[2] },
  back: { color: color.fgMuted, fontFamily: font.display, fontSize: 10, letterSpacing: tracking.label },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontFamily: font.sansMedium, fontSize: 12 },
  scroll: { paddingHorizontal: space[6], paddingTop: space[4], paddingBottom: space[8] },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  ref: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11 },
  flag: { fontFamily: font.display, fontSize: 8, letterSpacing: tracking.label },
  title: { color: color.fg, fontFamily: font.display, fontSize: 22, lineHeight: 30, letterSpacing: 0.6, marginTop: space[2] },
  addr: { color: color.fgMuted, fontFamily: font.sans, fontSize: 13, marginTop: space[2], lineHeight: 18 },
  mono: { color: color.fgMuted, fontFamily: font.mono, fontSize: 12 },
  row: { flexDirection: 'row', gap: space[2], marginTop: space[4] },
  access: { marginTop: space[4], padding: space[3], borderRadius: radius.lg, backgroundColor: 'rgba(17,17,17,0.72)' },
  body: { color: color.fg, fontFamily: font.sans, fontSize: 13, lineHeight: 18, marginTop: 2 },
  label: { color: color.fgFaint, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label * 1.5, marginTop: space[8], marginBottom: space[3] },
  clocks: { flexDirection: 'row', marginTop: space[6], paddingVertical: space[4], borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.line },
  clock: { flex: 1 },
  clockValue: { color: color.fg, fontFamily: font.monoMedium, fontSize: 24 },
  clockLabel: { color: color.fgFaint, fontFamily: font.sansMedium, fontSize: 11, marginTop: 4 },
  panel: { borderRadius: radius.xl, backgroundColor: 'rgba(17,17,17,0.72)', paddingHorizontal: space[4] },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  checkLabel: { flex: 1, color: color.fg, fontFamily: font.sansMedium, fontSize: 13 },
  checkDetail: { color: color.fgMuted, fontFamily: font.mono, fontSize: 11 },
  qty: { width: 28 },
  remove: { color: color.fgFaint, fontFamily: font.sans, fontSize: 18, paddingLeft: space[1] },
  matForm: { flexDirection: 'row', gap: space[2] },
  monoInput: { fontFamily: font.mono, textAlign: 'center' },
  stages: { flexDirection: 'row', gap: space[2], marginBottom: space[3] },
  stage: { paddingHorizontal: space[3], paddingVertical: 6, borderRadius: radius.pill, backgroundColor: color.raised },
  stageOn: { backgroundColor: color.emberSoft },
  stageText: { color: color.fgMuted, fontFamily: font.display, fontSize: 8, letterSpacing: tracking.label },
  photos: { gap: space[2] },
  snap: { width: 88, height: 88, borderRadius: radius.lg, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
  snapPlus: { color: color.fg, fontFamily: font.sans, fontSize: 24 },
  snapText: { color: color.fgFaint, fontFamily: font.sans, fontSize: 11 },
  photo: { width: 88, height: 88, borderRadius: radius.lg, backgroundColor: color.raised },
  photoStage: { color: color.fgFaint, fontFamily: font.sans, fontSize: 10, marginTop: 4 },
  noteBox: { flexDirection: 'row', gap: space[2], alignItems: 'flex-end' },
  input: {
    flex: 1,
    minHeight: 44,
    color: color.fg,
    fontFamily: font.sans,
    fontSize: 14,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    borderRadius: radius.lg,
    backgroundColor: color.raised,
  },
  note: { marginTop: space[3], flexDirection: 'row', gap: space[3] },
  noteAt: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, marginTop: 3, width: 40 },
  dock: { paddingHorizontal: space[6], paddingTop: space[3], paddingBottom: space[2], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, backgroundColor: 'rgba(7,7,7,0.85)' },
  dockRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
});

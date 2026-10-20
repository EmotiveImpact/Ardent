import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Action } from '@/components/Action';
import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { PhotoThumb } from '@/components/PhotoThumb';
import { pickPhoto } from '@/components/pickPhoto';
import { Back, Dock, Input, Label, Panel, Row, StateText } from '@/components/ui';
import type { ComplianceCheck, OperatorState, Photo } from '@/data/types';
import { copy } from '@/kit/copy';
import { clock, pounds, window as slot } from '@/kit/format';
import { checkState, jobStatus, priority } from '@/kit/states';
import * as act from '@/sync/actions';
import { card, elapsed, hms, useField, useNow } from '@/sync/hooks';
import { color, font, glass, radius, space, toneColor, tracking } from '@/theme/tokens';

const STAGES: Photo['stage'][] = ['before', 'during', 'after'];
/** Tapping a check moves it on: to do, pass, fail, back to to do. */
const NEXT_CHECK: Record<ComplianceCheck['state'], ComplianceCheck['state']> = { pending: 'pass', pass: 'fail', fail: 'pending', 'n/a': 'pending' };

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { state, day } = useField();
  const [stage, setStage] = useState<Photo['stage']>('before');
  const [draft, setDraft] = useState('');
  const [mat, setMat] = useState({ description: '', qty: '1', price: '' });
  const [problem, setProblem] = useState('');
  const job = day?.jobs.find((j) => j.id === id);
  const time = day?.time.filter((t) => t.jobId === id) ?? [];
  const running = time.find((t) => !t.end);
  const now = useNow(!!running);

  if (!day || !job) {
    return (
      <View style={styles.root}>
        <Atmosphere state="on_call" />
        <SafeAreaView style={{ flex: 1, padding: space[6] }}>
          <Back label="Today" />
          <Text style={[styles.addr, { marginTop: space[8] }]}>This job isn't on your phone. It may have moved to someone else.</Text>
        </SafeAreaView>
      </View>
    );
  }

  const { customer, site } = card(day, job);
  const s = jobStatus[job.status];
  const flag = job.priority === 'emergency' || job.priority === 'high' ? priority[job.priority] : undefined;
  const materials = job.lines.filter((l) => l.kind === 'material');
  const photos = day.photos.filter((p) => p.jobId === job.id);
  const notes = day.notes.filter((n) => n.jobId === job.id).sort((a, b) => b.at.localeCompare(a.at));
  const uploading = new Set(state.outbox.flatMap((o) => (o.kind === 'upload' ? [o.photoId] : [])));
  const open = !['invoiced', 'paid', 'cancelled'].includes(job.status);
  const beforeArrival = job.status === 'booked' || job.status === 'en_route';
  // The one ember thing: the dock button when there is one, otherwise the running clock.
  const emberDock = ['booked', 'en_route', 'paused', 'complete', 'invoiced'].includes(job.status);
  const mood: OperatorState = job.status === 'en_route' ? 'en_route' : job.status === 'on_site' ? 'on_site' : job.status === 'paused' ? 'delayed' : 'on_call';

  const tryIt = async (fn: () => Promise<unknown>) => {
    try {
      setProblem('');
      await fn();
    } catch (e) {
      setProblem(String((e as Error).message ?? e));
    }
  };

  const snap = () =>
    tryIt(async () => {
      const picked = await pickPhoto();
      if (picked) await act.addPhoto(job, picked, stage);
    });

  const addMaterial = () => {
    const description = mat.description.trim();
    const quantity = Math.max(1, parseInt(mat.qty, 10) || 1);
    // Typed in pounds; stored in pence.
    const unitPrice = Math.round((parseFloat(mat.price.replace(/[£,\s]/g, '')) || 0) * 100);
    if (!description) return setProblem('Name the part or material first.');
    setMat({ description: '', qty: '1', price: '' });
    void tryIt(() => act.addMaterial(job, { kind: 'material', description, quantity, unitPrice }));
  };

  const addNote = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    void tryIt(() => act.addNote(job, body));
  };

  const dock = () => {
    switch (job.status) {
      case 'booked':
        return <Action title={copy.setOff} tone="ember" onPress={() => tryIt(() => act.setOff(job))} />;
      case 'en_route':
        return <Action title={copy.arrived} tone="ember" onPress={() => tryIt(() => act.arrived(job))} />;
      case 'paused':
        return <Action title={copy.resume} tone="ember" onPress={() => tryIt(() => act.backOnIt(job))} />;
      case 'on_site':
        return (
          <View style={styles.dockRow}>
            <Action title={copy.pause} onPress={() => tryIt(() => act.pause(job))} />
            <View style={{ flex: 1 }}>
              <HoldToCommit
                label={copy.holdToFinish}
                onCommit={() =>
                  tryIt(async () => {
                    await act.finish(job);
                    router.replace({ pathname: '/wrap/[id]', params: { id: job.id } });
                  })
                }
              />
            </View>
          </View>
        );
      case 'complete':
        return <Action title={copy.getSignOff} tone="ember" onPress={() => router.push({ pathname: '/wrap/[id]', params: { id: job.id } })} />;
      case 'invoiced':
        return <Action title={copy.takePayment} tone="ember" onPress={() => router.push({ pathname: '/wrap/[id]', params: { id: job.id } })} />;
      default:
        return null;
    }
  };
  const docked = dock();

  return (
    <View style={styles.root}>
      <Atmosphere state={mood} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Back label="Today" />
          <StateText label={s.label} tone={s.tone} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(400)}>
            <View style={styles.refRow}>
              <Text style={styles.ref}>{job.ref}</Text>
              {flag && <Text style={[styles.flag, { color: toneColor[flag.tone] }]}>{flag.label.toUpperCase()}</Text>}
              <Text style={styles.ref}>{slot(job.start, job.end)}</Text>
            </View>
            <Text style={styles.title}>{job.title}</Text>
            {customer && site && (
              <Text style={styles.addr}>
                {customer.name} · {site.line1}, {site.town} <Text style={styles.mono}>{site.postcode}</Text>
              </Text>
            )}
          </Animated.View>

          <View style={styles.actions}>
            {customer && <Action title="Call" onPress={() => Linking.openURL(`tel:${customer.phone.replace(/\s/g, '')}`)} />}
            {site && (
              <Action
                title="Navigate"
                onPress={() => {
                  const where = encodeURIComponent(`${site.line1}, ${site.postcode}`);
                  void Linking.openURL(Platform.OS === 'ios' ? `maps:?daddr=${where}` : `https://www.google.com/maps/dir/?api=1&destination=${where}`);
                }}
              />
            )}
          </View>

          {site?.accessNotes && (
            <View style={styles.note}>
              <Label>Access</Label>
              <Text style={styles.body}>{site.accessNotes}</Text>
            </View>
          )}
          {job.notes && (
            <View style={styles.note}>
              <Label>From the office</Label>
              <Text style={styles.body}>{job.notes}</Text>
            </View>
          )}

          <View style={styles.clocks}>
            {(['travel', 'labour'] as const).map((k) => {
              const live = running?.kind === k;
              return (
                <View key={k} style={{ flex: 1 }}>
                  <Text style={[styles.clockValue, !live && styles.clockIdle, live && !emberDock && { color: color.ember }]}>{hms(elapsed(time, k, now))}</Text>
                  <Text style={styles.clockLabel}>
                    {k === 'travel' ? 'Travel' : copy.onTheTools}
                    {live ? ' · running' : ''}
                  </Text>
                </View>
              );
            })}
          </View>

          {job.checks.length > 0 && (
            <>
              <Label style={styles.section}>Checks</Label>
              <Panel>
                {job.checks.map((c, i) => {
                  const st = checkState[c.state];
                  return (
                    <Row key={c.key} first={i === 0} onPress={open ? () => tryIt(() => act.setCheck(job, c.key, NEXT_CHECK[c.state], c.detail)) : undefined}>
                      <View style={[styles.dot, { backgroundColor: toneColor[st.tone] }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowText}>{c.label}</Text>
                        {c.detail ? <Text style={styles.detail}>{c.detail}</Text> : null}
                      </View>
                      <Text style={[styles.checkState, { color: toneColor[st.tone] }]}>{st.label}</Text>
                    </Row>
                  );
                })}
              </Panel>
              {open && <Text style={styles.hint}>Tap a check to mark it.</Text>}
            </>
          )}

          <Label style={styles.section}>Photos</Label>
          {open && (
            <View style={styles.stages}>
              {STAGES.map((st) => (
                <Pressable key={st} onPress={() => setStage(st)} style={[styles.stage, stage === st && styles.stageOn]} accessibilityRole="button" accessibilityState={{ selected: stage === st }}>
                  <Text style={[styles.stageText, stage === st && { color: color.fg }]}>{st.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
            {open && (
              <Pressable onPress={snap} style={({ pressed }) => [styles.snap, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`Add ${stage} photo`}>
                <Text style={styles.snapPlus}>+</Text>
                <Text style={styles.snapText}>{stage}</Text>
              </Pressable>
            )}
            {photos.map((p) => (
              <PhotoThumb key={p.id} photo={p} waiting={uploading.has(p.id)} />
            ))}
            {!open && photos.length === 0 && <Text style={styles.hint}>No photos on this job.</Text>}
          </ScrollView>

          <Label style={styles.section}>Materials</Label>
          {materials.length > 0 && (
            <Panel style={{ marginBottom: space[3] }}>
              {materials.map((l, i) => (
                <Row key={l.id} first={i === 0}>
                  <Text style={[styles.mono, styles.qty]}>{l.quantity}×</Text>
                  <Text style={[styles.rowText, { flex: 1 }]}>{l.description}</Text>
                  <Text style={styles.mono}>{pounds(l.unitPrice * l.quantity)}</Text>
                  {open && (
                    <Pressable onPress={() => tryIt(() => act.removeLine(job, l))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${l.description}`}>
                      <Text style={styles.remove}>×</Text>
                    </Pressable>
                  )}
                </Row>
              ))}
            </Panel>
          )}
          {open && (
            <>
              <View style={styles.matForm}>
                <Input value={mat.description} onChangeText={(description) => setMat({ ...mat, description })} placeholder="Part or material" style={{ flex: 1, minWidth: 0 }} />
                <Input value={mat.qty} onChangeText={(qty) => setMat({ ...mat, qty })} placeholder="Qty" keyboardType="number-pad" style={[styles.monoInput, { width: 52 }]} />
                <Input value={mat.price} onChangeText={(price) => setMat({ ...mat, price })} placeholder="£ each" keyboardType="decimal-pad" style={[styles.monoInput, { width: 80 }]} />
              </View>
              <View style={{ marginTop: space[2], alignSelf: 'flex-start' }}>
                <Action title="Log material" onPress={addMaterial} />
              </View>
            </>
          )}
          {!open && materials.length === 0 && <Text style={styles.hint}>No materials logged.</Text>}

          <Label style={styles.section}>Notes</Label>
          {open && (
            <View style={styles.noteBox}>
              <Input value={draft} onChangeText={setDraft} placeholder="What did you find, what's left?" multiline style={{ flex: 1 }} />
              <Action title="Add" onPress={addNote} />
            </View>
          )}
          {notes.map((n) => (
            <View key={n.id} style={styles.noteRow}>
              <Text style={styles.noteAt}>{clock(n.at)}</Text>
              <Text style={[styles.body, { flex: 1 }]}>{n.body}</Text>
            </View>
          ))}

          {beforeArrival && (
            <Pressable onPress={() => router.push({ pathname: '/no-access/[id]', params: { id: job.id } })} hitSlop={8} accessibilityRole="button" style={styles.cant}>
              <Text style={styles.cantText}>{copy.couldntGetIn}</Text>
            </Pressable>
          )}

          {!!problem && <Text style={styles.problem}>{problem}</Text>}
        </ScrollView>

        {docked && <Dock>{docked}</Dock>}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[6], paddingTop: space[2], paddingBottom: space[2] },
  scroll: { paddingHorizontal: space[6], paddingTop: space[4], paddingBottom: space[8] },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  ref: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11 },
  flag: { fontFamily: font.display, fontSize: 8, letterSpacing: tracking.label },
  title: { color: color.fg, fontFamily: font.sansSemi, fontSize: 24, lineHeight: 30, letterSpacing: -0.2, marginTop: space[2] },
  addr: { color: color.fgMuted, fontFamily: font.sans, fontSize: 13, marginTop: space[2], lineHeight: 18 },
  mono: { color: color.fgMuted, fontFamily: font.mono, fontSize: 12 },
  actions: { flexDirection: 'row', gap: space[2], marginTop: space[4] },
  note: { marginTop: space[4], padding: space[3], borderRadius: radius.lg, backgroundColor: glass, gap: space[2] },
  body: { color: color.fg, fontFamily: font.sans, fontSize: 13, lineHeight: 18 },
  section: { marginTop: space[8], marginBottom: space[3] },
  clocks: { flexDirection: 'row', marginTop: space[6], paddingVertical: space[4], paddingHorizontal: space[4], borderRadius: radius.xl, backgroundColor: color.inset },
  clockValue: { color: color.fg, fontFamily: font.monoMedium, fontSize: 24 },
  clockIdle: { color: color.fgMuted },
  clockLabel: { color: color.fgFaint, fontFamily: font.sansMedium, fontSize: 11, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowText: { color: color.fg, fontFamily: font.sansMedium, fontSize: 13 },
  detail: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, marginTop: 2 },
  checkState: { fontFamily: font.sansMedium, fontSize: 12 },
  hint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 12, marginTop: space[2] },
  qty: { width: 28 },
  remove: { color: color.fgFaint, fontFamily: font.sans, fontSize: 18, paddingLeft: space[1] },
  matForm: { flexDirection: 'row', gap: space[2] },
  monoInput: { fontFamily: font.mono, textAlign: 'center', paddingHorizontal: space[1] },
  stages: { flexDirection: 'row', gap: space[2], marginBottom: space[3] },
  stage: { paddingHorizontal: space[3], paddingVertical: 7, borderRadius: radius.pill, backgroundColor: color.inset },
  stageOn: { backgroundColor: color.raised },
  stageText: { color: color.fgFaint, fontFamily: font.display, fontSize: 8, letterSpacing: tracking.label },
  photos: { gap: space[2] },
  snap: { width: 88, height: 88, borderRadius: radius.lg, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
  snapPlus: { color: color.fg, fontFamily: font.sans, fontSize: 24 },
  snapText: { color: color.fgFaint, fontFamily: font.sans, fontSize: 11 },
  noteBox: { flexDirection: 'row', gap: space[2], alignItems: 'flex-end' },
  noteRow: { marginTop: space[3], flexDirection: 'row', gap: space[3] },
  noteAt: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, marginTop: 2, width: 40 },
  cant: { marginTop: space[10], alignSelf: 'flex-start', paddingHorizontal: space[4], paddingVertical: space[3], borderRadius: radius.lg, backgroundColor: color.inset },
  cantText: { color: color.fgMuted, fontFamily: font.sansSemi, fontSize: 14 },
  problem: { color: color.warn, fontFamily: font.sans, fontSize: 13, marginTop: space[4] },
  dockRow: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
});

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Cap, Chip, Choice, Go, Line, Num, openMaps, Plain, ring, ringName, Section, Segmented, StageTrack, Stepper, Tile, TopRow, type Verdict } from '@/components/ardent';
import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { Icon } from '@/components/Icon';
import { PhotoThumb } from '@/components/PhotoThumb';
import { pickPhoto } from '@/components/pickPhoto';
import { Back, Dock, Input } from '@/components/ui';
import type { ComplianceCheck, OperatorState, Photo, PriceItem } from '@/data/types';
import { gasGaps } from '@/engine/engine';
import { copy } from '@/kit/copy';
import { clock, pounds, window as slot } from '@/kit/format';
import { checkState, jobStatus, priority } from '@/kit/states';
import * as act from '@/sync/actions';
import { card, elapsed, hms, stageOf, useField, useNow } from '@/sync/hooks';
import { GAS_TRADES } from '@/sync/pull';
import { color, font, radius, space, toneColor } from '@/theme/tokens';

const STAGES: Photo['stage'][] = ['before', 'during', 'after'];
type Sheet = 'photo' | 'part' | 'note';
type PartFrom = 'van' | 'list' | 'other';
const PART_FROM: { key: PartFrom; label: string }[] = [
  { key: 'van', label: 'Van' },
  { key: 'list', label: 'Price list' },
  { key: 'other', label: 'Other' },
];

/** One check: a ring that ticks once it's answered, and Pass, Fail or N/A beside it. */
function CheckRow({ check, now, onPick }: { check: ComplianceCheck; now: boolean; onPick?: (v: Verdict) => void }) {
  const answered = check.state !== 'pending';
  const failed = check.state === 'fail';
  const st = checkState[check.state];
  return (
    <View style={styles.check}>
      <View style={[styles.ring, answered && !failed && styles.ringDone, failed && { backgroundColor: color.danger }, now && styles.ringNow]}>
        {answered && <Icon name={failed ? 'cross' : 'check'} size={13} tint={failed ? color.fg : color.bg} strokeWidth={2.2} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.checkLabel, !answered && !now && { color: color.fgMuted }]} numberOfLines={2}>
          {check.label}
        </Text>
        {check.detail ? <Text style={styles.checkDetail}>{check.detail}</Text> : null}
      </View>
      {onPick ? (
        <Choice value={answered ? (check.state as Verdict) : undefined} onChange={onPick} label={check.label} />
      ) : (
        <Text style={[styles.checkState, { color: toneColor[st.tone] }]}>{st.label.toUpperCase()}</Text>
      )}
    </View>
  );
}

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { state, day } = useField();
  const [sheet, setSheet] = useState<Sheet>();
  const [stage, setStage] = useState<Photo['stage']>();
  const [draft, setDraft] = useState('');
  const [mat, setMat] = useState({ description: '', qty: '1', price: '' });
  const [partFrom, setPartFrom] = useState<PartFrom>();
  const [picked, setPicked] = useState<{ item: PriceItem; qty: number }>();
  const [find, setFind] = useState('');
  const [problem, setProblem] = useState('');
  const job = day?.jobs.find((j) => j.id === id);
  const time = day?.time.filter((t) => t.jobId === id) ?? [];
  const running = time.find((t) => !t.end);
  const now = useNow(!!running);

  if (!day || !job) {
    return (
      <View style={styles.root}>
        <Atmosphere state="on_call" />
        <SafeAreaView style={{ flex: 1, padding: 22 }}>
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
  const mood: OperatorState = job.status === 'en_route' ? 'en_route' : job.status === 'on_site' ? 'on_site' : job.status === 'paused' ? 'delayed' : 'on_call';
  const answered = job.checks.filter((c) => c.state !== 'pending').length;
  const firstOpen = job.checks.find((c) => c.state === 'pending')?.key;
  // Before, during or after, from where the job is, unless the engineer picks.
  const shotStage = stage ?? (job.status === 'on_site' || job.status === 'paused' ? (photos.some((p) => p.stage === 'during') ? 'after' : 'during') : job.status === 'complete' ? 'after' : 'before');

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
      if (picked) await act.addPhoto(job, picked, shotStage);
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

  const toggle = (to: Sheet) => setSheet((s) => (s === to ? undefined : to));

  // What's on the van, by name, and the rest of the price list to search.
  const items = new Map(day.priceList.map((i) => [i.id, i]));
  const onVan = day.stock.flatMap((x) => (items.has(x.itemId) ? [{ item: items.get(x.itemId)!, quantity: x.quantity }] : [])).sort((a, b) => a.item.name.localeCompare(b.item.name));
  const from = partFrom ?? (onVan.some((x) => x.quantity > 0) ? 'van' : 'list');
  const words = find.trim().toLowerCase();
  const listed = day.priceList.filter((i) => i.kind === 'material' && (!words || `${i.name} ${i.code ?? ''}`.toLowerCase().includes(words))).slice(0, 8);
  const vanLeft = picked ? (onVan.find((x) => x.item.id === picked.item.id)?.quantity ?? 0) : 0;
  const logPicked = () => {
    if (!picked) return;
    const fromVan = from === 'van';
    setPicked(undefined);
    setFind('');
    void tryIt(() => act.usePart(job, picked.item, picked.qty, fromVan));
  };
  const pick = (item: PriceItem) => setPicked((p) => (p?.item.id === item.id ? undefined : { item, qty: 1 }));
  const chooseFrom = (k: PartFrom) => {
    setPartFrom(k);
    setPicked(undefined);
  };

  const gasJob = GAS_TRADES.has(job.trade);
  const reports = day.reports.filter((r) => r.jobId === job.id && r.operatorId === day.operator.id);
  const report = reports.find((r) => r.status === 'draft') ?? reports[0];
  const gasRecord = day.gasRecords.filter((r) => r.jobId === job.id).sort((a, b) => (a.status === 'draft' ? -1 : b.status === 'draft' ? 1 : 0))[0];
  const openGas = () =>
    tryIt(async () => {
      await act.startGasRecord(job);
      router.push({ pathname: '/gas/[id]', params: { id: job.id } });
    });

  const dock = () => {
    switch (job.status) {
      case 'booked':
        return <HoldToCommit label="Hold to set off" icon="route" onCommit={() => tryIt(() => act.setOff(job))} />;
      case 'en_route':
        return <HoldToCommit label="Hold, I've arrived" icon="pin" onCommit={() => tryIt(() => act.arrived(job))} />;
      case 'paused':
        return <HoldToCommit label={`Hold, ${copy.resume.toLowerCase()}`} icon="arrow" onCommit={() => tryIt(() => act.backOnIt(job))} />;
      case 'on_site':
        return (
          <HoldToCommit
            label="Hold to wrap up"
            icon="check"
            onCommit={() =>
              tryIt(async () => {
                await act.finish(job);
                router.replace({ pathname: '/wrap/[id]', params: { id: job.id } });
              })
            }
          />
        );
      case 'complete':
        return <Go label={copy.getSignOff} icon="arrow" onPress={() => router.push({ pathname: '/wrap/[id]', params: { id: job.id } })} />;
      case 'invoiced':
        return <Go label={copy.takePayment} icon="pound" onPress={() => router.push({ pathname: '/wrap/[id]', params: { id: job.id } })} />;
      default:
        return null;
    }
  };
  const docked = dock();

  const live = running?.kind;
  const big = live ? hms(elapsed(time, live, now)) : beforeArrival ? clock(job.start) : hms(elapsed(time, 'labour', now));
  const bigUnit = live === 'travel' ? 'travel' : live === 'labour' ? undefined : beforeArrival ? `to ${clock(job.end)}` : job.status === 'paused' ? 'paused' : 'on the tools';

  return (
    <View style={styles.root}>
      <Atmosphere state={mood} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.pad}>
          <TopRow
            left={
              <View style={styles.topLeft}>
                <Back label="Today" />
                <Chip label={s.label} tint={toneColor[s.tone]} />
              </View>
            }
            right={job.ref}
          />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeInDown.duration(400)}>
              <Num size={live === 'labour' ? 56 : 48} unit={bigUnit}>
                {big}
              </Num>
              <View style={styles.refRow}>
                {flag && <Cap tint={toneColor[flag.tone]}>{flag.label}</Cap>}
                {!beforeArrival && <Cap tint={color.fgFaint}>{slot(job.start, job.end)}</Cap>}
              </View>
              <Text style={styles.title}>{job.title}</Text>
              {customer && site && (
                <Text style={styles.addr}>
                  {customer.name}, {site.line1}, {site.town} {site.postcode}
                </Text>
              )}
            </Animated.View>

            <StageTrack at={stageOf(job.status)} style={{ marginTop: 22 }} />

            {(site || customer) && (
              <View style={styles.pair}>
                {site && <Plain title="Directions" icon="route" onPress={() => openMaps(`${site.line1}, ${site.postcode}`)} flex />}
                {customer && <Plain title={`Ring ${ringName(customer)}`} icon="phone" onPress={() => ring(customer.phone)} flex />}
              </View>
            )}

            {(site?.accessNotes || job.notes) && (
              <Card style={{ marginTop: 14, gap: 14 }}>
                {site?.accessNotes && (
                  <View style={{ gap: 6 }}>
                    <Cap>Getting in</Cap>
                    <Text style={styles.body}>{site.accessNotes}</Text>
                  </View>
                )}
                {job.notes && (
                  <View style={{ gap: 6 }}>
                    <Cap>From the office</Cap>
                    <Text style={styles.body}>{job.notes}</Text>
                  </View>
                )}
              </Card>
            )}

            {job.checks.length > 0 && (
              <>
                <Section label={`Checks · ${answered} of ${job.checks.length}`} />
                {job.checks.map((c) => (
                  <CheckRow key={c.key} check={c} now={open && c.key === firstOpen} onPick={open ? (v) => tryIt(() => act.setCheck(job, c.key, v, c.detail)) : undefined} />
                ))}
              </>
            )}

            {open && (
              <View style={styles.tiles}>
                <Tile icon="camera" label="Photo" onPress={() => toggle('photo')} />
                <Tile icon="box" label="Part used" onPress={() => toggle('part')} />
                <Tile icon="note" label="Note" onPress={() => toggle('note')} />
                {gasJob && <Tile icon="flame" label="CP12" onPress={openGas} />}
              </View>
            )}

            {gasRecord && (
              <Card style={{ marginTop: 8, paddingVertical: 2 }}>
                <Line
                  first
                  left={`Gas safety record${gasRecord.ref ? ` ${gasRecord.ref}` : ''}`}
                  sub={gasRecord.status === 'issued' ? `Issued, runs to ${new Date(`${gasRecord.expires}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : `${gasRecord.appliances.length} appliance${gasRecord.appliances.length === 1 ? '' : 's'}, ${gasGaps(gasRecord).length ? 'still to finish' : 'ready to issue'}`}
                  right={gasRecord.status === 'issued' ? 'Issued' : 'Draft'}
                  tint={gasRecord.status === 'issued' ? color.ok : color.fgMuted}
                  onPress={() => router.push({ pathname: '/gas/[id]', params: { id: job.id } })}
                />
              </Card>
            )}

            {(open || report) && (
              <Card style={{ marginTop: 8, paddingVertical: 2 }}>
                <Line
                  first
                  left="Job report"
                  sub={!report ? 'Hold and talk it through' : report.status === 'signed' ? `Signed at ${clock(report.signedAt ?? report.updatedAt)}` : report.missing.length ? `${report.missing.length} still to say` : 'Ready to sign off'}
                  right={!report ? <Icon name="mic" size={18} tint={color.fgMuted} /> : report.status === 'signed' ? 'Signed' : 'Draft'}
                  tint={report?.status === 'signed' ? color.ok : color.fgMuted}
                  onPress={() => router.push({ pathname: '/report/[id]', params: { id: job.id } })}
                />
              </Card>
            )}

            {sheet === 'photo' && (
              <Animated.View entering={FadeIn.duration(220)}>
                <Card style={styles.sheet}>
                  <Cap>Photo for</Cap>
                  <View style={styles.stages}>
                    {STAGES.map((st) => (
                      <Pressable key={st} onPress={() => setStage(st)} style={[styles.stage, shotStage === st && styles.stageOn]} accessibilityRole="radio" accessibilityState={{ checked: shotStage === st }}>
                        <Text style={[styles.stageText, shotStage === st && { color: color.bg }]}>{st[0].toUpperCase() + st.slice(1)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Plain title={`Take ${shotStage} photo`} icon="camera" onPress={snap} />
                </Card>
              </Animated.View>
            )}

            {sheet === 'part' && (
              <Animated.View entering={FadeIn.duration(220)}>
                <Card style={styles.sheet}>
                  <Cap>Part used</Cap>
                  <Segmented options={PART_FROM} value={from} onChange={chooseFrom} label="Where it came from" />
                  {from === 'van' &&
                    (onVan.length ? (
                      <View>
                        {onVan.map(({ item, quantity }, i) => (
                          <Line
                            key={item.id}
                            first={i === 0}
                            left={item.name}
                            sub={quantity ? `${quantity} on the van` : 'None left on the van'}
                            right={picked?.item.id === item.id ? <Icon name="check" size={18} /> : pounds(item.price)}
                            onPress={quantity ? () => pick(item) : undefined}
                            style={!quantity ? { opacity: 0.45 } : undefined}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.addr}>Nothing's down as on your van yet. The office keeps the van counts.</Text>
                    ))}
                  {from === 'list' && (
                    <>
                      <Input value={find} onChangeText={setFind} placeholder="Search parts" style={styles.sheetInput} accessibilityLabel="Search the price list" />
                      <View>
                        {listed.map((item, i) => (
                          <Line key={item.id} first={i === 0} left={item.name} sub={item.code} right={picked?.item.id === item.id ? <Icon name="check" size={18} /> : pounds(item.price)} onPress={() => pick(item)} />
                        ))}
                        {!listed.length && <Text style={styles.addr}>Nothing matches. Try Other to type it in.</Text>}
                      </View>
                    </>
                  )}
                  {from !== 'other' && picked && (
                    <View style={styles.pickBar}>
                      <Stepper value={picked.qty} onChange={(qty) => setPicked({ ...picked, qty })} max={from === 'van' ? vanLeft : undefined} label="Quantity" />
                      <Plain flex title="Log it" icon="box" onPress={logPicked} />
                    </View>
                  )}
                  {from === 'other' && (
                    <>
                      <Input value={mat.description} onChangeText={(description) => setMat({ ...mat, description })} placeholder="Part or material" style={styles.sheetInput} />
                      <View style={styles.pairInputs}>
                        <Input value={mat.qty} onChangeText={(qty) => setMat({ ...mat, qty })} placeholder="Qty" keyboardType="number-pad" style={[styles.sheetInput, styles.monoInput]} accessibilityLabel="Quantity" />
                        <Input value={mat.price} onChangeText={(price) => setMat({ ...mat, price })} placeholder="£ each" keyboardType="decimal-pad" style={[styles.sheetInput, styles.monoInput]} accessibilityLabel="Price each in pounds" />
                      </View>
                      <Plain title="Log it" icon="box" onPress={addMaterial} />
                    </>
                  )}
                </Card>
              </Animated.View>
            )}

            {sheet === 'note' && (
              <Animated.View entering={FadeIn.duration(220)}>
                <Card style={styles.sheet}>
                  <Cap>Note for the office</Cap>
                  <Input value={draft} onChangeText={setDraft} placeholder="What did you find, what's left?" multiline style={[styles.sheetInput, { minHeight: 96 }]} />
                  <Plain title="Add note" onPress={addNote} />
                </Card>
              </Animated.View>
            )}

            {photos.length > 0 && (
              <>
                <Section label={`Photos · ${photos.length}`} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {photos.map((p) => (
                    <PhotoThumb key={p.id} photo={p} waiting={uploading.has(p.id)} />
                  ))}
                </ScrollView>
              </>
            )}

            {materials.length > 0 && (
              <>
                <Section label="Parts used" />
                <Card style={{ paddingVertical: 2 }}>
                  {materials.map((l, i) => (
                    <Line
                      key={l.id}
                      first={i === 0}
                      left={`${l.quantity > 1 ? `${l.quantity}× ` : ''}${l.description}`}
                      sub={l.fromVan ? 'From the van' : undefined}
                      right={
                        <View style={styles.matRight}>
                          <Text style={styles.mono}>{pounds(l.unitPrice * l.quantity)}</Text>
                          {open && (
                            <Pressable onPress={() => tryIt(() => act.removeLine(job, l))} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Remove ${l.description}`}>
                              <Text style={styles.remove}>×</Text>
                            </Pressable>
                          )}
                        </View>
                      }
                    />
                  ))}
                </Card>
              </>
            )}

            {notes.length > 0 && (
              <>
                <Section label="Notes" />
                {notes.map((n) => (
                  <View key={n.id} style={styles.noteRow}>
                    <Text style={styles.noteAt}>{clock(n.at)}</Text>
                    <Text style={[styles.body, { flex: 1 }]}>{n.body}</Text>
                  </View>
                ))}
              </>
            )}

            <View style={styles.quiet}>
              {beforeArrival && <Plain quiet title={copy.couldntGetIn} icon="door" onPress={() => router.push({ pathname: '/no-access/[id]', params: { id: job.id } })} />}
              {job.status === 'on_site' && <Plain quiet title="Can't finish today? Pause it" icon="pause" onPress={() => tryIt(() => act.pause(job))} />}
            </View>

            {!!problem && <Text style={styles.problem}>{problem}</Text>}
          </ScrollView>
        </KeyboardAvoidingView>

        {docked && <Dock>{docked}</Dock>}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  pad: { paddingHorizontal: 22, paddingTop: space[3] },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  scroll: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: space[6] },
  refRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  title: { color: color.fg, fontFamily: font.sansMedium, fontSize: 19, marginTop: 8 },
  addr: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, marginTop: 6, lineHeight: 20 },
  pair: { flexDirection: 'row', gap: 8, marginTop: 20 },
  body: { color: color.fg, fontFamily: font.sans, fontSize: 14, lineHeight: 20 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 6 },
  ring: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: color.raised },
  ringDone: { backgroundColor: color.fgMuted },
  ringNow: { backgroundColor: color.bg, borderWidth: 1.5, borderColor: color.fg },
  checkLabel: { color: color.fg, fontFamily: font.sans, fontSize: 15 },
  checkDetail: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, marginTop: 3 },
  checkState: { fontFamily: font.mono, fontSize: 12, letterSpacing: 1 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 24 },
  sheet: { marginTop: 8, gap: 12 },
  sheetInput: { backgroundColor: color.raised },
  pairInputs: { flexDirection: 'row', gap: 8 },
  monoInput: { flex: 1, minWidth: 0, width: 0, fontFamily: font.mono },
  pickBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stages: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: radius.lg + 2, backgroundColor: color.inset },
  stage: { flex: 1, minHeight: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  stageOn: { backgroundColor: color.fg },
  stageText: { color: color.fgMuted, fontFamily: font.sansMedium, fontSize: 14 },
  matRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mono: { color: color.fgMuted, fontFamily: font.mono, fontSize: 13 },
  remove: { color: color.fgFaint, fontFamily: font.sans, fontSize: 20, paddingHorizontal: 4 },
  noteRow: { flexDirection: 'row', gap: 14, paddingVertical: 8 },
  noteAt: { color: color.fgFaint, fontFamily: font.mono, fontSize: 12, marginTop: 2, width: 44 },
  quiet: { marginTop: 24, alignItems: 'center' },
  problem: { color: color.warn, fontFamily: font.sans, fontSize: 14, marginTop: space[4] },
});

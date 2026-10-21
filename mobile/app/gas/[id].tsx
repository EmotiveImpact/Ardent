import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Cap, Chip, Choice, Go, Line, OpTitle, Plain, Section, Segmented, Stat, TopRow, type Verdict } from '@/components/ardent';
import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { Back, Dock, Input } from '@/components/ui';
import type { GasAppliance, GasInstallation, GasSafetyRecord } from '@/data/types';
import { gasGaps } from '@/engine/engine';
import * as act from '@/sync/actions';
import { card, useField } from '@/sync/hooks';
import { color, font, space } from '@/theme/tokens';

const FLUES: { key: GasAppliance['flue']; label: string }[] = [
  { key: 'room_sealed', label: 'Room sealed' },
  { key: 'open_flue', label: 'Open flue' },
  { key: 'flueless', label: 'Flueless' },
];
const CHECKS: { key: keyof GasAppliance['checks']; label: string }[] = [
  { key: 'flue', label: 'Flue' },
  { key: 'ventilation', label: 'Ventilation' },
  { key: 'safetyDevice', label: 'Safety device' },
  { key: 'spillage', label: 'Spillage' },
];
const INSTALLATION: { key: keyof GasInstallation; label: string }[] = [
  { key: 'tightness', label: 'Tightness test' },
  { key: 'ecv', label: 'Emergency control valve' },
  { key: 'bonding', label: 'Protective bonding' },
  { key: 'pipework', label: 'Pipework condition' },
  { key: 'coAlarm', label: 'CO alarm' },
];
const READINGS: { key: 'pressure' | 'heatInput' | 'co' | 'co2' | 'ratio'; label: string; unit: string }[] = [
  { key: 'pressure', label: 'Pressure', unit: 'mbar' },
  { key: 'heatInput', label: 'Heat input', unit: 'kW' },
  { key: 'co', label: 'CO', unit: 'ppm' },
  { key: 'co2', label: 'CO2', unit: '%' },
  { key: 'ratio', label: 'CO/CO2 ratio', unit: '' },
];
const SAFE = [
  { key: 'yes', label: 'Safe' },
  { key: 'no', label: 'Not safe' },
] as const;
const UNSAFE: { key: NonNullable<GasAppliance['unsafe']>; label: string }[] = [
  { key: 'at_risk', label: 'At risk' },
  { key: 'immediately_dangerous', label: 'Dangerous' },
];

type Form = Omit<GasAppliance, 'id' | 'pressure' | 'heatInput' | 'co' | 'co2' | 'ratio'> & { id?: string } & Record<(typeof READINGS)[number]['key'], string>;

const blank = (): Form => ({ location: '', type: '', flue: 'room_sealed', landlords: true, checks: { flue: 'pending', ventilation: 'pending', safetyDevice: 'pending', spillage: 'pending' }, pressure: '', heatInput: '', co: '', co2: '', ratio: '' });
const toForm = (a: GasAppliance): Form => ({ ...a, ...Object.fromEntries(READINGS.map((r) => [r.key, a[r.key] === undefined ? '' : String(a[r.key])])) }) as unknown as Form;
/** 21 Oct 2027: a record runs a year, so the year matters. */
const fullDate = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const num = (v: string) => {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/** Done, to do, or not safe, for the list. */
function standing(a: GasAppliance) {
  if (a.safe === false) return { label: a.unsafe === 'immediately_dangerous' ? 'Dangerous' : 'Not safe', tint: color.danger };
  const done = a.safe !== undefined && CHECKS.every((c) => a.checks[c.key] !== 'pending');
  return done ? { label: 'Done', tint: color.ok } : { label: 'To do', tint: color.fgFaint };
}

/** One appliance's readings and checks, as the engineer fills them in. */
function ApplianceForm({ start, isNew, onSave, onRemove, onClose }: { start: Form; isNew: boolean; onSave: (f: Form) => void; onRemove?: () => void; onClose: () => void }) {
  const [f, setF] = useState<Form>(start);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const name = f.type.trim() || 'appliance';
  return (
    <Animated.View entering={FadeIn.duration(220)}>
      <Card style={styles.form}>
        {isNew && (
          <>
            <Cap>New appliance</Cap>
            <Input value={f.type} onChangeText={(type) => set({ type })} placeholder="What it is: combi boiler, hob" style={styles.input} accessibilityLabel="Appliance" />
            <Input value={f.location} onChangeText={(location) => set({ location })} placeholder="Where: kitchen, cellar" style={styles.input} accessibilityLabel="Where it is" />
            <View style={styles.pair}>
              <Input value={f.make ?? ''} onChangeText={(make) => set({ make })} placeholder="Make" style={[styles.input, styles.half]} accessibilityLabel="Make" />
              <Input value={f.model ?? ''} onChangeText={(model) => set({ model })} placeholder="Model" style={[styles.input, styles.half]} accessibilityLabel="Model" />
            </View>
          </>
        )}
        <Cap>Flue</Cap>
        <Segmented options={FLUES} value={f.flue} onChange={(flue) => set({ flue })} label="Flue type" />
        <Cap>Readings</Cap>
        <View style={styles.readings}>
          {READINGS.map((r) => (
            <View key={r.key} style={styles.reading}>
              <Text style={styles.readingLabel}>
                {r.label}
                {r.unit ? <Text style={{ color: color.fgFaint }}> {r.unit}</Text> : null}
              </Text>
              <Input value={f[r.key]} onChangeText={(v) => set({ [r.key]: v } as Partial<Form>)} placeholder="–" keyboardType="decimal-pad" style={[styles.input, styles.mono]} accessibilityLabel={`${r.label} ${r.unit}`.trim()} />
            </View>
          ))}
        </View>
        <Cap>Checks</Cap>
        {CHECKS.map((c) => (
          <View key={c.key} style={styles.row}>
            <Text style={styles.rowLabel}>{c.label}</Text>
            <Choice value={f.checks[c.key] === 'pending' ? undefined : (f.checks[c.key] as Verdict)} onChange={(v) => set({ checks: { ...f.checks, [c.key]: v } })} label={c.label} />
          </View>
        ))}
        <Cap>Safe to use</Cap>
        <Segmented options={[...SAFE]} value={f.safe === undefined ? undefined : f.safe ? 'yes' : 'no'} onChange={(k) => set({ safe: k === 'yes', ...(k === 'yes' ? { unsafe: undefined } : {}) })} label={`Is the ${name} safe to use`} />
        {f.safe === false && (
          <>
            <Segmented options={UNSAFE} value={f.unsafe} onChange={(unsafe) => set({ unsafe })} label="How unsafe" />
            <Input value={f.defects ?? ''} onChangeText={(defects) => set({ defects })} placeholder="What's wrong, and what you did about it" multiline style={[styles.input, { minHeight: 88 }]} accessibilityLabel="What's wrong" />
          </>
        )}
        <Plain title={`Save ${name.toLowerCase()}`} icon="check" onPress={() => onSave(f)} />
        <View style={styles.formFoot}>
          <Plain quiet title="Close" onPress={onClose} />
          {onRemove && <Plain quiet title="Not here any more" onPress={onRemove} />}
        </View>
      </Card>
    </Animated.View>
  );
}

/**
 * The landlord gas safety record (CP12). It starts from last year's
 * appliances; the engineer takes the readings, answers the checks and issues
 * it, which puts the certificate on the site's list.
 */
export default function GasRecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { day } = useField();
  const [editing, setEditing] = useState<string>();
  const [problem, setProblem] = useState('');
  const job = day?.jobs.find((j) => j.id === id);
  const records = day?.gasRecords.filter((r) => r.jobId === id) ?? [];
  const rec: GasSafetyRecord | undefined = records.find((r) => r.status === 'draft') ?? records.at(-1);

  if (!day || !job || !rec) {
    return (
      <View style={styles.root}>
        <Atmosphere state="on_call" />
        <SafeAreaView style={{ flex: 1, padding: 22 }}>
          <Back label="Job" />
          <Text style={[styles.sub, { marginTop: space[8] }]}>There's no gas safety record on this job yet. Start one from the job.</Text>
        </SafeAreaView>
      </View>
    );
  }

  const { customer, site } = card(day, job);
  const draft = rec.status === 'draft';
  const last = day.gasRecords.filter((r) => r.siteId === rec.siteId && r.status === 'issued' && r.id !== rec.id).sort((a, b) => (b.issuedAt ?? '').localeCompare(a.issuedAt ?? ''))[0];
  const gaps = gasGaps(rec);
  const done = rec.appliances.filter((a) => standing(a).label === 'Done').length;
  const unsafe = rec.appliances.filter((a) => a.safe === false);

  const tryIt = async (fn: () => Promise<unknown>) => {
    try {
      setProblem('');
      await fn();
    } catch (e) {
      setProblem(String((e as Error).message ?? e));
    }
  };

  const save = (f: Form) =>
    tryIt(async () => {
      if (!f.type.trim() || !f.location.trim()) throw new Error('Say what the appliance is and where.');
      const readings = Object.fromEntries(READINGS.map((r) => [r.key, num(f[r.key])]));
      if (Object.values(readings).some((v) => v !== undefined && v < 0)) throw new Error('Readings are zero or more.');
      const { pressure: _p, heatInput: _h, co: _c, co2: _c2, ratio: _r, ...rest } = f;
      await act.saveAppliance(rec, { ...rest, ...readings, make: f.make || undefined, model: f.model || undefined, defects: f.defects || undefined });
      setEditing(undefined);
    });

  return (
    <View style={styles.root}>
      <Atmosphere state={draft ? 'on_site' : 'on_call'} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.pad}>
          <TopRow
            left={
              <View style={styles.topLeft}>
                <Back label="Job" />
                <Chip label={draft ? 'Draft' : 'Issued'} tint={draft ? color.fgMuted : color.ok} />
              </View>
            }
            right={rec.ref || 'CP12'}
          />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeInDown.duration(400)}>
              <OpTitle size={21}>Gas safety record</OpTitle>
              {customer && site && (
                <Text style={styles.sub}>
                  {customer.name}, {site.line1}, {site.postcode}
                </Text>
              )}
              {last && <Cap style={{ marginTop: 10 }} tint={color.fgFaint}>{`Last done ${fullDate(last.issuedAt!)} on ${last.ref}`}</Cap>}
            </Animated.View>

            {!draft && (
              <View style={styles.stats}>
                <Stat label="Issued" value={fullDate(rec.issuedAt!)} size={20} style={styles.stat} />
                <Stat label="Runs to" value={rec.expires ? fullDate(rec.expires) : '–'} size={20} style={styles.stat} />
              </View>
            )}

            {unsafe.length > 0 && (
              <Card style={{ marginTop: 18, gap: 6 }}>
                <Cap tint={color.danger}>{unsafe.length === 1 ? 'Unsafe appliance' : `${unsafe.length} unsafe appliances`}</Cap>
                <Text style={styles.body}>
                  {unsafe.map((a) => `${a.type}, ${a.location.toLowerCase()}`).join('; ')}. Make it safe, label it and tell the customer. The office sees it once the record is issued.
                </Text>
              </Card>
            )}

            <Section label={`Appliances · ${done} of ${rec.appliances.length} done`} />
            <Card style={{ paddingVertical: 2 }}>
              {rec.appliances.map((a, i) => {
                const st = standing(a);
                return (
                  <Line
                    key={a.id}
                    first={i === 0}
                    left={`${a.type}, ${a.location}`}
                    sub={[a.make, a.model].filter(Boolean).join(' ') || undefined}
                    right={st.label}
                    tint={st.tint}
                    onPress={draft ? () => setEditing((e) => (e === a.id ? undefined : a.id)) : undefined}
                  />
                );
              })}
              {!rec.appliances.length && <Line first left="No appliances yet" sub="Add each one you check." />}
            </Card>

            {draft && editing && editing !== 'new' && rec.appliances.some((a) => a.id === editing) && (
              <ApplianceForm
                key={editing}
                start={toForm(rec.appliances.find((a) => a.id === editing)!)}
                isNew={false}
                onSave={save}
                onClose={() => setEditing(undefined)}
                onRemove={() => tryIt(async () => (await act.removeAppliance(rec, rec.appliances.find((a) => a.id === editing)!), setEditing(undefined)))}
              />
            )}
            {draft && editing === 'new' && <ApplianceForm key="new" start={blank()} isNew onSave={save} onClose={() => setEditing(undefined)} />}
            {draft && !editing && (
              <View style={{ marginTop: 8 }}>
                <Plain title="Add an appliance" icon="plus" onPress={() => setEditing('new')} />
              </View>
            )}

            <Section label="Installation" />
            {INSTALLATION.map((c) => (
              <View key={c.key} style={styles.row}>
                <Text style={styles.rowLabel}>{c.label}</Text>
                {draft ? (
                  <Choice value={rec.installation[c.key] === 'pending' ? undefined : (rec.installation[c.key] as Verdict)} onChange={(v) => tryIt(() => act.setInstallation(rec, c.key, v, c.label))} label={c.label} />
                ) : (
                  <Text style={[styles.verdict, rec.installation[c.key] === 'fail' && { color: color.danger }]}>{rec.installation[c.key].toUpperCase()}</Text>
                )}
              </View>
            ))}

            {draft && gaps.length > 0 && (
              <>
                <Section label="Still to do" />
                {gaps.map((g) => (
                  <Text key={g} style={styles.gap}>
                    {g[0].toUpperCase() + g.slice(1)}
                  </Text>
                ))}
              </>
            )}

            {!!problem && <Text style={styles.problem}>{problem}</Text>}
          </ScrollView>
        </KeyboardAvoidingView>

        <Dock>
          {draft ? (
            <HoldToCommit label="Hold to issue CP12" icon="check" disabled={gaps.length > 0 || !!editing} onCommit={() => tryIt(() => act.issueGasRecord(rec, job))} />
          ) : (
            <Go label="Back to the job" icon="arrow" onPress={() => router.back()} />
          )}
        </Dock>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  pad: { paddingHorizontal: 22, paddingTop: space[3] },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  scroll: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: space[6] },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, marginTop: 8, lineHeight: 20 },
  body: { color: color.fg, fontFamily: font.sans, fontSize: 14, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 18 },
  stat: { flex: 1 },
  form: { marginTop: 8, gap: 12 },
  input: { backgroundColor: color.raised },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0, width: 0 },
  readings: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reading: { width: '48%', flexGrow: 1, gap: 6 },
  readingLabel: { color: color.fgMuted, fontFamily: font.sans, fontSize: 13 },
  mono: { fontFamily: font.mono },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 4 },
  rowLabel: { flex: 1, color: color.fg, fontFamily: font.sans, fontSize: 15 },
  verdict: { color: color.fgMuted, fontFamily: font.mono, fontSize: 12, letterSpacing: 1 },
  formFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  gap: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20, paddingVertical: 4 },
  problem: { color: color.warn, fontFamily: font.sans, fontSize: 14, marginTop: space[4] },
});

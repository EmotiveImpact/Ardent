import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Action } from '@/components/Action';
import { Atmosphere } from '@/components/Atmosphere';
import { HoldToEnter } from '@/components/HoldToEnter';
import { SignaturePad } from '@/components/SignaturePad';
import { ardent, field, invoiceTotals } from '@/data/client';
import { elapsed, hms } from '@/data/jobs';
import type { PaymentMethod } from '@/data/pending';
import type { Customer, Invoice, Job, Photo, Site, TimeEntry } from '@/data/types';
import { pounds } from '@/format';
import { useOperator } from '@/state/operator';
import { color, font, radius, space, tracking } from '@/theme/tokens';

type Step = 'review' | 'sign' | 'invoice' | 'done';
const STEPS: { id: Exclude<Step, 'done'>; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'sign', label: 'Sign' },
  { id: 'invoice', label: 'Invoice' },
];

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'card', label: 'Card' },
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'cash', label: 'Cash' },
];

const buzz = (type: Haptics.NotificationFeedbackType) => {
  if (Platform.OS !== 'web') Haptics.notificationAsync(type).catch(() => {});
};

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Row({ left, right, strong, faint }: { left: string; right: string; strong?: boolean; faint?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLeft, strong && styles.strong, faint && { color: color.fgMuted }]} numberOfLines={2}>
        {left}
      </Text>
      <Text style={[styles.rowRight, strong && styles.strongMono, faint && { color: color.fgMuted }]}>{right}</Text>
    </View>
  );
}

export default function WrapUp() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me, refresh } = useOperator();

  const [step, setStep] = useState<Step>('review');
  const [job, setJob] = useState<Job>();
  const [customer, setCustomer] = useState<Customer>();
  const [site, setSite] = useState<Site>();
  const [time, setTime] = useState<TimeEntry[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [svg, setSvg] = useState('');
  const [signedBy, setSignedBy] = useState('');
  const [invoice, setInvoice] = useState<Invoice>();
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [doneVia, setDoneVia] = useState<string>();
  const [warn, setWarn] = useState('');

  const load = useCallback(async () => {
    const j = await ardent.jobs.get(id);
    if (!j) return;
    const [c, s, t, p, inv] = await Promise.all([
      ardent.customers.get(j.customerId),
      ardent.sites.get(j.siteId),
      ardent.time.forJob(j.id),
      ardent.photos.forJob(j.id),
      ardent.invoices.forJob(j.id),
    ]);
    setJob(j);
    setCustomer(c);
    setSite(s);
    setTime(t);
    setPhotos(p);
    if (c && !signedBy) setSignedBy(c.name);
    if (inv[0]) setInvoice(inv[0]);
  }, [id, signedBy]);

  useEffect(() => {
    load();
    // Only on open; later loads are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!job || !me) return <View style={styles.root} />;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const now = Date.now();
  const materials = job.lines.filter((l) => l.kind === 'material');
  const pending = job.checks.filter((c) => c.state === 'pending' || c.state === 'fail');
  const totals = invoiceTotals(invoice ?? { lines: job.lines, vatRate: 2000 });

  const sign = () =>
    run(async () => {
      await field.signatures.add({ jobId: job.id, operatorId: me.id, signedBy: signedBy.trim(), svg, at: new Date().toISOString() });
      await field.setCheck(job.id, 'signature', 'pass', signedBy.trim());
      if (photos.length > 0) await field.setCheck(job.id, 'photos', 'pass', `${photos.length} taken`);
      const inv = invoice ?? (await field.invoices.create(job.id));
      setInvoice(inv);
      buzz(Haptics.NotificationFeedbackType.Success);
      setStep('invoice');
    });

  const send = (via: 'email' | 'sms') =>
    run(async () => {
      if (!invoice) return;
      setInvoice(await field.invoices.send(invoice.id, via));
      setDoneVia(via === 'sms' ? `Sent by text to ${customer?.phone}` : `Emailed to ${customer?.email ?? customer?.name}`);
      buzz(Haptics.NotificationFeedbackType.Success);
      refresh();
      setStep('done');
    });

  const pay = (method: PaymentMethod) =>
    run(async () => {
      if (!invoice) return;
      setInvoice(await field.invoices.recordPayment(invoice.id, totals.total - invoice.paidAmount, method));
      setDoneVia(`Paid by ${METHODS.find((m) => m.id === method)?.label.toLowerCase()}`);
      buzz(Haptics.NotificationFeedbackType.Success);
      refresh();
      setStep('done');
    });

  const at = STEPS.findIndex((s) => s.id === step);

  return (
    <View style={styles.root}>
      <Atmosphere mode={step === 'done' ? 'on_call' : 'workshop'} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => (step === 'sign' ? setStep('review') : router.back())}
            hitSlop={12}
            accessibilityRole="button"
            disabled={step === 'invoice' || step === 'done'}
          >
            <Text style={[styles.back, (step === 'invoice' || step === 'done') && { opacity: 0 }]}>‹ BACK</Text>
          </Pressable>
          <Text style={styles.ref}>{job.ref}</Text>
        </View>

        {step !== 'done' && (
          <View style={styles.steps}>
            {STEPS.map((s, i) => (
              <View key={s.id} style={styles.stepItem}>
                <View style={[styles.stepBar, i <= at && { backgroundColor: i === at ? color.ember : color.fg }]} />
                <Text style={[styles.stepText, i === at && { color: color.fg }]}>
                  {String(i + 1).padStart(2, '0')} {s.label.toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        )}

        {step === 'review' && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(420)}>
              <Text style={styles.title}>JOB DONE</Text>
              <Text style={styles.sub}>
                {job.title} for {customer?.name}
                {site ? `, ${site.line1}` : ''}
              </Text>
            </Animated.View>

            <View style={styles.clocks}>
              <View style={{ flex: 1 }}>
                <Text style={styles.clockValue}>{hms(elapsed(time, 'travel', now))}</Text>
                <Text style={styles.clockLabel}>Travel</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clockValue}>{hms(elapsed(time, 'labour', now))}</Text>
                <Text style={styles.clockLabel}>On the tools</Text>
              </View>
              <View style={{ flex: 0.6 }}>
                <Text style={styles.clockValue}>{photos.length}</Text>
                <Text style={styles.clockLabel}>Photos</Text>
              </View>
            </View>

            <Label>WORK</Label>
            <View style={styles.panel}>
              {job.lines.map((l) => (
                <Row key={l.id} left={`${l.quantity > 1 ? `${l.quantity}× ` : ''}${l.description}`} right={pounds(l.quantity * l.unitPrice)} />
              ))}
              {job.lines.length === 0 && <Row left="Nothing logged yet" right="" faint />}
            </View>
            {materials.length === 0 && <Text style={styles.hint}>No materials logged. Go back to add any before the customer signs.</Text>}

            {pending.length > 0 && (
              <>
                <Label>STILL OPEN</Label>
                <View style={styles.panel}>
                  {pending.map((c) => (
                    <View key={c.key} style={styles.row}>
                      <View style={styles.openRow}>
                        <View style={[styles.dot, { backgroundColor: c.state === 'fail' ? color.danger : color.warn }]} />
                        <Text style={styles.rowLeft}>{c.label}</Text>
                      </View>
                      <Text style={styles.rowRight}>{c.detail ?? c.state}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.hint}>Office sees these as open. You can still get sign-off.</Text>
              </>
            )}
          </ScrollView>
        )}

        {step === 'sign' && (
          <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={false} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeInDown.duration(380)}>
              <Text style={styles.title}>HAND IT OVER</Text>
              <Text style={styles.sub}>
                {customer?.name}, please sign to confirm the work is done. The total is{' '}
                <Text style={styles.monoStrong}>{pounds(totals.total)}</Text> including VAT.
              </Text>
            </Animated.View>
            <View style={{ marginTop: space[6] }}>
              <SignaturePad
                onChange={(v) => {
                  setSvg(v);
                  if (v) setWarn('');
                }}
              />
            </View>
            <Label>NAME</Label>
            <TextInput value={signedBy} onChangeText={setSignedBy} style={styles.input} placeholder="Who is signing" placeholderTextColor={color.fgFaint} />
            {!!warn && <Text style={[styles.hint, { color: color.warn }]}>{warn}</Text>}
          </ScrollView>
        )}

        {step === 'invoice' && invoice && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(420)}>
              <Text style={styles.ref}>{invoice.ref}</Text>
              <Text style={[styles.total]}>{pounds(totals.total)}</Text>
              <Text style={styles.sub}>Signed by {signedBy}. Due in 14 days if not paid now.</Text>
            </Animated.View>
            <Label>INVOICE</Label>
            <View style={styles.panel}>
              {invoice.lines.map((l) => (
                <Row key={l.id} left={`${l.quantity > 1 ? `${l.quantity}× ` : ''}${l.description}`} right={pounds(l.quantity * l.unitPrice)} />
              ))}
              <View style={styles.rule} />
              <Row left="Net" right={pounds(totals.net)} faint />
              <Row left={`VAT ${invoice.vatRate / 100}%`} right={pounds(totals.vat)} faint />
              <Row left="Total" right={pounds(totals.total)} strong />
            </View>

            {paying && (
              <Animated.View entering={FadeInUp.duration(300)}>
                <Label>HOW ARE THEY PAYING?</Label>
                <View style={styles.methods}>
                  {METHODS.map((m) => (
                    <Action key={m.id} title={m.label} onPress={() => pay(m.id)} disabled={busy} flex />
                  ))}
                </View>
              </Animated.View>
            )}
          </ScrollView>
        )}

        {step === 'done' && invoice && (
          <View style={styles.done}>
            <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.badge}>
              <Text style={styles.badgeTick}>✓</Text>
            </Animated.View>
            <Animated.Text entering={FadeInDown.delay(150).duration(420)} style={styles.doneTitle}>
              {invoice.status === 'paid' ? 'PAID' : 'INVOICED'}
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(250).duration(420)} style={styles.doneAmount}>
              {pounds(invoice.status === 'paid' ? invoice.paidAmount : totals.total)}
            </Animated.Text>
            <Animated.Text entering={FadeIn.delay(400).duration(500)} style={styles.sub}>
              {doneVia}. {job.ref} {invoice.status === 'paid' ? 'is settled in full' : 'now shows as invoiced in the office'}.
            </Animated.Text>
          </View>
        )}

        <View style={styles.dock}>
          {step === 'review' && <Action title="Get sign-off" tone="ember" onPress={() => setStep('sign')} />}
          {step === 'sign' && <HoldToEnter label={busy ? 'SAVING' : 'HOLD TO CONFIRM SIGN-OFF'} onEnter={() => {
                if (!svg || !signedBy.trim()) {
                  setWarn(!svg ? 'Get a signature first.' : 'Add the name of who signed.');
                  buzz(Haptics.NotificationFeedbackType.Warning);
                  return;
                }
                setWarn('');
                sign();
              }} />}
          {step === 'invoice' && (
            <View style={{ gap: space[2] }}>
              <Action title={paying ? 'Not now' : 'Take payment now'} tone={paying ? 'ghost' : 'ember'} onPress={() => setPaying((p) => !p)} />
              <View style={styles.methods}>
                <Action title="Send by text" onPress={() => send('sms')} disabled={busy} flex />
                <Action title="Email it" onPress={() => send('email')} disabled={busy} flex />
              </View>
            </View>
          )}
          {step === 'done' && <Action title="Back to today" tone="ember" onPress={() => router.dismissTo('/today')} />}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[6], paddingTop: space[2] },
  back: { color: color.fgMuted, fontFamily: font.display, fontSize: 10, letterSpacing: tracking.label },
  ref: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11 },
  steps: { flexDirection: 'row', gap: space[2], paddingHorizontal: space[6], marginTop: space[4] },
  stepItem: { flex: 1 },
  stepBar: { height: 2, borderRadius: 1, backgroundColor: color.lineStrong },
  stepText: { color: color.fgFaint, fontFamily: font.display, fontSize: 7.5, letterSpacing: tracking.label, marginTop: space[2] },
  scroll: { paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[8] },
  title: { color: color.fg, fontFamily: font.display, fontSize: 28, letterSpacing: tracking.display },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20, marginTop: space[2] },
  monoStrong: { color: color.fg, fontFamily: font.monoMedium },
  label: { color: color.fgFaint, fontFamily: font.display, fontSize: 9, letterSpacing: tracking.label * 1.5, marginTop: space[8], marginBottom: space[3] },
  hint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 12, marginTop: space[2] },
  clocks: { flexDirection: 'row', marginTop: space[6], paddingVertical: space[4], borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.line },
  clockValue: { color: color.fg, fontFamily: font.monoMedium, fontSize: 18 },
  clockLabel: { color: color.fgFaint, fontFamily: font.sansMedium, fontSize: 11, marginTop: 4 },
  panel: { borderRadius: radius.xl, backgroundColor: 'rgba(17,17,17,0.72)', borderWidth: StyleSheet.hairlineWidth, borderColor: color.line, paddingHorizontal: space[4], paddingVertical: space[1] },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3], paddingVertical: space[2] + 2 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowLeft: { flexShrink: 1, color: color.fg, fontFamily: font.sans, fontSize: 13 },
  rowRight: { color: color.fgMuted, fontFamily: font.mono, fontSize: 12 },
  strong: { fontFamily: font.sansSemi, fontSize: 15 },
  strongMono: { color: color.fg, fontFamily: font.monoMedium, fontSize: 15 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginVertical: space[1] },
  input: {
    color: color.fg,
    fontFamily: font.sans,
    fontSize: 15,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    borderRadius: radius.lg,
    backgroundColor: color.inset,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
  },
  total: { color: color.fg, fontFamily: font.monoMedium, fontSize: 44, marginTop: space[2], letterSpacing: -1 },
  methods: { flexDirection: 'row', gap: space[2] },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[8] },
  badge: { width: 76, height: 76, borderRadius: 38, backgroundColor: color.ember, alignItems: 'center', justifyContent: 'center' },
  badgeTick: { color: color.bg, fontSize: 34, fontFamily: font.sansSemi, marginTop: -2 },
  doneTitle: { color: color.fg, fontFamily: font.display, fontSize: 34, letterSpacing: tracking.display * 2, marginTop: space[6] },
  doneAmount: { color: color.fg, fontFamily: font.monoMedium, fontSize: 28, marginTop: space[2] },
  dock: { paddingHorizontal: space[6], paddingTop: space[3], paddingBottom: space[2], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, backgroundColor: 'rgba(7,7,7,0.85)' },
});

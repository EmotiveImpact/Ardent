import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Action } from '@/components/Action';
import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { SignaturePad } from '@/components/SignaturePad';
import { Back, Dock, Input, Label, Panel } from '@/components/ui';
import type { LineItem, PaymentMethod } from '@/data/types';
import { copy } from '@/kit/copy';
import { longDate, pounds, totals } from '@/kit/format';
import { checkState } from '@/kit/states';
import * as act from '@/sync/actions';
import { card, elapsed, hms, jobInvoice, useField } from '@/sync/hooks';
import { color, font, radius, space, toneColor, tracking } from '@/theme/tokens';

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

function Line({ left, right, strong, faint, first }: { left: string; right: string; strong?: boolean; faint?: boolean; first?: boolean }) {
  return (
    <View style={[styles.row, !first && styles.divider]}>
      <Text style={[styles.rowLeft, strong && styles.strong, faint && { color: color.fgMuted }]} numberOfLines={2}>
        {left}
      </Text>
      <Text style={[styles.rowRight, strong && styles.strongMono, faint && { color: color.fgMuted }]}>{right}</Text>
    </View>
  );
}

const lineText = (l: LineItem) => `${l.quantity > 1 ? `${l.quantity}× ` : ''}${l.description}`;

export default function WrapUp() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { day } = useField();
  const job = day?.jobs.find((j) => j.id === id);
  const invoice = day && job ? jobInvoice(day, job.id) : undefined;
  const signature = day?.signatures.filter((s) => s.jobId === id).at(-1);

  // Pick up where the job is: signed already goes to the invoice, settled goes to the end.
  const [step, setStep] = useState<Step>(() => (invoice?.status === 'paid' ? 'done' : signature || invoice ? 'invoice' : 'review'));
  const [svg, setSvg] = useState('');
  const [signedBy, setSignedBy] = useState('');
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [how, setHow] = useState<string>();
  const [warn, setWarn] = useState('');

  if (!day || !job) return <View style={styles.root} />;
  const { customer, site } = card(day, job);
  const who = signedBy || customer?.name || '';
  const time = day.time.filter((t) => t.jobId === job.id);
  const photos = day.photos.filter((p) => p.jobId === job.id);
  const open = job.checks.filter((c) => c.state === 'pending' || c.state === 'fail');
  const sums = totals(invoice ?? { lines: job.lines, vatRate: 2000 });
  const now = Date.now();

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setWarn(String((e as Error).message ?? e));
      buzz(Haptics.NotificationFeedbackType.Warning);
    } finally {
      setBusy(false);
    }
  };

  const sign = () => {
    if (!svg || !who.trim()) {
      setWarn(!svg ? 'Get a signature first.' : 'Add the name of who signed.');
      buzz(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setWarn('');
    void run(async () => {
      await act.signOff(job, who.trim(), svg);
      if (!invoice) await act.raiseInvoice(job);
      setStep('invoice');
    });
  };

  const later = () =>
    run(async () => {
      if (!invoice) return;
      await act.payLater(invoice.id, job.ref);
      setHow('later');
      setStep('done');
    });

  const pay = (method: PaymentMethod) =>
    run(async () => {
      if (!invoice) return;
      await act.takePayment(invoice.id, job.ref, method);
      setHow(`Paid by ${METHODS.find((m) => m.id === method)!.label.toLowerCase()}`);
      buzz(Haptics.NotificationFeedbackType.Success);
      setStep('done');
    });

  const at = STEPS.findIndex((s) => s.id === step);
  const paid = invoice?.status === 'paid';
  const owed = invoice ? sums.total - invoice.paidAmount : sums.total;

  return (
    <View style={styles.root}>
      <Atmosphere state={step === 'done' ? (paid ? 'on_site' : 'on_call') : 'workshop'} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          {step === 'review' || step === 'sign' ? <Back label={step === 'sign' ? 'Review' : job.ref} onPress={step === 'sign' ? () => setStep('review') : undefined} /> : <View />}
          <Text style={styles.ref}>{job.ref}</Text>
        </View>

        {step !== 'done' && (
          <View style={styles.steps}>
            {STEPS.map((s, i) => (
              <View key={s.id} style={{ flex: 1 }}>
                <View style={[styles.stepBar, i <= at && { backgroundColor: i === at ? color.fg : color.fgMuted }]} />
                <Text style={[styles.stepText, i === at && { color: color.fg }]}>
                  {String(i + 1).padStart(2, '0')} {s.label.toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        )}

        {step === 'review' && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(400)}>
              <Text style={styles.title}>JOB DONE</Text>
              <Text style={styles.sub}>
                {job.title}
                {customer ? ` for ${customer.name}` : ''}
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
                <Text style={styles.clockLabel}>{copy.onTheTools}</Text>
              </View>
              <View style={{ flex: 0.6 }}>
                <Text style={styles.clockValue}>{photos.length}</Text>
                <Text style={styles.clockLabel}>Photos</Text>
              </View>
            </View>

            <Label style={styles.section}>Work</Label>
            <Panel>
              {job.lines.map((l, i) => (
                <Line key={l.id} first={i === 0} left={lineText(l)} right={pounds(l.quantity * l.unitPrice)} />
              ))}
              {job.lines.length === 0 && <Line first left="Nothing logged yet" right="" faint />}
            </Panel>
            {!job.lines.some((l) => l.kind === 'material') && <Text style={styles.hint}>No materials logged. Go back to add any before the customer signs.</Text>}

            {open.length > 0 && (
              <>
                <Label style={styles.section}>Still open</Label>
                <Panel>
                  {open.map((c, i) => (
                    <View key={c.key} style={[styles.row, i > 0 && styles.divider]}>
                      <View style={styles.openRow}>
                        <View style={[styles.dot, { backgroundColor: toneColor[c.state === 'fail' ? 'danger' : 'warn'] }]} />
                        <Text style={styles.rowLeft}>{c.label}</Text>
                      </View>
                      <Text style={styles.rowRight}>{c.detail ?? checkState[c.state].label}</Text>
                    </View>
                  ))}
                </Panel>
                <Text style={styles.hint}>The office sees these as open. You can still get sign-off.</Text>
              </>
            )}
          </ScrollView>
        )}

        {step === 'sign' && (
          <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={false} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeInDown.duration(380)}>
              <Text style={styles.title}>{copy.handItOver.toUpperCase()}</Text>
              <Text style={styles.sub}>
                {customer?.name ?? 'Customer'}, please sign to say the work is done. The total is <Text style={styles.monoStrong}>{pounds(sums.total)}</Text> including VAT.
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
            <Label style={styles.section}>Name</Label>
            <Input value={who} onChangeText={setSignedBy} placeholder="Who is signing" />
            {!!warn && <Text style={[styles.hint, { color: color.warn }]}>{warn}</Text>}
          </ScrollView>
        )}

        {step === 'invoice' && invoice && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(400)}>
              <Text style={styles.ref}>{invoice.ref || 'Invoice number comes from the office'}</Text>
              <Text style={styles.total}>{pounds(owed)}</Text>
              <Text style={styles.sub}>
                {signature || who ? `Signed by ${signature?.signedBy ?? who}. ` : ''}
                {invoice.paidAmount > 0 ? `${pounds(invoice.paidAmount)} paid so far. ` : ''}Due in 14 days if not paid now.
              </Text>
            </Animated.View>
            <Label style={styles.section}>Invoice</Label>
            <Panel>
              {invoice.lines.map((l, i) => (
                <Line key={l.id} first={i === 0} left={lineText(l)} right={pounds(l.quantity * l.unitPrice)} />
              ))}
              <Line left="Net" right={pounds(sums.net)} faint />
              <Line left={`VAT ${invoice.vatRate / 100}%`} right={pounds(sums.vat)} faint />
              <Line left="Total" right={pounds(sums.total)} strong />
            </Panel>
            {paying && (
              <Animated.View entering={FadeInUp.duration(300)}>
                <Label style={styles.section}>How did they pay?</Label>
                <View style={styles.methods}>
                  {METHODS.map((m) => (
                    <Action key={m.id} title={m.label} onPress={() => pay(m.id)} disabled={busy} flex />
                  ))}
                </View>
                <Text style={styles.hint}>This records the payment. Taking cards through Ardent comes later.</Text>
              </Animated.View>
            )}
            {!!warn && <Text style={[styles.hint, { color: color.warn }]}>{warn}</Text>}
          </ScrollView>
        )}

        {step === 'invoice' && !invoice && (
          <View style={styles.done}>
            <Text style={styles.sub}>Making the invoice.</Text>
          </View>
        )}

        {step === 'done' && invoice && (
          <View style={styles.done}>
            {paid ? (
              <>
                <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.badge}>
                  <Text style={styles.badgeTick}>✓</Text>
                </Animated.View>
                <Animated.Text entering={FadeInDown.delay(150).duration(420)} style={styles.doneTitle}>
                  PAID
                </Animated.Text>
                <Animated.Text entering={FadeInDown.delay(250).duration(420)} style={styles.doneAmount}>
                  {pounds(invoice.paidAmount)}
                </Animated.Text>
                <Animated.Text entering={FadeIn.delay(400).duration(500)} style={[styles.sub, { textAlign: 'center' }]}>
                  {how ? `${how}. ` : ''}
                  {job.ref} is settled in full.
                </Animated.Text>
              </>
            ) : (
              <>
                <Animated.Text entering={FadeInDown.duration(420)} style={styles.doneTitle}>
                  INVOICED
                </Animated.Text>
                <Animated.Text entering={FadeInDown.delay(100).duration(420)} style={styles.doneAmount}>
                  {pounds(owed)}
                </Animated.Text>
                <Animated.Text entering={FadeIn.delay(300).duration(500)} style={[styles.sub, { textAlign: 'center' }]}>
                  {invoice.dueAt ? `Due ${longDate(invoice.dueAt)}. ` : ''}The office has it and follows it up.
                </Animated.Text>
              </>
            )}
          </View>
        )}

        <Dock>
          {step === 'review' && <Action title={copy.getSignOff} tone="ember" onPress={() => setStep('sign')} />}
          {step === 'sign' && <HoldToCommit label={busy ? 'Saving' : 'Hold to confirm sign-off'} onCommit={sign} />}
          {step === 'invoice' && invoice && (
            <View style={{ gap: space[2] }}>
              <Action title={paying ? 'Not now' : copy.takePayment} tone={paying ? 'plain' : 'ember'} onPress={() => setPaying((p) => !p)} />
              {!paying && invoice.status === 'draft' && <Action title="They’ll pay later" onPress={later} disabled={busy} />}
              {!paying && invoice.status !== 'draft' && (
                <Pressable onPress={() => router.dismissTo('/today')} style={styles.textButton} accessibilityRole="button">
                  <Text style={styles.textButtonText}>Back to today</Text>
                </Pressable>
              )}
            </View>
          )}
          {step === 'done' && <Action title="Back to today" tone={paid ? 'plain' : 'ember'} onPress={() => router.dismissTo('/today')} />}
        </Dock>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[6], paddingTop: space[2], minHeight: 28 },
  ref: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11 },
  steps: { flexDirection: 'row', gap: space[2], paddingHorizontal: space[6], marginTop: space[4] },
  stepBar: { height: 2, borderRadius: 1, backgroundColor: color.raised },
  stepText: { color: color.fgFaint, fontFamily: font.display, fontSize: 7.5, letterSpacing: tracking.label, marginTop: space[2] },
  scroll: { paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[8] },
  title: { color: color.fg, fontFamily: font.display, fontSize: 28, letterSpacing: tracking.display },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20, marginTop: space[2] },
  monoStrong: { color: color.fg, fontFamily: font.monoMedium },
  section: { marginTop: space[8], marginBottom: space[3] },
  hint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 12, marginTop: space[2] },
  clocks: { flexDirection: 'row', marginTop: space[6], paddingVertical: space[4], paddingHorizontal: space[4], borderRadius: radius.xl, backgroundColor: color.inset },
  clockValue: { color: color.fg, fontFamily: font.monoMedium, fontSize: 17 },
  clockLabel: { color: color.fgFaint, fontFamily: font.sansMedium, fontSize: 11, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3], paddingVertical: space[3] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], flex: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowLeft: { flexShrink: 1, color: color.fg, fontFamily: font.sans, fontSize: 13 },
  rowRight: { color: color.fgMuted, fontFamily: font.mono, fontSize: 12 },
  strong: { fontFamily: font.sansSemi, fontSize: 15 },
  strongMono: { color: color.fg, fontFamily: font.monoMedium, fontSize: 15 },
  total: { color: color.fg, fontFamily: font.monoMedium, fontSize: 44, marginTop: space[2], letterSpacing: -1 },
  methods: { flexDirection: 'row', gap: space[2] },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[8] },
  badge: { width: 76, height: 76, borderRadius: 38, backgroundColor: color.ember, alignItems: 'center', justifyContent: 'center' },
  badgeTick: { color: color.bg, fontSize: 34, fontFamily: font.sansSemi, marginTop: -2 },
  doneTitle: { color: color.fg, fontFamily: font.display, fontSize: 34, letterSpacing: tracking.display * 2, marginTop: space[6] },
  doneAmount: { color: color.fg, fontFamily: font.monoMedium, fontSize: 28, marginTop: space[2] },
  textButton: { alignItems: 'center', paddingVertical: space[3] },
  textButtonText: { color: color.fgMuted, fontFamily: font.sansSemi, fontSize: 14 },
});

import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Cap, Chip, Go, Line, Num, OpTitle, Radio, Section, StageTrack, Stat, TopRow } from '@/components/ardent';
import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { Icon } from '@/components/Icon';
import { SignaturePad } from '@/components/SignaturePad';
import { type Settled, TakePayment } from '@/components/TakePayment';
import { Back, Dock, Input } from '@/components/ui';
import type { LineItem, PaymentMethod } from '@/data/types';
import { copy } from '@/kit/copy';
import { clock, duration, longDate, pounds, totals } from '@/kit/format';
import { checkState, jobStatus, toneColor } from '@/kit/states';
import { takesPayments } from '@/payments/pay';
import * as act from '@/sync/actions';
import { card, elapsed, jobInvoice, nextUp, today, useField } from '@/sync/hooks';
import { color, font, radius, space } from '@/theme/tokens';

type Step = 'review' | 'sign' | 'invoice' | 'done';
const STEPS = ['Check', 'Sign', 'Pay'];
type How = PaymentMethod | 'later';

const METHODS: { id: How; label: string }[] = [
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'card', label: 'Card, own reader' },
  { id: 'cash', label: 'Cash' },
  { id: 'later', label: 'Paying later' },
];

const buzz = (type: Haptics.NotificationFeedbackType) => {
  if (Platform.OS !== 'web') Haptics.notificationAsync(type).catch(() => {});
};

const lineText = (l: LineItem) => `${l.quantity > 1 ? `${l.quantity}× ` : ''}${l.description}`;

export default function WrapUp() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { day } = useField();
  const job = day?.jobs.find((j) => j.id === id);
  const invoice = day && job ? jobInvoice(day, job.id) : undefined;
  const signature = day?.signatures.filter((s) => s.jobId === id).at(-1);
  const report = day?.reports.find((r) => r.jobId === id && r.operatorId === day.operator.id && r.status === 'signed') ?? day?.reports.find((r) => r.jobId === id && r.operatorId === day.operator.id);

  // Pick up where the job is: signed already goes to the invoice, settled goes to the end.
  const [step, setStep] = useState<Step>(() => (invoice?.status === 'paid' ? 'done' : signature || invoice ? 'invoice' : 'review'));
  const [svg, setSvg] = useState('');
  const [signedBy, setSignedBy] = useState('');
  const [method, setMethod] = useState<How>();
  const [busy, setBusy] = useState(false);
  const [how, setHow] = useState<{ label: string; at: string; paid?: boolean; amount?: number }>();
  const [warn, setWarn] = useState('');

  if (!day || !job) return <View style={styles.root} />;
  const { customer, site } = card(day, job);
  const who = signedBy || customer?.name || '';
  const time = day.time.filter((t) => t.jobId === job.id);
  const photos = day.photos.filter((p) => p.jobId === job.id);
  const answered = job.checks.filter((c) => c.state !== 'pending').length;
  const open = job.checks.filter((c) => c.state === 'pending' || c.state === 'fail');
  const sums = totals(invoice ?? { lines: job.lines, vatRate: 2000 });
  const now = Date.now();
  const onSite = duration(elapsed(time, 'labour', now));
  const me = day.operator.name.split(' ')[0];
  const nextJob = nextUp(today(day).filter((j) => j.id !== job.id));
  const s = jobStatus[job.status];

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

  const settle = () => {
    if (!invoice) return;
    if (!method) {
      setWarn('Pick how they are paying.');
      buzz(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setWarn('');
    void run(async () => {
      if (method === 'later') await act.payLater(invoice.id, job.ref);
      else {
        await act.takePayment(invoice.id, job.ref, method);
        buzz(Haptics.NotificationFeedbackType.Success);
      }
      setHow({ label: METHODS.find((m) => m.id === method)!.label.split(',')[0], at: new Date().toISOString() });
      setStep('done');
    });
  };

  const at = step === 'review' ? 0 : step === 'sign' ? 1 : 2;
  const paid = invoice?.status === 'paid';
  const owed = invoice ? sums.total - invoice.paidAmount : sums.total;
  const methods = METHODS.filter((m) => m.id !== 'later' || invoice?.status === 'draft');
  // The firm takes payments through Ardent: Tap to Pay, the QR code and the text link come first.
  const takes = takesPayments(day);
  const testMode = takes && day.pay?.test;
  const settled = (r: Settled) => {
    setHow({ label: r.label, at: new Date().toISOString(), paid: r.paid, amount: r.amount });
    setStep('done');
  };
  // Paid on the phone straight away, or by Stripe a moment later: the end screen shows it either way.
  const paidNow = paid || (step === 'done' && !!how?.paid);
  const invoiceCard = invoice && (
    <Animated.View entering={FadeInDown.duration(400)}>
      <Card style={styles.list}>
        {invoice.lines.map((l, i) => (
          <Line key={l.id} first={i === 0} left={lineText(l)} right={pounds(l.quantity * l.unitPrice)} />
        ))}
        <Line left={`VAT ${invoice.vatRate / 100}%`} right={pounds(sums.vat)} tint={color.fgFaint} />
        {invoice.paidAmount > 0 && <Line left="Paid so far" right={`-${pounds(invoice.paidAmount)}`} tint={color.fgFaint} />}
        <View style={styles.toPay}>
          <Cap>To pay</Cap>
          <Num size={34}>{pounds(owed)}</Num>
        </View>
      </Card>
    </Animated.View>
  );
  const ref = step === 'invoice' && invoice?.ref ? invoice.ref : `${job.ref}   ${clock(new Date(now).toISOString())}`;

  return (
    <View style={styles.root}>
      <Atmosphere state={step === 'done' ? 'on_site' : 'workshop'} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.pad}>
          <TopRow
            left={step === 'review' || step === 'sign' ? <Back label={step === 'sign' ? 'Check' : job.ref} onPress={step === 'sign' ? () => setStep('review') : undefined} /> : <Chip label={step === 'done' ? (paidNow ? 'Paid' : 'Invoiced') : s.label} tint={step === 'done' && paidNow ? toneColor.ok : toneColor[s.tone]} />}
            right={
              testMode && step === 'invoice' ? (
                <View style={styles.topRight}>
                  <View style={styles.test} accessibilityLabel="Stripe test mode: no real money moves">
                    <View style={styles.testDot} />
                    <Text style={styles.testText}>TEST MODE</Text>
                  </View>
                  <Text style={styles.ref}>{ref}</Text>
                </View>
              ) : (
                ref
              )
            }
          />
        </View>

        {step !== 'done' && (
          <View style={styles.head}>
            <OpTitle size={26}>{step === 'review' ? 'Check it over' : step === 'sign' ? 'Sign-off' : 'Payment'}</OpTitle>
            <StageTrack at={at} labels={STEPS} style={{ marginTop: 16 }} />
          </View>
        )}

        {step === 'review' && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(400)}>
              <Card style={styles.list}>
                <Cap style={styles.listCap}>{`What ${me} did`}</Cap>
                {job.lines.map((l, i) => (
                  <Line key={l.id} first={i === 0} left={lineText(l)} right={pounds(l.quantity * l.unitPrice)} />
                ))}
                {job.lines.length === 0 && <Line first left="Nothing logged yet" />}
                <Line left="Time on site" right={onSite} />
                <Line left="Photos" right={String(photos.length)} />
                <Line left="Job report" right={report ? (report.status === 'signed' ? 'Signed' : 'Draft') : 'None'} tint={report?.status === 'signed' ? color.ok : undefined} onPress={() => router.push({ pathname: '/report/[id]', params: { id: job.id } })} />
                {job.checks.length > 0 && <Line left="Checks" right={`${answered} of ${job.checks.length}`} />}
              </Card>
            </Animated.View>
            {!job.lines.some((l) => l.kind === 'material') && <Text style={styles.hint}>No parts logged. Go back to add any before the customer signs.</Text>}

            {open.length > 0 && (
              <>
                <Section label="Still open" right={<Cap tint={color.warn}>{`${open.length}`}</Cap>} />
                <Card style={styles.list}>
                  {open.map((c, i) => (
                    <Line key={c.key} first={i === 0} left={c.label} right={c.detail ?? checkState[c.state].label} tint={toneColor[c.state === 'fail' ? 'danger' : 'warn']} />
                  ))}
                </Card>
                <Text style={styles.hint}>The office sees these as open. You can still get sign-off.</Text>
              </>
            )}
          </ScrollView>
        )}

        {step === 'sign' && (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" scrollEnabled={false}>
            <Card style={styles.list}>
              <Cap style={styles.listCap}>{`What ${me} did`}</Cap>
              <Line first left={job.title} right={pounds(sums.total)} />
              <Line left="Time on site" right={onSite} />
            </Card>
            <Section label={`${customer?.name ?? 'The customer'} signs here`} />
            <SignaturePad
              onChange={(v) => {
                setSvg(v);
                if (v) setWarn('');
              }}
            />
            <Input value={who} onChangeText={setSignedBy} placeholder="Who is signing" accessibilityLabel="Name of who is signing" style={{ marginTop: 8 }} />
            <Text style={styles.hint}>
              Signing says the work is done. The total is {pounds(sums.total)} including VAT.
            </Text>
            {!!warn && <Text style={[styles.hint, { color: color.warn }]}>{warn}</Text>}
          </ScrollView>
        )}

        {step === 'invoice' && invoice && takes && (
          <TakePayment day={day} job={job} invoice={invoice} owed={owed} customer={customer} summary={invoiceCard} onDone={settled} onBackToToday={() => router.dismissTo('/today')} />
        )}

        {step === 'invoice' && invoice && !takes && (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {invoiceCard}
            <View style={styles.methods} accessibilityRole="radiogroup">
              {methods.map((m) => (
                <Radio key={m.id} label={m.label} on={method === m.id} onPress={() => setMethod(m.id)} style={styles.method} />
              ))}
            </View>
            <Text style={styles.hint}>This records how they paid. Card payments through Ardent start once the office switches them on.</Text>
            {!!warn && <Text style={[styles.hint, { color: color.warn }]}>{warn}</Text>}
          </ScrollView>
        )}

        {step === 'invoice' && !invoice && (
          <View style={styles.done}>
            <Text style={styles.sub}>Making the invoice.</Text>
          </View>
        )}

        {step === 'done' && invoice && (
          <ScrollView contentContainerStyle={styles.doneScroll} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(420)} style={{ alignItems: 'center' }}>
              <OpTitle size={30}>Job done</OpTitle>
              <Text style={[styles.sub, { textAlign: 'center' }]}>
                {job.title}
                {customer ? ` for ${customer.name}` : ''}
              </Text>
            </Animated.View>
            {paidNow ? (
              <Animated.View entering={ZoomIn.springify().damping(14).delay(120)} style={styles.paid}>
                <Icon name="check" size={16} tint={color.bg} strokeWidth={2.2} />
                <Text style={styles.paidText}>PAID</Text>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn.delay(120)} style={[styles.paid, { backgroundColor: color.raised }]}>
                <Text style={[styles.paidText, { color: color.fg }]}>INVOICED</Text>
              </Animated.View>
            )}
            <Animated.View entering={FadeIn.delay(220).duration(500)} style={{ alignItems: 'center', marginTop: 16 }}>
              <Num size={40}>{pounds(paid ? invoice.paidAmount : paidNow ? (how?.amount ?? invoice.paidAmount) : owed)}</Num>
              <Cap tint={color.fgFaint} style={{ marginTop: 10, textAlign: 'center' }}>
                {paidNow
                  ? [invoice.ref, how?.label, how ? clock(how.at) : undefined].filter(Boolean).join('   ')
                  : [how?.label, invoice.dueAt ? `Due ${longDate(invoice.dueAt)}` : 'The office follows it up'].filter(Boolean).join('   ')}
              </Cap>
            </Animated.View>
            <StageTrack at={paidNow ? 4 : 3} style={{ marginTop: 28 }} />
            <View style={styles.grid}>
              <Stat label="On site" value={onSite} />
              <Stat label="Checks" value={job.checks.length ? `${answered} of ${job.checks.length}` : 'None'} />
            </View>
            <View style={styles.grid}>
              <Stat label="Photos" value={String(photos.length)} />
              <Stat label="Signed" value={signature ? `${signature.signedBy.split(' ')[0]}, ${clock(signature.at)}` : 'Not signed'} size={16} />
            </View>
          </ScrollView>
        )}

        {!(step === 'invoice' && invoice && takes) && (
        <Dock>
          {step === 'done' && nextJob && (
            <View style={styles.nextRow}>
              <Text style={styles.nextText} numberOfLines={1}>
                Next up, {nextJob.title}
              </Text>
              <Text style={styles.nextMeta}>
                {clock(nextJob.start)}
                {nextJob.site ? `   ${nextJob.site.postcode.split(' ')[0]}` : ''}
              </Text>
            </View>
          )}
          {step === 'review' && <Go label={copy.getSignOff} icon="arrow" onPress={() => setStep('sign')} />}
          {step === 'sign' && <HoldToCommit label={busy ? 'Saving' : 'Hold to sign off'} icon="check" onCommit={sign} />}
          {step === 'invoice' && invoice && <HoldToCommit label={busy ? 'Saving' : method === 'later' ? "Hold, they'll pay later" : 'Hold to mark paid'} icon="pound" onCommit={settle} disabled={!method} />}
          {step === 'invoice' && invoice && invoice.status !== 'draft' && <Go label="Back to today" tone="grey" onPress={() => router.dismissTo('/today')} />}
          {step === 'done' &&
            (nextJob?.status === 'booked' ? (
              <HoldToCommit
                tone="grey"
                label={copy.setOff}
                icon="route"
                onCommit={async () => {
                  await act.setOff(nextJob);
                  router.replace({ pathname: '/job/[id]', params: { id: nextJob.id } });
                }}
              />
            ) : (
              <Go label="Back to today" tone="grey" onPress={() => router.dismissTo('/today')} />
            ))}
        </Dock>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  pad: { paddingHorizontal: 22, paddingTop: space[3] },
  head: { paddingHorizontal: 22, paddingTop: 22 },
  scroll: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: space[6] },
  doneScroll: { paddingHorizontal: 22, paddingTop: 40, paddingBottom: space[6] },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20, marginTop: 10 },
  list: { paddingVertical: 14 },
  listCap: { marginBottom: 4 },
  hint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, lineHeight: 18, marginTop: 10 },
  toPay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.lineStrong },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  method: { flexBasis: '48%', flexGrow: 1, minHeight: 56 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  paid: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, height: 40, paddingHorizontal: 20, borderRadius: 20, backgroundColor: color.ember, marginTop: 18 },
  paidText: { color: color.bg, fontFamily: font.display, fontSize: 13, letterSpacing: 3 },
  grid: { flexDirection: 'row', gap: 8, marginTop: 8 },
  nextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  nextText: { flex: 1, color: color.fgMuted, fontFamily: font.sans, fontSize: 14 },
  nextMeta: { color: color.fgFaint, fontFamily: font.mono, fontSize: 12 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1 },
  ref: { color: color.fgMuted, fontFamily: font.mono, fontSize: 13, letterSpacing: 1 },
  test: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  testDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.warn },
  testText: { color: color.warn, fontFamily: font.mono, fontSize: 11, letterSpacing: 1.6 },
});

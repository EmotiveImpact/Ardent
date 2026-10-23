/**
 * Take payment at wrap-up, for a firm that takes payments through Ardent.
 * Best first: Tap to Pay on this phone, then a QR code the customer pays
 * with on their own phone (works with no signal here), then a text with the
 * Pay now link (waits for signal), then cash, bank transfer or pay later.
 * A firm that doesn't take payments yet keeps the plain list on the wrap-up
 * screen. See src/payments/pay.ts for how each one works.
 */
import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Cap, Go, Num, Plain, Radio, ringName, Section } from '@/components/ardent';
import { HoldToCommit } from '@/components/HoldToCommit';
import { Icon, type IconName } from '@/components/Icon';
import { QrCode } from '@/components/QrCode';
import { Dock } from '@/components/ui';
import type { Customer, Day, Invoice, Job, TapToPay } from '@/data/types';
import { pounds } from '@/kit/format';
import { engineInvoice, payCode, tapPayment, untilPaid } from '@/payments/pay';
import { type TapStage, useTapToPay } from '@/payments/terminal';
import * as act from '@/sync/actions';
import { field } from '@/sync/field';
import { useField } from '@/sync/hooks';
import { isLocal, reason } from '@/sync/ops';
import { color, font, radius, space } from '@/theme/tokens';

type Pick = 'tap' | 'qr' | 'text' | 'cash' | 'bank_transfer' | 'later';
type Stage = TapStage | 'ready' | 'failed';

export interface Settled {
  /** How they paid, or what happened, for the end screen. */
  label: string;
  paid: boolean;
  /** Paid on the invoice in all, once this payment is in. */
  amount?: number;
}

const buzz = (type: Haptics.NotificationFeedbackType) => {
  if (Platform.OS !== 'web') Haptics.notificationAsync(type).catch(() => {});
};

const STAGE_WORDS: Record<Stage, string> = {
  starting: 'Getting the payment ready',
  connecting: 'Getting the phone ready',
  ready: 'Ready for the tap',
  waiting: 'Ready for the tap',
  confirming: 'Taking the payment',
  failed: "It didn't go through",
};

const PIN = 'Over £100 they may be asked for their PIN on your screen.';

export function TakePayment({
  day,
  job,
  invoice,
  owed,
  customer,
  summary,
  onDone,
  onBackToToday,
}: {
  day: Day;
  job: Job;
  invoice: Invoice;
  owed: number;
  customer?: Customer;
  /** The invoice lines and what's to pay. */
  summary: ReactNode;
  onDone: (s: Settled) => void;
  onBackToToday: () => void;
}) {
  const { state } = useField();
  const online = state.online;
  const demo = state.mode === 'demo';
  const terminal = useTapToPay();
  const [pick, setPick] = useState<Pick>();
  const [view, setView] = useState<'options' | 'tap' | 'qr'>('options');
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState('');
  const [stage, setStage] = useState<Stage>('starting');
  const [tap, setTap] = useState<TapToPay>();
  const [link, setLink] = useState<string>();
  const done = useRef(onDone);
  done.current = onDone;

  const who = customer ? ringName(customer) : 'them';
  const phone = customer?.phone?.trim();
  const code = payCode(day, invoice);
  const local = isLocal(invoice.id);

  // Why each way can't be used right now, if it can't.
  const why: Partial<Record<Pick, string>> = {
    tap: !online ? 'Needs signal, and there is none here. Use Pay on your own phone.' : !demo && !terminal.available ? terminal.reason : undefined,
    qr: code.url ? undefined : code.why,
    text: phone ? undefined : 'There is no mobile number for them.',
    later: invoice.status === 'draft' ? undefined : 'The invoice has gone to them already.',
  };
  const allowed = (p: Pick) => !why[p];
  const chosen: Pick = pick && allowed(pick) ? pick : (['tap', 'qr', 'text'] as Pick[]).find(allowed) ?? 'cash';

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setWarn(reason(e));
      buzz(Haptics.NotificationFeedbackType.Warning);
    } finally {
      setBusy(false);
    }
  };

  // The stable link from the engine when there's signal; the phone builds the same one, or the offline code, without.
  useEffect(() => {
    setLink(undefined);
    if (view !== 'qr' || !online || local) return;
    let live = true;
    field.conn.client.payments
      .link(invoice.id)
      .then((l) => live && setLink(l.url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [view, online, local, invoice.id]);

  // While the code is up, watch for the customer paying on their own phone.
  useEffect(() => {
    if (view !== 'qr' || !online || local) return;
    let live = true;
    const h = setInterval(() => {
      engineInvoice(job.id, invoice.id)
        .then((now) => {
          if (!live || now?.status !== 'paid') return;
          live = false;
          clearInterval(h);
          buzz(Haptics.NotificationFeedbackType.Success);
          void field.refresh();
          done.current({ label: 'Paid on their phone', paid: true, amount: now.paidAmount });
        })
        .catch(() => undefined);
    }, 4000);
    return () => {
      live = false;
      clearInterval(h);
    };
  }, [view, online, local, job.id, invoice.id]);

  const startTap = () => {
    setWarn('');
    setTap(undefined);
    setStage('starting');
    setView('tap');
    void run(async () => {
      try {
        const { invoice: inv, tap: t } = await tapPayment(job.id);
        setTap(t);
        // The demo has no Stripe: the screen shows a pretend tap instead.
        if (t.demo) return setStage('ready');
        const r = await terminal.take(t, { fresh: () => field.conn.client.payments.tap(inv.id), merchant: state.me?.organisation.name ?? 'Ardent', onStage: setStage });
        if (!r.ok) {
          if (r.cancelled) return setView('options');
          setStage('failed');
          setWarn(r.reason);
          buzz(Haptics.NotificationFeedbackType.Warning);
          return;
        }
        buzz(Haptics.NotificationFeedbackType.Success);
        void untilPaid(job.id, inv.id);
        onDone({ label: 'Tap to Pay', paid: true, amount: inv.paidAmount + t.amount });
      } catch (e) {
        setStage('failed');
        throw e;
      }
    });
  };

  const pretendTap = () =>
    run(async () => {
      if (!tap) return;
      setStage('confirming');
      await field.conn.client.payments.simulate({ kind: 'tapped', intent: tap.intent });
      buzz(Haptics.NotificationFeedbackType.Success);
      void field.refresh();
      onDone({ label: 'Tap to Pay', paid: true, amount: invoice.paidAmount + tap.amount });
    });

  const pretendPaid = () =>
    run(async () => {
      await field.conn.client.payments.simulate({ kind: 'paid', invoiceId: invoice.id, method: 'card' });
      buzz(Haptics.NotificationFeedbackType.Success);
      void field.refresh();
      onDone({ label: 'Paid on their phone', paid: true, amount: invoice.paidAmount + owed });
    });

  const cancelTap = () => {
    if (tap && !tap.demo) void terminal.cancel();
    setWarn('');
    setView('options');
  };

  const commit = () => {
    setWarn('');
    void run(async () => {
      if (chosen === 'text') {
        await act.textPayLink(invoice.id, job.ref);
        onDone({ label: online ? 'Pay link texted' : 'Text goes with signal', paid: false });
      } else if (chosen === 'later') {
        await act.payLater(invoice.id, job.ref);
        onDone({ label: '', paid: false });
      } else if (chosen === 'cash' || chosen === 'bank_transfer') {
        await act.takePayment(invoice.id, job.ref, chosen);
        buzz(Haptics.NotificationFeedbackType.Success);
        onDone({ label: chosen === 'cash' ? 'Cash' : 'Bank transfer', paid: true, amount: invoice.paidAmount + owed });
      }
    });
  };

  if (view === 'tap') {
    const live = stage === 'ready' || stage === 'waiting';
    return (
      <>
        <ScrollView contentContainerStyle={styles.centre} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)} style={{ alignItems: 'center' }}>
            <Cap tint={stage === 'failed' ? color.warn : color.fgMuted}>{STAGE_WORDS[stage]}</Cap>
            <Num size={44} style={{ marginTop: 14 }}>
              {pounds(tap?.amount ?? owed, { always: true })}
            </Num>
            <View style={[styles.tapMark, !live && { opacity: 0.35 }]}>
              <Icon name="tap" size={72} tint={color.fg} strokeWidth={1.4} />
            </View>
            {stage !== 'failed' ? (
              <>
                <Text style={styles.say}>{`Ask ${who} to tap their card or phone on the back of your phone, near the top.`}</Text>
                <Text style={styles.small}>{PIN}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.say, { color: color.warn }]}>{warn || 'Tap to Pay stopped.'}</Text>
                {allowed('qr') && (
                  <View style={{ marginTop: space[4], alignSelf: 'stretch' }}>
                    <Plain title="Show the QR code" icon="qr" onPress={() => (setWarn(''), setView('qr'))} />
                  </View>
                )}
              </>
            )}
            {demo && stage === 'ready' && <Text style={styles.small}>This is the demo, so there is no real tap.</Text>}
          </Animated.View>
        </ScrollView>
        <Dock>
          {demo && stage === 'ready' && <Go label="Pretend they tapped" icon="tap" onPress={() => void pretendTap()} disabled={busy} />}
          {stage !== 'confirming' && <Go label={stage === 'failed' ? 'Other ways to pay' : 'Cancel'} tone="grey" onPress={cancelTap} />}
        </Dock>
      </>
    );
  }

  if (view === 'qr' && code.url) {
    const url = link ?? code.url;
    return (
      <>
        <ScrollView contentContainerStyle={styles.centre} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)} style={{ alignItems: 'center', alignSelf: 'stretch' }}>
            <Cap>Pay on your own phone</Cap>
            <View style={{ marginTop: space[4] }}>
              <QrCode value={url} label={`QR code to pay ${pounds(owed)} on their own phone`} />
            </View>
            <Num size={34} style={{ marginTop: space[4] }}>
              {pounds(owed, { always: true })}
            </Num>
            {!!invoice.ref && (
              <Cap tint={color.fgFaint} style={{ marginTop: 8 }}>
                {invoice.ref}
              </Cap>
            )}
            <Text style={styles.say}>{`Ask ${who} to point their phone camera at the code. They pay by bank or card on their own phone.`}</Text>
            {!online ? (
              <Text style={styles.small}>Your phone has no signal. The code still works: they need signal on theirs. It shows as paid here once you have signal.</Text>
            ) : local ? (
              <Text style={styles.small}>The invoice is on its way to the office.</Text>
            ) : (
              <Animated.View entering={FadeIn.delay(300)} style={styles.watch}>
                <View style={styles.watchDot} />
                <Text style={styles.watchText}>Waiting for the payment</Text>
              </Animated.View>
            )}
            {demo && (
              <View style={{ marginTop: space[4], alignSelf: 'stretch' }}>
                <Plain title="Pretend the customer paid" icon="check" onPress={() => void pretendPaid()} disabled={busy || !online || local} />
                {(!online || local) && <Text style={[styles.small, { textAlign: 'center' }]}>{!online ? 'Turn the signal back on in Me to pretend they paid.' : 'Once the invoice reaches the office you can pretend they paid.'}</Text>}
              </View>
            )}
            {!!warn && <Text style={[styles.small, { color: color.warn }]}>{warn}</Text>}
          </Animated.View>
        </ScrollView>
        <Dock>
          <Go label="Other ways to pay" tone="grey" onPress={() => (setWarn(''), setView('options'))} />
        </Dock>
      </>
    );
  }

  const opts: { id: Pick; icon: IconName; title: string; detail: string }[] = [
    { id: 'tap', icon: 'tap', title: 'Tap to Pay', detail: why.tap ?? `They tap their card or phone on the back of yours. ${PIN}` },
    { id: 'qr', icon: 'qr', title: 'Pay on your own phone', detail: why.qr ?? `A code they scan to pay by bank or card on their phone.${online ? '' : ' Works with no signal on yours.'}` },
    { id: 'text', icon: 'message', title: 'Text them the link', detail: why.text ?? `Texts ${phone} a Pay now link${online ? '.' : ' as soon as you have signal.'}` },
  ];
  const byHand: { id: Pick; label: string }[] = [
    { id: 'cash', label: 'Cash' },
    { id: 'bank_transfer', label: 'Bank transfer' },
    ...(allowed('later') ? [{ id: 'later' as Pick, label: 'Paying later' }] : []),
  ];

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {summary}
        <Section label="How they're paying" style={{ marginTop: 22 }} />
        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          {opts.map((o, i) => (
            <Animated.View key={o.id} entering={FadeInDown.duration(400).delay(60 * i)}>
              <Option icon={o.icon} title={o.title} detail={o.detail} on={chosen === o.id} disabled={!allowed(o.id)} onPress={() => setPick(o.id)} />
            </Animated.View>
          ))}
        </View>
        <View style={styles.grid}>
          {byHand.map((m) => (
            <Radio key={m.id} label={m.label} on={chosen === m.id} onPress={() => setPick(m.id)} style={styles.half} />
          ))}
        </View>
        {!!warn && <Text style={[styles.small, { color: color.warn, textAlign: 'left' }]}>{warn}</Text>}
      </ScrollView>
      <Dock>
        {chosen === 'tap' && <HoldToCommit label={`Hold to take ${pounds(owed)}`} icon="tap" onCommit={startTap} disabled={busy} />}
        {chosen === 'qr' && <Go label="Show the QR code" icon="qr" onPress={() => (setWarn(''), setView('qr'))} />}
        {chosen === 'text' && <HoldToCommit label={busy ? 'Saving' : 'Hold to text the link'} icon="message" onCommit={commit} disabled={busy} />}
        {(chosen === 'cash' || chosen === 'bank_transfer') && <HoldToCommit label={busy ? 'Saving' : 'Hold to mark paid'} icon="pound" onCommit={commit} disabled={busy} />}
        {chosen === 'later' && <HoldToCommit label={busy ? 'Saving' : "Hold, they'll pay later"} icon="pound" onCommit={commit} disabled={busy} />}
        {invoice.status !== 'draft' && <Go label="Back to today" tone="grey" onPress={onBackToToday} />}
      </Dock>
    </>
  );
}

/** One way to pay: a ring, its name, a line on how it works, and its mark. The picked one lifts. */
function Option({ icon, title, detail, on, disabled, onPress }: { icon: IconName; title: string; detail: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={`${title}. ${detail}`}
      style={({ pressed }) => [styles.option, on && { backgroundColor: color.raised }, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.ring, on && { borderColor: color.fg }, disabled && { opacity: 0.4 }]}>{on && <View style={styles.dot} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optTitle, !on && { color: color.fgMuted }, disabled && { color: color.fgFaint }]}>{title}</Text>
        <Text style={[styles.optDetail, disabled && on === false && { color: color.fgFaint }]}>{detail}</Text>
      </View>
      <View style={disabled ? { opacity: 0.4 } : undefined}>
        <Icon name={icon} size={22} tint={on ? color.fg : color.fgMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: space[6] },
  centre: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: space[6], alignItems: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderRadius: radius.xl, backgroundColor: color.surface },
  ring: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: color.fgFaint, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.fg },
  optTitle: { color: color.fg, fontFamily: font.sansMedium, fontSize: 16 },
  optDetail: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, lineHeight: 18, marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  half: { flexBasis: '48%', flexGrow: 1, minHeight: 52 },
  tapMark: { width: 148, height: 148, borderRadius: 74, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  say: { color: color.fg, fontFamily: font.sans, fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 24, maxWidth: 320 },
  small: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 10, maxWidth: 320 },
  watch: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  watchDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.fgMuted },
  watchText: { color: color.fgMuted, fontFamily: font.mono, fontSize: 12, letterSpacing: 1 },
});

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Cap, Line, Plain, Section, Stat, TabBar } from '@/components/ardent';
import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { Dock } from '@/components/ui';
import { copy } from '@/kit/copy';
import { clock, relative, shortDate, ukDay } from '@/kit/format';
import { certificateState, jobDone, trade } from '@/kit/states';
import { ENGINE_URL, field } from '@/sync/field';
import { standing, useField, vanStock, waiting } from '@/sync/hooks';
import type { Op } from '@/sync/ops';
import { color, font, radius, space, toneColor } from '@/theme/tokens';

const ROLE: Record<string, string> = { owner: 'Owner', operator: 'Engineer', subcontractor: 'Subcontractor' };

export default function Me() {
  const router = useRouter();
  const snap = useField();
  const { state, day } = snap;
  const [confirm, setConfirm] = useState<'reset' | 'signout'>();
  const [busy, setBusy] = useState(false);
  const n = waiting(snap);
  if (!day || !state.me) return <View style={styles.root} />;
  const op = day.operator;
  const van = vanStock(day);
  const demo = state.mode === 'demo';

  const signOut = async () => {
    setBusy(true);
    await field.signOut();
    router.replace('/sign-in');
  };
  const reset = async () => {
    setBusy(true);
    await field.resetDemo().catch(() => undefined);
    setBusy(false);
    setConfirm(undefined);
    router.replace('/today');
  };

  // This month, from the jobs and signatures on the phone.
  const month = ukDay(new Date().toISOString()).slice(0, 7);
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'short', timeZone: 'Europe/London' });
  const mine = day.jobs.filter((j) => ukDay(j.start).startsWith(month) && j.status !== 'cancelled');
  const done = mine.filter((j) => jobDone.has(j.status)).length;
  const signed = day.signatures.filter((s) => ukDay(s.at).startsWith(month)).length;

  const status = state.setAside.length
    ? { label: `${state.setAside.length} not sent`, tint: toneColor.danger }
    : !state.online
      ? { label: 'No signal', tint: toneColor.warn }
      : n
        ? { label: 'Sending', tint: toneColor.warn }
        : { label: copy.allSent, tint: toneColor.ok };

  const opLine = (o: Op) => `${clock(o.at)}${o.attempts ? `, tried ${o.attempts}×` : ''}`;

  return (
    <View style={styles.root}>
      <Atmosphere state={op.state} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)} style={styles.who}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{op.initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>
                {op.name.toUpperCase()}
              </Text>
              <Text style={styles.sub}>
                {ROLE[op.role] ?? 'Engineer'}, {state.me.organisation.name}
              </Text>
            </View>
          </Animated.View>

          <View style={styles.stats}>
            <Stat label={`Jobs, ${monthName}`} value={String(mine.length)} />
            <Stat label="Done" value={String(done)} />
            <Stat label="Signed" value={String(signed)} />
          </View>

          <Card style={styles.sync}>
            <View style={styles.syncTop}>
              <Cap>{n ? 'Waiting for signal' : 'Sync'}</Cap>
              <View style={styles.syncState}>
                <View style={[styles.dot, { backgroundColor: status.tint }]} />
                <Cap tint={status.tint}>{status.label}</Cap>
              </View>
            </View>
            {state.outbox.map((o, i) => (
              <Line key={o.id} first={i === 0} left={o.label} right={opLine(o)} />
            ))}
            <Text style={styles.hint}>
              {n
                ? "Saved on the phone. They go as soon as you've got signal."
                : state.lastSentAt
                  ? `Everything's with the office. Last sent ${relative(state.lastSentAt) === 'now' ? 'just now' : relative(state.lastSentAt)}.`
                  : "Everything's with the office."}
            </Text>
            {n > 0 && <Plain title={state.sending ? 'Sending' : 'Send now'} icon="signal" onPress={() => void field.flush()} disabled={state.sending || !state.online} />}
          </Card>

          {state.setAside.length > 0 && (
            <>
              <Section label="Not sent" />
              <Text style={[styles.hint, { marginTop: 0, marginBottom: 10 }]}>Ardent turned these down, so they're off your phone's copy. Try again, or let them go and tell the office.</Text>
              {state.setAside.map((s) => (
                <Card key={s.op.id} style={{ marginBottom: 8, gap: 8 }}>
                  <Text style={styles.rowTitle}>{s.op.label}</Text>
                  <Text style={[styles.hint, { color: toneColor.danger, marginTop: 0 }]}>{s.reason}</Text>
                  <View style={styles.pair}>
                    <Plain title="Try again" onPress={() => void field.retry(s.op)} flex />
                    <Plain title="Let it go" quiet onPress={() => void field.dismiss(s.op)} flex />
                  </View>
                </Card>
              ))}
            </>
          )}

          <Section label="Cards and kit" />
          {op.registrations.map((r, i) => {
            const st = certificateState[standing(r.expires)];
            return (
              <Line
                key={`${r.body}-${r.number}`}
                first={i === 0}
                left={r.body}
                sub={r.number}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={styles.mono}>{shortDate(`${r.expires}T12:00:00Z`).toUpperCase()}</Text>
                    <Cap tint={toneColor[st.tone]}>{st.label}</Cap>
                  </View>
                }
              />
            );
          })}
          <Line first={!op.registrations.length} left="Van" right={op.van || 'None'} />
          {van.rows.length > 0 && <Line left="Van stock" sub={van.low.length ? van.lowWords : `${van.rows.length} parts, none low`} right={van.low.length ? `${van.low.length} low` : 'Stocked'} tint={van.low.length ? color.warn : color.fgMuted} />}
          <Line left="Trades" right={op.trades.map((t) => trade[t]).join(', ') || 'None set'} />
          {!op.registrations.length && <Text style={styles.hint}>No registrations on your record. The office adds these.</Text>}

          <Section label="This phone" />
          <Line first left="Signed in as" right={<Text style={styles.value} numberOfLines={1}>{state.me.user.email}</Text>} />
          <Line left="Connected to" right={<Text style={styles.value} numberOfLines={1}>{demo ? 'Demo firm, on this phone' : (ENGINE_URL ?? '').replace(/^https?:\/\//, '')}</Text>} />
          <Line
            left="Share where the van is"
            sub="On shift only, with the office only"
            right={
              <Switch
                value={state.shareLocation === true}
                onValueChange={(v) => void field.setShareLocation(v)}
                trackColor={{ false: color.raised, true: color.fgMuted }}
                thumbColor={color.fg}
                accessibilityLabel="Share where the van is while on shift"
              />
            }
          />

          {demo && (
            <>
              <Section label="Demo" />
              <Line
                first
                left="Pretend there's no signal"
                sub="Changes wait on the phone, like in a loft"
                right={
                  <Switch
                    value={state.noSignal}
                    onValueChange={(v) => void field.setNoSignal(v)}
                    trackColor={{ false: color.raised, true: color.fgMuted }}
                    thumbColor={color.fg}
                    accessibilityLabel="Pretend there's no signal"
                  />
                }
              />
              <Line left="Reset the demo" sub="Back to how it started, on today's date" right="›" onPress={() => setConfirm(confirm === 'reset' ? undefined : 'reset')} />
            </>
          )}

          <View style={{ marginTop: 28 }}>
            <Plain title={copy.signOut} onPress={() => setConfirm(confirm === 'signout' ? undefined : 'signout')} />
          </View>
          {confirm === 'signout' && n > 0 && (
            <Text style={[styles.hint, { color: color.warn }]}>
              {copy.waitingToSend(n)}. Signing out now loses {n === 1 ? 'it' : 'them'}.
            </Text>
          )}
        </ScrollView>

        {confirm && (
          <Dock>
            <HoldToCommit
              tone="grey"
              label={busy ? 'One moment' : confirm === 'reset' ? 'Hold to reset the demo' : 'Hold to sign out'}
              onCommit={() => void (confirm === 'reset' ? reset() : signOut())}
            />
          </Dock>
        )}
        <TabBar />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  scroll: { paddingHorizontal: 22, paddingTop: 40, paddingBottom: space[8] },
  who: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  badge: { width: 64, height: 64, borderRadius: radius.xl, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: color.fg, fontFamily: font.display, fontSize: 18, letterSpacing: 2 },
  name: { color: color.fg, fontFamily: font.display, fontSize: 20, letterSpacing: 3 },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, marginTop: 6 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 24 },
  sync: { marginTop: 16, gap: 4 },
  syncTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  syncState: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowTitle: { color: color.fg, fontFamily: font.sansMedium, fontSize: 15 },
  hint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, lineHeight: 18, marginTop: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  mono: { color: color.fgMuted, fontFamily: font.mono, fontSize: 12, letterSpacing: 1 },
  value: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, maxWidth: 200, textAlign: 'right' },
});

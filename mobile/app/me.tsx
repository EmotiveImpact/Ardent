import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Action } from '@/components/Action';
import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { Back, Dock, Label, Panel, Row, StateText } from '@/components/ui';
import { ENGINE_URL, field } from '@/sync/field';
import { useField, waiting } from '@/sync/hooks';
import { copy } from '@/kit/copy';
import { clock, relative, shortDate, ukDay } from '@/kit/format';
import { certificateState, trade } from '@/kit/states';
import type { Op } from '@/sync/ops';
import { color, font, radius, space, toneColor, tracking } from '@/theme/tokens';

const DAY_MS = 86_400_000;

/** A registration's standing, worked out from its expiry like the engine works out certificates. */
function standing(expires: string) {
  const today = ukDay(new Date().toISOString());
  if (expires < today) return certificateState.overdue;
  const soon = new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10);
  return expires <= soon ? certificateState.due_soon : certificateState.valid;
}

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
    router.dismissTo('/today');
  };

  const status = state.setAside.length
    ? { label: `${state.setAside.length} not sent`, tone: 'danger' as const }
    : n
      ? { label: copy.waitingToSend(n), tone: 'warn' as const }
      : { label: copy.allSent, tone: 'ok' as const };

  const opLine = (o: Op) => `${clock(o.at)}${o.attempts ? ` · tried ${o.attempts} ${o.attempts === 1 ? 'time' : 'times'}` : ''}`;

  return (
    <View style={styles.root}>
      <Atmosphere state={op.state} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Back label="Today" />
          <Text style={[styles.faint, styles.mono]}>{op.van}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text style={styles.name}>{op.name.toUpperCase()}</Text>
            <Text style={styles.sub}>
              {ROLE[op.role] ?? 'Engineer'} at {state.me.organisation.name}
            </Text>
          </Animated.View>

          <Label style={styles.section}>Profile</Label>
          <Panel>
            <Row first>
              <Text style={styles.key}>Email</Text>
              <Text style={styles.value}>{state.me.user.email}</Text>
            </Row>
            <Row>
              <Text style={styles.key}>Trades</Text>
              <Text style={styles.value}>{op.trades.map((t) => trade[t]).join(', ') || 'None set'}</Text>
            </Row>
            <Row>
              <Text style={styles.key}>Van</Text>
              <Text style={[styles.value, styles.mono]}>{op.van || 'None'}</Text>
            </Row>
          </Panel>

          <Label style={styles.section}>Registrations</Label>
          {op.registrations.length ? (
            <Panel>
              {op.registrations.map((r, i) => {
                const st = standing(r.expires);
                return (
                  <Row key={`${r.body}-${r.number}`} first={i === 0}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{r.body}</Text>
                      <Text style={[styles.faint, styles.mono]}>{r.number}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Text style={[styles.value, styles.mono]}>{shortDate(`${r.expires}T12:00:00Z`)}</Text>
                      <StateText label={st.label} tone={st.tone} size={11} />
                    </View>
                  </Row>
                );
              })}
            </Panel>
          ) : (
            <Text style={styles.hint}>None on your record. The office adds these.</Text>
          )}

          <Label style={styles.section}>Sync</Label>
          <Panel>
            <Row first>
              <StateText label={status.label} tone={status.tone} size={13} />
              <Text style={[styles.faint, { marginLeft: 'auto' }]}>{state.lastSentAt ? `Last sent ${relative(state.lastSentAt) === 'now' ? 'just now' : relative(state.lastSentAt)}` : ''}</Text>
            </Row>
            <Row>
              <Text style={styles.key}>Connected to</Text>
              <Text style={styles.value} numberOfLines={1}>
                {demo ? 'Demo firm on this device' : (ENGINE_URL ?? '').replace(/^https?:\/\//, '')}
              </Text>
            </Row>
            <Row>
              <Text style={styles.key}>Signal</Text>
              <Text style={styles.value}>{state.online ? 'Yes' : 'No signal'}</Text>
            </Row>
            {state.outbox.map((o) => (
              <Row key={o.id}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{o.label}</Text>
                  <Text style={[styles.faint, styles.mono]}>{opLine(o)}</Text>
                </View>
                <Text style={styles.waitingTag}>Waiting</Text>
              </Row>
            ))}
          </Panel>
          {state.outbox.length > 0 && (
            <View style={{ marginTop: space[2], alignSelf: 'flex-start' }}>
              <Action title={state.sending ? 'Sending' : 'Send now'} onPress={() => void field.flush()} disabled={state.sending || !state.online} />
            </View>
          )}

          {state.setAside.length > 0 && (
            <>
              <Label style={styles.section}>Not sent</Label>
              <Text style={[styles.hint, { marginTop: 0, marginBottom: space[3] }]}>Ardent turned these down, so they're off your phone's copy. Try again, or let them go and tell the office.</Text>
              <Panel>
                {state.setAside.map((s, i) => (
                  <View key={s.op.id} style={[styles.held, i > 0 && styles.divider]}>
                    <Text style={styles.rowTitle}>{s.op.label}</Text>
                    <Text style={[styles.hint, { color: toneColor.danger, marginTop: 2 }]}>{s.reason}</Text>
                    <View style={styles.heldActions}>
                      <Action title="Try again" onPress={() => void field.retry(s.op)} />
                      <Action title="Let it go" tone="ghost" onPress={() => void field.dismiss(s.op)} />
                    </View>
                  </View>
                ))}
              </Panel>
            </>
          )}

          {demo && (
            <>
              <Label style={styles.section}>Demo</Label>
              <Panel>
                <Row first>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>Pretend there's no signal</Text>
                    <Text style={styles.faint}>Changes wait on the phone, the way they would in a loft. Switch it off to send them.</Text>
                  </View>
                  <Switch
                    value={state.noSignal}
                    onValueChange={(v) => void field.setNoSignal(v)}
                    trackColor={{ false: color.raised, true: color.fgMuted }}
                    thumbColor={color.fg}
                    accessibilityLabel="Pretend there's no signal"
                  />
                </Row>
                <Row onPress={() => setConfirm(confirm === 'reset' ? undefined : 'reset')}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>Reset the demo</Text>
                    <Text style={styles.faint}>Puts the demo firm back as it started, on today's date.</Text>
                  </View>
                  <Text style={styles.faint}>›</Text>
                </Row>
              </Panel>
            </>
          )}

          <Pressable onPress={() => setConfirm(confirm === 'signout' ? undefined : 'signout')} accessibilityRole="button" style={styles.signOut}>
            <Text style={styles.signOutText}>{copy.signOut}</Text>
          </Pressable>
          {confirm === 'signout' && n > 0 && (
            <Text style={[styles.hint, { color: color.warn }]}>
              {copy.waitingToSend(n)}. Signing out now loses {n === 1 ? 'it' : 'them'}.
            </Text>
          )}
        </ScrollView>

        {confirm && (
          <Dock>
            <HoldToCommit
              label={busy ? 'One moment' : confirm === 'reset' ? 'Hold to reset the demo' : 'Hold to sign out'}
              onCommit={() => void (confirm === 'reset' ? reset() : signOut())}
            />
          </Dock>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[6], paddingTop: space[2] },
  scroll: { paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[10] },
  name: { color: color.fg, fontFamily: font.display, fontSize: 24, letterSpacing: tracking.display },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, marginTop: space[2] },
  section: { marginTop: space[8], marginBottom: space[3] },
  key: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, width: 96 },
  value: { flex: 1, color: color.fg, fontFamily: font.sans, fontSize: 13, textAlign: 'right' },
  mono: { fontFamily: font.mono },
  rowTitle: { color: color.fg, fontFamily: font.sansMedium, fontSize: 13 },
  faint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 12, marginTop: 2 },
  hint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 12, lineHeight: 17, marginTop: space[2] },
  waitingTag: { color: toneColor.warn, fontFamily: font.sansMedium, fontSize: 11 },
  held: { paddingVertical: space[3] },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  heldActions: { flexDirection: 'row', gap: space[2], marginTop: space[3] },
  signOut: { marginTop: space[10], alignSelf: 'flex-start', paddingHorizontal: space[4], paddingVertical: space[3], borderRadius: radius.lg, backgroundColor: color.inset },
  signOutText: { color: color.fgMuted, fontFamily: font.sansSemi, fontSize: 14 },
});

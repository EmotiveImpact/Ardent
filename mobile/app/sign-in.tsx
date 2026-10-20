import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Action } from '@/components/Action';
import { Atmosphere } from '@/components/Atmosphere';
import { Dock, Input, Label, Panel, Row } from '@/components/ui';
import * as demo from '@/data/core/mock';
import { demoPeople } from '@/engine/connect';
import { copy } from '@/kit/copy';
import { initials } from '@/kit/format';
import { trade } from '@/kit/states';
import { field } from '@/sync/field';
import { useField } from '@/sync/hooks';
import { reason } from '@/sync/ops';
import { color, font, radius, space, tracking } from '@/theme/tokens';

/** The demo crew who work on the tools, with what they do, for "try it as". */
const crew = demoPeople
  .filter((p) => p.role !== 'office')
  .map((p) => {
    const op = demo.operators.find((o) => o.name === p.name);
    const what = op ? op.trades.map((t) => trade[t]).join(' and ') : '';
    const role = p.role === 'owner' ? 'Owner, on the tools' : op?.role === 'subcontractor' ? 'Subcontractor' : 'Engineer';
    return { ...p, line: what ? `${role} · ${what}` : role };
  });

export default function SignIn() {
  const router = useRouter();
  const { state } = useField();
  const isDemo = state.mode === 'demo';
  const ended = state.sessionEnded;
  const [email, setEmail] = useState(ended?.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string>();
  const [form, setForm] = useState(!isDemo || !!ended);

  const go = async (e: string, p: string, who: string) => {
    if (busy) return;
    if (!e.trim() || !p) return setError('Put in your email and password.');
    setBusy(who);
    setError('');
    try {
      await field.signIn(e.trim(), p);
      router.replace('/');
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(code === undefined && /fetch|network/i.test(String(err)) ? "Can't reach Ardent. Try again when you have signal." : `${reason(err).replace(/\.$/, '')}.`);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <View style={styles.root}>
      <Atmosphere state="off_shift" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.wordmark}>ARDENT</Text>

            <Animated.View entering={FadeInDown.duration(460)} style={styles.head}>
              <Text style={styles.title}>{copy.signIn.toUpperCase()}</Text>
              {ended ? (
                <Text style={styles.sub}>
                  Your sign-in ran out. Sign in again to send the <Text style={styles.mono}>{ended.waiting}</Text> {ended.waiting === 1 ? 'change' : 'changes'} waiting on this phone.
                </Text>
              ) : isDemo ? (
                <Text style={styles.sub}>This is the demo firm, Mercer Heating & Electrical. The jobs are made up and kept on this device.</Text>
              ) : (
                <Text style={styles.sub}>Use the email and password the office set up for you.</Text>
              )}
            </Animated.View>

            {isDemo && !ended && (
              <Animated.View entering={FadeInDown.delay(80).duration(460)}>
                <Label style={styles.label}>Try it as</Label>
                <Panel>
                  {crew.map((p, i) => (
                    <Row key={p.email} first={i === 0} onPress={() => go(p.email, p.password, p.email)}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials(p.name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{p.name}</Text>
                        <Text style={styles.line}>{p.line}</Text>
                      </View>
                      <Text style={styles.go}>{busy === p.email ? '…' : '›'}</Text>
                    </Row>
                  ))}
                </Panel>
              </Animated.View>
            )}

            {form ? (
              <Animated.View entering={FadeInDown.delay(isDemo ? 0 : 80).duration(420)} style={{ gap: space[2] }}>
                <Label style={styles.label}>{isDemo && !ended ? 'Or with email' : 'Your sign-in'}</Label>
                <Input value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" />
                <Input
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry
                  autoComplete="password"
                  textContentType="password"
                  onSubmitEditing={() => go(email, password, 'form')}
                />
                {isDemo && <Text style={styles.hint}>Demo password: ardent-demo</Text>}
              </Animated.View>
            ) : (
              <Pressable onPress={() => setForm(true)} hitSlop={8} accessibilityRole="button" style={{ marginTop: space[5] }}>
                <Text style={styles.link}>Sign in with email instead</Text>
              </Pressable>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          {form && (
            <Dock>
              <Action title={busy === 'form' ? 'Signing in' : copy.signIn} tone="ember" onPress={() => go(email, password, 'form')} disabled={!!busy} />
            </Dock>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  scroll: { flexGrow: 1, paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[8] },
  wordmark: { color: color.fgFaint, fontFamily: font.display, fontSize: 10, letterSpacing: tracking.label * 2 },
  head: { marginTop: 'auto', paddingTop: space[12] },
  title: { color: color.fg, fontFamily: font.display, fontSize: 30, letterSpacing: tracking.display },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20, marginTop: space[2], maxWidth: 320 },
  mono: { fontFamily: font.monoMedium, color: color.fg },
  label: { marginTop: space[8], marginBottom: space[3] },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: color.fg, fontFamily: font.monoMedium, fontSize: 11 },
  name: { color: color.fg, fontFamily: font.sansSemi, fontSize: 15 },
  line: { color: color.fgMuted, fontFamily: font.sans, fontSize: 12, marginTop: 2 },
  go: { color: color.fgFaint, fontFamily: font.sans, fontSize: 20, width: 16, textAlign: 'right' },
  hint: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11, marginTop: space[1] },
  link: { color: color.fgMuted, fontFamily: font.sansMedium, fontSize: 13 },
  error: { color: color.warn, fontFamily: font.sans, fontSize: 13, marginTop: space[4], padding: space[3], borderRadius: radius.lg, backgroundColor: color.inset, overflow: 'hidden' },
});

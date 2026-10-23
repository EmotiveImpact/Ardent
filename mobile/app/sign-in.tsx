import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Cap, Go } from '@/components/ardent';
import { Atmosphere } from '@/components/Atmosphere';
import { Input } from '@/components/ui';
import * as demo from '@/data/core/mock';
import { demoPeople } from '@/engine/connect';
import { copy } from '@/kit/copy';
import { initials } from '@/kit/format';
import { trade } from '@/kit/states';
import { field } from '@/sync/field';
import { useField } from '@/sync/hooks';
import { reason } from '@/sync/ops';
import { color, font, radius, space } from '@/theme/tokens';

/** The demo crew who work on the tools, for "try it as". */
const crew = demoPeople
  .filter((p) => p.role !== 'office')
  .map((p) => {
    const op = demo.operators.find((o) => o.name === p.name);
    const names = op ? op.trades.map((t) => trade[t]) : [];
    const what = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
    const line = what || (p.role === 'owner' ? 'Owner' : 'Engineer');
    return { ...p, line: op?.role === 'freelance' ? `Freelance, ${line.toLowerCase()}` : line };
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
            <Animated.View entering={FadeIn.duration(900)} style={styles.mark}>
              <Text style={styles.wordmark} accessibilityRole="header">
                ARDENT
              </Text>
              <Cap tint={color.fgFaint} style={{ letterSpacing: 4 }}>
                Field
              </Cap>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(120).duration(460)} style={{ gap: 8 }}>
              {ended ? (
                <Text style={styles.note}>
                  Your sign-in ran out. Sign in again to send the {ended.waiting} {ended.waiting === 1 ? 'change' : 'changes'} waiting on this phone.
                </Text>
              ) : isDemo ? (
                <Text style={styles.note}>This is the demo firm, Mercer Heating & Electrical. The jobs are made up and kept on this phone.</Text>
              ) : null}

              <Cap style={styles.label}>Email</Cap>
              <Input value={email} onChangeText={setEmail} placeholder="you@yourfirm.co.uk" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" accessibilityLabel="Email" />
              <Cap style={styles.label}>Password</Cap>
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder={isDemo ? 'ardent-demo' : 'Password'}
                secureTextEntry
                autoComplete="password"
                textContentType="password"
                accessibilityLabel="Password"
                onSubmitEditing={() => go(email, password, 'form')}
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <View style={{ marginTop: 14 }}>
                <Go label={busy === 'form' ? 'Signing in' : copy.signIn} onPress={() => go(email, password, 'form')} disabled={!!busy} />
              </View>
            </Animated.View>

            {isDemo && !ended && (
              <Animated.View entering={FadeInDown.delay(200).duration(460)}>
                <Cap tint={color.fgFaint} style={styles.tryAs}>
                  Or try it as
                </Cap>
                <View style={styles.crew}>
                  {crew.map((p) => (
                    <Pressable
                      key={p.email}
                      onPress={() => go(p.email, p.password, p.email)}
                      accessibilityRole="button"
                      accessibilityLabel={`Try it as ${p.name}, ${p.line}`}
                      style={({ pressed }) => [styles.person, (pressed || busy === p.email) && { opacity: 0.6 }]}
                    >
                      <Text style={styles.personInitials}>{initials(p.name)}</Text>
                      <Text style={styles.personName} numberOfLines={1}>
                        {p.name.split(' ')[0]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 22, paddingTop: space[6], paddingBottom: space[6] },
  mark: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 14 },
  wordmark: { color: color.fg, fontFamily: font.display, fontSize: 34, letterSpacing: 9, marginRight: -9 },
  note: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20, marginBottom: 10 },
  label: { marginTop: 8 },
  error: { color: color.warn, fontFamily: font.sans, fontSize: 14, lineHeight: 20, marginTop: 6 },
  tryAs: { textAlign: 'center', marginTop: 30, marginBottom: 12 },
  crew: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  person: { flexGrow: 1, flexBasis: '22%', minHeight: 76, borderRadius: radius.xl, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', gap: 6 },
  personInitials: { color: color.fg, fontFamily: font.display, fontSize: 14, letterSpacing: 2 },
  personName: { color: color.fgMuted, fontFamily: font.sans, fontSize: 13 },
});

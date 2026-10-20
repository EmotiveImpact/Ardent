import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { pickPhoto } from '@/components/pickPhoto';
import { Back, Dock, Input, Label } from '@/components/ui';
import { clock } from '@/kit/format';
import { couldntGetIn, NO_ACCESS_REASONS } from '@/sync/actions';
import { card, useField } from '@/sync/hooks';
import { color, font, radius, space, tracking } from '@/theme/tokens';

/**
 * Couldn't get in: why, and a photo that shows it. The job is paused with the
 * reason on it, so the office sees it and can rebook.
 */
export default function NoAccess() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { day } = useField();
  const [why, setWhy] = useState<string>();
  const [detail, setDetail] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; width: number; height: number }>();
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const job = day?.jobs.find((j) => j.id === id);
  if (!day || !job) return <View style={styles.root} />;
  const { customer, site } = card(day, job);
  const ready = !!why && !!photo;

  const take = async () => {
    try {
      const picked = await pickPhoto();
      if (picked) setPhoto(picked);
    } catch (e) {
      setProblem(String((e as Error).message ?? e));
    }
  };

  const log = async () => {
    if (!why) return setProblem('Pick why you couldn’t get in.');
    if (!photo) return setProblem('Take a photo that shows it, like the door or the key safe.');
    if (busy) return;
    setBusy(true);
    try {
      await couldntGetIn(job, why.toLowerCase(), detail, photo);
      router.dismissTo('/today');
    } catch (e) {
      setProblem(String((e as Error).message ?? e));
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Atmosphere state="delayed" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Back label={job.ref} />
          <Text style={styles.ref}>{clock(new Date().toISOString())}</Text>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(400)}>
              <Text style={styles.title}>COULDN’T GET IN</Text>
              <Text style={styles.sub}>
                {job.title}
                {customer ? ` for ${customer.name}` : ''}
                {site ? `, ${site.line1}` : ''}. The job is paused and the office sees why.
              </Text>
            </Animated.View>

            <Label style={styles.section}>Why</Label>
            <View style={styles.reasons}>
              {NO_ACCESS_REASONS.map((r) => (
                <Pressable key={r} onPress={() => setWhy(r)} style={[styles.reason, why === r && styles.reasonOn]} accessibilityRole="button" accessibilityState={{ selected: why === r }}>
                  <Text style={[styles.reasonText, why === r && { color: color.fg }]}>{r}</Text>
                </Pressable>
              ))}
            </View>

            <Label style={styles.section}>Photo</Label>
            <Pressable onPress={take} style={({ pressed }) => [styles.shot, pressed && { opacity: 0.75 }]} accessibilityRole="button" accessibilityLabel={photo ? 'Retake photo' : 'Take a photo'}>
              {photo ? (
                <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <>
                  <Text style={styles.plus}>+</Text>
                  <Text style={styles.shotText}>The door, the key safe, whatever shows it</Text>
                </>
              )}
            </Pressable>
            {photo && <Text style={styles.hint}>Tap the photo to take it again.</Text>}

            <Label style={styles.section}>Anything else</Label>
            <Input value={detail} onChangeText={setDetail} placeholder="Rang twice, left a card" multiline />

            {!!problem && <Text style={styles.problem}>{problem}</Text>}
          </ScrollView>
        </KeyboardAvoidingView>
        <Dock>
          <HoldToCommit label={busy ? 'Saving' : 'Hold to tell the office'} onCommit={log} disabled={!ready} />
        </Dock>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[6], paddingTop: space[2] },
  ref: { color: color.fgFaint, fontFamily: font.mono, fontSize: 11 },
  scroll: { paddingHorizontal: space[6], paddingTop: space[6], paddingBottom: space[8] },
  title: { color: color.fg, fontFamily: font.display, fontSize: 24, letterSpacing: tracking.display },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20, marginTop: space[2] },
  section: { marginTop: space[8], marginBottom: space[3] },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  reason: { paddingHorizontal: space[3], paddingVertical: space[2] + 2, borderRadius: radius.pill, backgroundColor: color.inset },
  reasonOn: { backgroundColor: color.raised },
  reasonText: { color: color.fgMuted, fontFamily: font.sansMedium, fontSize: 13 },
  shot: { height: 168, borderRadius: radius.xl, backgroundColor: color.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: space[1], paddingHorizontal: space[6] },
  plus: { color: color.fg, fontFamily: font.sans, fontSize: 26 },
  shotText: { color: color.fgFaint, fontFamily: font.sans, fontSize: 12, textAlign: 'center' },
  hint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 12, marginTop: space[2] },
  problem: { color: color.warn, fontFamily: font.sans, fontSize: 13, marginTop: space[4] },
});

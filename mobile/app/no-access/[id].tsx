import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Atmosphere } from '@/components/Atmosphere';
import { HoldToCommit } from '@/components/HoldToCommit';
import { pickPhoto } from '@/components/pickPhoto';
import { OpTitle, Radio, Section, TopRow } from '@/components/ardent';
import { Icon } from '@/components/Icon';
import { Back, Dock, Input } from '@/components/ui';
import { clock } from '@/kit/format';
import { couldntGetIn, NO_ACCESS_REASONS } from '@/sync/actions';
import { card, useField } from '@/sync/hooks';
import { color, font, radius, space } from '@/theme/tokens';

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
        <View style={styles.pad}>
          <TopRow left={<Back label={job.ref} />} right={`${job.ref}   ${clock(new Date().toISOString())}`} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(400)}>
              <OpTitle size={21}>Couldn't get in</OpTitle>
              <Text style={styles.sub}>
                {job.title}
                {customer ? ` for ${customer.name}` : ''}
                {site ? `, ${site.line1}` : ''}. The job is paused and the office sees why.
              </Text>
            </Animated.View>

            <Section label="What happened" />
            <View style={{ gap: 6 }} accessibilityRole="radiogroup">
              {NO_ACCESS_REASONS.map((r) => (
                <Radio key={r} label={r} on={why === r} onPress={() => setWhy(r)} />
              ))}
            </View>

            <Section label="Show it" />
            <View style={styles.proof}>
              <Pressable onPress={take} style={({ pressed }) => [styles.shot, pressed && { opacity: 0.75 }]} accessibilityRole="button" accessibilityLabel={photo ? 'Retake photo' : 'Take a photo'}>
                {photo ? (
                  <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <>
                    <Icon name="camera" size={20} />
                    <Text style={styles.shotText}>The door</Text>
                  </>
                )}
              </Pressable>
              <Input value={detail} onChangeText={setDetail} placeholder="Rang twice, left a card" multiline style={styles.detail} accessibilityLabel="Anything else" />
            </View>
            <Text style={styles.hint}>{photo ? 'Tap the photo to take it again.' : 'A photo of the door, the key safe or whatever shows it.'}</Text>

            {!!problem && <Text style={styles.problem}>{problem}</Text>}
          </ScrollView>
        </KeyboardAvoidingView>
        <Dock>
          <HoldToCommit label={busy ? 'Saving' : 'Hold to tell the office'} icon="door" onCommit={log} disabled={!ready} />
        </Dock>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  pad: { paddingHorizontal: 22, paddingTop: space[3] },
  scroll: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: space[6] },
  sub: { color: color.fgMuted, fontFamily: font.sans, fontSize: 14, lineHeight: 20, marginTop: 8 },
  proof: { flexDirection: 'row', gap: 8 },
  shot: { width: 108, height: 108, borderRadius: radius.xl, backgroundColor: color.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shotText: { color: color.fg, fontFamily: font.sans, fontSize: 13 },
  detail: { flex: 1, minHeight: 108, textAlignVertical: 'top' },
  hint: { color: color.fgFaint, fontFamily: font.sans, fontSize: 13, marginTop: 8 },
  problem: { color: color.warn, fontFamily: font.sans, fontSize: 14, marginTop: space[4] },
});

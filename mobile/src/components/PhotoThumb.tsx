import { Image, StyleSheet, Text, View } from 'react-native';

import type { Photo } from '@/data/types';
import { isLocal } from '@/sync/ops';
import { usePhotoUri } from '@/sync/hooks';
import { color, font, radius } from '@/theme/tokens';

/** A photo on the job. One still on the phone waiting to send says so. */
export function PhotoThumb({ photo, size = 88, waiting }: { photo: Photo; size?: number; waiting?: boolean }) {
  const uri = usePhotoUri(photo);
  const onPhone = waiting ?? isLocal(photo.id);
  return (
    <View>
      <View style={[styles.frame, { width: size, height: size }]}>{uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}</View>
      <Text style={styles.caption}>
        {photo.stage}
        {onPhone ? ' · waiting' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, backgroundColor: color.raised, overflow: 'hidden' },
  caption: { color: color.fgFaint, fontFamily: font.sans, fontSize: 10, marginTop: 4 },
});

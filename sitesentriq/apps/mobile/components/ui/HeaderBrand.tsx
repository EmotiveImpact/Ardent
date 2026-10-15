import { View, Text, Image, StyleSheet } from 'react-native'

/**
 * Left-aligned app brand for the tab-screen headers — the SAME lockup as the web
 * app's `<Wordmark>`: the H-mark tile (coral H on navy) + "HAUMEA" in uppercase,
 * extra-light, wide letter-spacing. Replaces the per-screen centered title.
 */
export function HeaderBrand() {
  return (
    <View style={styles.row}>
      <Image source={require('../../assets/h-mark.png')} style={styles.mark} resizeMode="contain" />
      <Text style={styles.word}>HAUMEA</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // Negative marginLeft pulls the whole lockup left PAST the header's default
  // native left inset so the brand sits hard against the screen edge. Drop this
  // further (more negative) to move it left even more.
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, marginLeft: -4 },
  mark: { width: 30, height: 30, borderRadius: 7 },
  word: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '200',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
})

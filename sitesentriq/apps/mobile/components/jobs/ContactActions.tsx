import { View, Pressable, Linking, Platform } from 'react-native'
import { Phone, Navigation } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'

// Dynamic tints are applied via inline `style` — Uniwind compiles className at
// build time, so runtime/derived colors must go through the style prop.

/**
 * ContactActions — a row of round icon-buttons for a job's site contact.
 * Tap-to-call and tap-to-navigate. Renders nothing if there's no data.
 */
export function ContactActions({
  phone,
  address,
}: {
  phone?: string | null
  address?: string | null
}) {
  if (!phone && !address) return null

  const onCall = () => {
    Haptics.selectionAsync()
    Linking.openURL('tel:' + phone)
  }

  const onNavigate = () => {
    if (!address) return
    Haptics.selectionAsync()
    const q = encodeURIComponent(address)
    const native = Platform.OS === 'ios' ? 'maps://?q=' + q : 'geo:0,0?q=' + q
    Linking.openURL(native).catch(() => Linking.openURL('https://maps.google.com/?q=' + q))
  }

  return (
    <View className="flex-row gap-2.5">
      {phone ? (
        <Pressable
          onPress={onCall}
          accessibilityRole="button"
          accessibilityLabel="Call site contact"
          className="h-12 w-12 items-center justify-center rounded-xl border"
          style={({ pressed }) => ({
            backgroundColor: 'rgba(16,185,129,0.12)',
            borderColor: 'rgba(16,185,129,0.28)',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Phone size={20} color="#10b981" />
        </Pressable>
      ) : null}
      {address ? (
        <Pressable
          onPress={onNavigate}
          accessibilityRole="button"
          accessibilityLabel="Navigate to site"
          className="h-12 w-12 items-center justify-center rounded-xl border"
          style={({ pressed }) => ({
            backgroundColor: 'rgba(232,119,46,0.12)',
            borderColor: 'rgba(232,119,46,0.28)',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Navigation size={20} color="#e8772e" />
        </Pressable>
      ) : null}
    </View>
  )
}

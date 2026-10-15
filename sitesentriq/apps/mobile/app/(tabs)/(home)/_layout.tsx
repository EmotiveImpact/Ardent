import { Stack } from 'expo-router'
import { brandHeaderOptions } from '@/components/ui/nativeHeader'

// Native stack so the Today screen gets a real iOS large-title header.
// Profile lives in the header-right avatar.
export default function HomeStack() {
  return (
    <Stack screenOptions={brandHeaderOptions}>
      <Stack.Screen name="index" options={{ title: '' }} />
    </Stack>
  )
}

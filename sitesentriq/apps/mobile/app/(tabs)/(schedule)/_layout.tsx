import { Stack } from 'expo-router'
import { brandHeaderOptions } from '@/components/ui/nativeHeader'

export default function ScheduleStack() {
  return (
    <Stack screenOptions={brandHeaderOptions}>
      <Stack.Screen name="index" options={{ title: '' }} />
    </Stack>
  )
}

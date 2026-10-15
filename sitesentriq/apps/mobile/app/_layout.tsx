import '../global.css'
import { useEffect } from 'react'
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { HeroUINativeProvider } from 'heroui-native'
import { useAuth } from '@/hooks/useAuth'
import { setupNotificationResponseListener } from '@/lib/notifications'
import { loadPersistedTheme } from '@/lib/theme'
import { COLORS } from '@/constants/config'

function AuthGate() {
  const { session, loading } = useAuth()
  const segments = useSegments()
  const router = useRouter()
  const navigationState = useRootNavigationState()

  useEffect(() => {
    // Wait until navigation is mounted and auth state is resolved
    if (!navigationState?.key || loading) return

    const inAuthGroup = segments[0] === '(auth)'

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/(home)')
    }
  }, [session, loading, segments, navigationState?.key])

  return null
}

export default function RootLayout() {
  useEffect(() => {
    // Restore the user's saved light/dark choice before first interaction.
    void loadPersistedTheme()
    // Active app-wide: routes to the relevant job when a push is tapped
    // (foreground, background, or cold start). Cleaned up on unmount.
    const cleanup = setupNotificationResponseListener()
    return cleanup
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
      {/* The entire app top is navy chrome (login + every header) → light
          status-bar glyphs everywhere. */}
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="job/[id]"
          options={{
            presentation: 'card',
            headerShown: true,
            headerTitle: '',
            headerBackTitle: 'Back',
            headerShadowVisible: false,
            headerTintColor: COLORS.brand,
            headerStyle: { backgroundColor: COLORS.navy },
            headerTitleStyle: { color: '#ffffff' },
          }}
        />
        {/* P1 — asset detail (title set per-screen), notifications inbox, QR scanner */}
        <Stack.Screen
          name="asset/[id]"
          options={{
            headerShown: true,
            headerTitle: '',
            headerBackTitle: 'Back',
            headerShadowVisible: false,
            headerTintColor: COLORS.brand,
            headerStyle: { backgroundColor: COLORS.navy },
            headerTitleStyle: { color: '#ffffff' },
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            headerShown: true,
            title: 'Notifications',
            headerShadowVisible: false,
            headerTintColor: COLORS.brand,
            headerStyle: { backgroundColor: COLORS.navy },
            headerTitleStyle: { color: '#ffffff' },
          }}
        />
        <Stack.Screen name="scan" options={{ headerShown: false }} />
        <Stack.Screen
          name="map"
          options={{
            headerShown: true,
            title: 'Map',
            headerShadowVisible: false,
            headerTintColor: COLORS.brand,
            headerStyle: { backgroundColor: COLORS.navy },
            headerTitleStyle: { color: '#ffffff' },
          }}
        />
        <Stack.Screen
          name="job-chat/[id]"
          options={{
            headerShown: true,
            title: 'Messages',
            headerShadowVisible: false,
            headerTintColor: COLORS.brand,
            headerStyle: { backgroundColor: COLORS.navy },
            headerTitleStyle: { color: '#ffffff' },
          }}
        />
      </Stack>
      <AuthGate />
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  )
}

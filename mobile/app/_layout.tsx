import '@/polyfills';

import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { Michroma_400Regular } from '@expo-google-fonts/michroma';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { JobRequestOverlay } from '@/components/JobRequest';
import { TapProvider } from '@/payments/terminal';
import { field } from '@/sync/field';
import { useField } from '@/sync/hooks';
import { useVanLocation } from '@/sync/location';
import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded] = useFonts({
    Michroma_400Regular,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });
  const { state } = useField();
  const router = useRouter();
  useVanLocation();
  const segments = useSegments();

  useEffect(() => {
    void field.start();
  }, []);

  useEffect(() => {
    if (loaded && state.phase !== 'starting') SplashScreen.hideAsync().catch(() => {});
  }, [loaded, state.phase]);

  // Signed out (or the engine asked for sign-in again): back to the sign-in screen.
  useEffect(() => {
    if (state.phase === 'signed_out' && segments[0] !== 'sign-in') router.replace('/sign-in');
  }, [state.phase, segments, router]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      {/* Stripe Terminal for Tap to Pay, in Ardent's own app build only. */}
      <TapProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'fade' }} />
        {state.phase === 'signed_in' && <JobRequestOverlay />}
      </TapProvider>
    </SafeAreaProvider>
  );
}

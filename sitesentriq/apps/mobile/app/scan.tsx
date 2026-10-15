import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, Platform } from 'react-native'
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ChevronLeft, Camera as CameraIcon, CheckCircle2 } from 'lucide-react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import { recordQrCheckin } from '@/lib/qr'

type ScanResult = { data: string }

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const scanned = useRef(false)
  // Proof-of-presence mode (W2-T8): /scan?jobId=…&orgId=… records a
  // qr_checkin field event instead of navigating to the asset.
  const { jobId, orgId } = useLocalSearchParams<{ jobId?: string; orgId?: string }>()
  const checkinMode = !!jobId && !!orgId
  const [confirmed, setConfirmed] = useState(false)

  const handleScan = ({ data }: ScanResult) => {
    if (scanned.current) return
    scanned.current = true

    if (checkinMode) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setConfirmed(true)
      void (async () => {
        // Location is evidence garnish, not a requirement — a basement scan
        // with no fix must still record. Short, silent best-effort.
        let coords: { latitude: number; longitude: number; accuracy?: number | null } | null = null
        try {
          const { status } = await Location.getForegroundPermissionsAsync()
          if (status === 'granted') {
            const loc = await Location.getLastKnownPositionAsync()
            if (loc) {
              coords = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                accuracy: loc.coords.accuracy,
              }
            }
          }
        } catch {
          coords = null
        }
        try {
          await recordQrCheckin({ organisationId: orgId!, jobId: jobId!, raw: data, coords })
        } catch {
          // recordQrCheckin already falls back to the offline queue; a throw
          // here is unexpected — the confirmation stays (evidence intent is
          // logged) and the queue badge will surface any stuck sync.
        }
        setTimeout(() => router.back(), 900)
      })()
      return
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    // `/asset/[id]` is registered by the orchestrator; cast keeps this typed-routes-safe.
    router.replace(('/asset/' + encodeURIComponent(data.trim())) as Href)
  }

  // Native camera isn't available on web (and CameraView can be undefined there).
  const cameraUnavailable = Platform.OS === 'web' || !CameraView

  return (
    <View className="flex-1 bg-[#0f1225]">
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      {/* --- Permission not determined / denied --- */}
      {!permission || !permission.granted || cameraUnavailable ? (
        <View className="flex-1 items-center justify-center px-8">
          <BackButton />
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-[#1b2040]">
            <CameraIcon size={28} color="#e8772e" />
          </View>
          <Text className="mt-5 text-center text-[20px] font-bold text-white">
            {cameraUnavailable
              ? 'Camera not available'
              : checkinMode
                ? 'Scan to check in'
                : 'Scan asset QR codes'}
          </Text>
          <Text className="mt-2 text-center text-[15px] leading-5 text-[#9aa0c0]">
            {cameraUnavailable
              ? 'QR scanning needs a device camera, so it is not available here.'
              : permission && !permission.canAskAgain
                ? 'Camera access is turned off. Enable it for Haumea in your device Settings to scan QR codes.'
                : checkinMode
                  ? 'Allow camera access to scan the site or asset QR code as proof of presence.'
                  : 'Allow camera access to point at an asset QR code and jump straight to its details.'}
          </Text>

          {!cameraUnavailable && permission && (!permission.granted) && permission.canAskAgain && (
            <TouchableOpacity
              onPress={requestPermission}
              activeOpacity={0.85}
              className="mt-6 rounded-xl bg-[#e8772e] px-6 py-3.5"
            >
              <Text className="text-[15px] font-semibold text-white">Grant camera access</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* --- Live scanner --- */
        <View className="flex-1">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
          />

          {/* Overlay */}
          <View className="absolute inset-0 items-center justify-center">
            {/* Scrim */}
            <View className="absolute inset-0 bg-black/45" pointerEvents="none" />

            {/* Viewfinder frame (transparent center) */}
            <View
              className="h-[260px] w-[260px] rounded-2xl border-[3px] border-[#e8772e]"
              pointerEvents="none"
            />

            {confirmed ? (
              <View className="mt-6 flex-row items-center gap-2 rounded-xl bg-[#10b981] px-5 py-3">
                <CheckCircle2 size={20} color="#ffffff" />
                <Text className="text-[15px] font-semibold text-white">Checked in</Text>
              </View>
            ) : (
              <Text className="mt-6 px-8 text-center text-[15px] font-medium text-white">
                {checkinMode
                  ? 'Scan the site or asset QR to record your presence'
                  : "Point at the asset's QR code"}
              </Text>
            )}
          </View>

          <BackButton />
        </View>
      )}
    </View>
  )
}

function BackButton() {
  return (
    <TouchableOpacity
      onPress={() => router.back()}
      activeOpacity={0.7}
      className="absolute left-4 top-14 h-10 w-10 items-center justify-center rounded-full bg-black/40"
    >
      <ChevronLeft size={24} color="#ffffff" />
    </TouchableOpacity>
  )
}

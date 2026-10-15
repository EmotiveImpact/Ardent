import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native'
import MapView, { Marker, type Region } from 'react-native-maps'
import * as Location from 'expo-location'
import { Stack, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MapPin, Navigation, ChevronLeft, ChevronRight, X } from 'lucide-react-native'
import { useMapJobs, type MapJob } from '@/hooks/useMapJobs'
import { statusColor, StatusChip } from '@/components/ui/primitives'

const NAVY = '#0f172a'
const ORANGE = '#e8772e'
const NEUTRAL_BG = '#e8edf2'

export default function MapScreen() {
  const { jobs, loading, error, refetch } = useMapJobs()
  const insets = useSafeAreaInsets()
  const mapRef = useRef<MapView>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Keep a valid selection: default to the first (nearest) job once data arrives.
  useEffect(() => {
    if (jobs.length === 0) {
      setSelectedId(null)
      return
    }
    setSelectedId((prev) => (prev && jobs.some((j) => j.id === prev) ? prev : jobs[0].id))
  }, [jobs])

  // Frame all markers when data loads.
  useEffect(() => {
    if (jobs.length === 0) return
    const coords = jobs.map((j) => ({ latitude: j.latitude, longitude: j.longitude }))
    // Slight delay so the MapView is laid out before fitting.
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 240, left: 60 },
        animated: true,
      })
    }, 350)
    return () => clearTimeout(t)
  }, [jobs])

  // Foreground location permission (non-blocking — markers render regardless).
  useEffect(() => {
    if (Platform.OS === 'web') return
    Location.requestForegroundPermissionsAsync().catch(() => {
      /* denied / unavailable — map still shows job markers */
    })
  }, [])

  const selectedIndex = jobs.findIndex((j) => j.id === selectedId)
  const selectedJob: MapJob | undefined = selectedIndex >= 0 ? jobs[selectedIndex] : undefined

  const recenter = (job: MapJob) => {
    const region: Region = {
      latitude: job.latitude,
      longitude: job.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }
    mapRef.current?.animateToRegion(region, 350)
  }

  const select = (job: MapJob) => {
    setSelectedId(job.id)
    recenter(job)
  }

  const step = (dir: -1 | 1) => {
    if (jobs.length === 0 || selectedIndex < 0) return
    const next = (selectedIndex + dir + jobs.length) % jobs.length
    select(jobs[next])
  }

  const navigateTo = (job: MapJob) => {
    const { latitude: lat, longitude: lng } = job
    const url =
      Platform.OS === 'ios' ? `maps://?daddr=${lat},${lng}` : `geo:${lat},${lng}`
    Linking.openURL(url).catch(() => {
      // Fallback to a universal Google Maps link.
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)
    })
  }

  // ─── Web guard ────────────────────────────────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        <Stack.Screen options={{ title: 'Map' }} />
        <MapPin size={44} color={ORANGE} />
        <Text className="mt-3 text-base font-semibold text-foreground">Map isn&apos;t available on web</Text>
        <Text className="mt-1 text-center text-[13px] text-muted">
          Open the app on your device to view your jobs on a map.
        </Text>
      </View>
    )
  }

  // ─── Loading ──────────────────────────────────────────────────────────
  if (loading && jobs.length === 0) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: NEUTRAL_BG }}>
        <Stack.Screen options={{ title: 'Map' }} />
        <ActivityIndicator color={ORANGE} />
      </View>
    )
  }

  // ─── Error ────────────────────────────────────────────────────────────
  if (error && jobs.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        <Stack.Screen options={{ title: 'Map' }} />
        <X size={44} color="#ef4444" />
        <Text className="mt-3 text-base font-semibold text-foreground">Couldn&apos;t load the map</Text>
        <Text className="mt-1 text-center text-[13px] text-muted">{error}</Text>
        <Pressable
          onPress={refetch}
          className="mt-4 rounded-xl px-5 py-2.5"
          style={({ pressed }) => ({ backgroundColor: ORANGE, opacity: pressed ? 0.85 : 1 })}
        >
          <Text className="text-[14px] font-semibold text-white">Retry</Text>
        </Pressable>
      </View>
    )
  }

  // ─── Empty ────────────────────────────────────────────────────────────
  if (jobs.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-8">
        <Stack.Screen options={{ title: 'Map' }} />
        <MapPin size={44} color={ORANGE} />
        <Text className="mt-3 text-base font-semibold text-foreground">Nothing to map</Text>
        <Text className="mt-1 text-center text-[13px] text-muted">
          No jobs with a location to map.
        </Text>
      </View>
    )
  }

  // ─── Map + card ───────────────────────────────────────────────────────
  return (
    <View className="flex-1" style={{ backgroundColor: NEUTRAL_BG }}>
      <Stack.Screen options={{ title: 'Map' }} />

      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        showsUserLocation
        showsMyLocationButton
      >
        {jobs.map((job) => (
          <Marker
            key={job.id}
            coordinate={{ latitude: job.latitude, longitude: job.longitude }}
            pinColor={statusColor(job.status)}
            onPress={() => select(job)}
          />
        ))}
      </MapView>

      {/* Bottom card — the currently selected job */}
      {selectedJob ? (
        <View
          className="absolute left-3 right-3 rounded-2xl bg-surface"
          style={{
            bottom: insets.bottom + 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <View className="p-4">
            {/* Header row: title + chip */}
            <View className="mb-2 flex-row items-start justify-between gap-2">
              <Text className="flex-1 text-base font-bold text-foreground" numberOfLines={1}>
                {selectedJob.title}
              </Text>
              <StatusChip status={selectedJob.status} />
            </View>

            {/* Property + address */}
            {selectedJob.propertyName ? (
              <View className="mb-0.5 flex-row items-center gap-1.5">
                <MapPin size={14} color="#94a3b8" />
                <Text className="flex-1 text-[13px] font-semibold text-muted" numberOfLines={1}>
                  {selectedJob.propertyName}
                </Text>
              </View>
            ) : null}
            {selectedJob.address ? (
              <Text className="ml-[22px] text-[12px] text-muted" numberOfLines={1}>
                {selectedJob.address}
              </Text>
            ) : null}
            {selectedJob.scheduledTime ? (
              <Text className="mt-1 text-[12px] font-semibold text-[#e8772e]">
                {selectedJob.scheduledTime}
              </Text>
            ) : null}

            {/* Actions */}
            <View className="mt-3 flex-row items-center gap-2.5">
              <Pressable
                onPress={() => router.push(`/job/${selectedJob.id}`)}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-3"
                style={({ pressed }) => ({ backgroundColor: NAVY, opacity: pressed ? 0.85 : 1 })}
              >
                <Text className="text-[14px] font-semibold text-white">Open job</Text>
              </Pressable>
              <Pressable
                onPress={() => navigateTo(selectedJob)}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-3"
                style={({ pressed }) => ({ backgroundColor: ORANGE, opacity: pressed ? 0.85 : 1 })}
              >
                <Navigation size={16} color="#ffffff" />
                <Text className="text-[14px] font-semibold text-white">Navigate</Text>
              </Pressable>
            </View>

            {/* Pager — step through jobs */}
            {jobs.length > 1 ? (
              <View className="mt-3 flex-row items-center justify-between">
                <Pressable
                  onPress={() => step(-1)}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={({ pressed }) => ({ backgroundColor: '#f1f5f9', opacity: pressed ? 0.7 : 1 })}
                >
                  <ChevronLeft size={20} color="#475569" />
                </Pressable>
                <Text className="text-[12px] font-semibold text-muted">
                  {selectedIndex + 1} of {jobs.length}
                </Text>
                <Pressable
                  onPress={() => step(1)}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={({ pressed }) => ({ backgroundColor: '#f1f5f9', opacity: pressed ? 0.7 : 1 })}
                >
                  <ChevronRight size={20} color="#475569" />
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}

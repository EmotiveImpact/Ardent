import { useState } from 'react'
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native'
import { Package, MapPin, ChevronRight, ScanLine } from 'lucide-react-native'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { useAssets } from '@/hooks/useAssets'
import type { Asset } from '@/hooks/useAssets'
import { cardShadow } from '@/components/ui/primitives'

// Asset status colours — match the web status palette (operational/green,
// attention/amber, faulty or decommissioned/red). Unknown statuses fall back
// to muted grey rather than rendering unstyled. Dynamic (runtime) colours go
// through the inline `style` prop — uniwind compiles className at build time.
const ASSET_STATUS_COLORS: Record<string, string> = {
  operational: '#10b981',
  active: '#10b981',
  in_service: '#10b981',
  attention: '#f59e0b',
  due: '#f59e0b',
  faulty: '#ef4444',
  fault: '#ef4444',
  out_of_service: '#ef4444',
  decommissioned: '#94a3b8',
  retired: '#94a3b8',
}

function statusColor(status: string): string {
  return ASSET_STATUS_COLORS[status?.toLowerCase()] ?? '#94a3b8'
}

function titleCase(s: string): string {
  if (!s) return ''
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Assets register list. Headerless body designed to sit under the Reference
 * segmented control. Pulls its own data.
 */
export function AssetsList() {
  const { assets, loading, error, refetch } = useAssets()
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const categories = Array.from(
    new Set((assets ?? []).map((a) => a.category).filter(Boolean)),
  ).sort()

  const filtered: Asset[] = activeCategory
    ? (assets ?? []).filter((a) => a.category === activeCategory)
    : (assets ?? [])

  function selectCategory(cat: string | null) {
    Haptics.selectionAsync()
    setActiveCategory(cat)
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="p-4 pb-8"
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#e8772e" />}
    >
      {/* Scan an asset's QR code to jump straight to its detail. */}
      <Pressable
        onPress={() => router.push('/scan')}
        className="mb-3 flex-row items-center justify-center gap-2 rounded-2xl border border-[#e6e9ef] bg-surface py-3"
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <ScanLine size={18} color="#e8772e" />
        <Text className="text-[14px] font-semibold text-foreground">Scan asset QR</Text>
      </Pressable>

      {/* Category filter — unbounded count, so a horizontal scroller is correct.
          Light iOS filter chips (active = brand orange, inactive = white). */}
      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-4 mb-3"
          contentContainerClassName="px-4 gap-2"
        >
          <FilterChip label="All" active={activeCategory === null} onPress={() => selectCategory(null)} />
          {categories.map((cat) => (
            <FilterChip
              key={cat}
              label={titleCase(cat)}
              active={activeCategory === cat}
              onPress={() => selectCategory(cat)}
            />
          ))}
        </ScrollView>
      )}

      {loading && !(assets ?? []).length ? (
        <ActivityIndicator color="#e8772e" style={{ marginTop: 40 }} />
      ) : error ? (
        <View className="items-center px-8 pt-14">
          <Text className="text-base font-semibold text-foreground">Couldn't load assets</Text>
          <Text className="mt-1.5 text-center text-[13px] text-muted">{error}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View className="items-center px-8 pt-14">
          <Package size={44} color="#cbd5e1" />
          <Text className="mt-3 text-base font-semibold text-foreground">No assets found</Text>
          <Text className="mt-1.5 text-center text-[13px] text-muted">
            {activeCategory ? 'Try a different category.' : 'No assets are visible to you yet.'}
          </Text>
        </View>
      ) : (
        filtered.map((asset) => <AssetCard key={asset.id} asset={asset} />)
      )}
    </ScrollView>
  )
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className="rounded-full border px-3.5 py-2"
      style={{
        backgroundColor: active ? '#e8772e' : '#ffffff',
        borderColor: active ? '#e8772e' : '#e6e9ef',
      }}
    >
      <Text className="text-[13px] font-semibold" style={{ color: active ? '#ffffff' : '#475569' }}>
        {label}
      </Text>
    </Pressable>
  )
}

function AssetCard({ asset }: { asset: Asset }) {
  const c = statusColor(asset.status)
  return (
    <Pressable
      onPress={() => router.push(`/asset/${asset.id}`)}
      className="mb-2.5 rounded-2xl border border-border bg-surface"
      style={({ pressed }) => [cardShadow, { opacity: pressed ? 0.9 : 1 }]}
    >
      <View className="flex-row items-center p-3.5">
        {/* category icon tile */}
        <View
          className="mr-3 h-11 w-11 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'rgba(232,119,46,0.12)' }}
        >
          <Package size={20} color="#e8772e" />
        </View>

        <View className="flex-1">
          <Text className="mb-1 text-base font-semibold text-foreground" numberOfLines={1}>
            {asset.name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {!!asset.category && (
              <View className="rounded-md bg-surface-secondary px-2 py-0.5">
                <Text className="text-[11px] font-medium text-muted" numberOfLines={1}>
                  {titleCase(asset.category)}
                </Text>
              </View>
            )}
          </View>
          {!!asset.properties?.name && (
            <View className="mt-1 flex-row items-center gap-1">
              <MapPin size={13} color="#94a3b8" />
              <Text className="text-[13px] text-muted" numberOfLines={1}>
                {asset.properties.name}
              </Text>
            </View>
          )}
        </View>

        {/* status chip — colour is runtime-driven, so via inline style */}
        <View className="ml-2 rounded-full px-2.5 py-1" style={{ backgroundColor: `${c}1A` }}>
          <Text className="text-xs font-semibold" style={{ color: c }}>
            {titleCase(asset.status) || 'Unknown'}
          </Text>
        </View>
        <ChevronRight size={16} color="#cbd5e1" style={{ marginLeft: 4 }} />
      </View>
    </Pressable>
  )
}

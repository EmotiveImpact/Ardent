import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, ActivityIndicator } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import {
  Package,
  MapPin,
  Tag,
  Hash,
  Calendar,
  AlertTriangle,
  Wrench,
  Box,
  FileText,
} from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { StatusChip, SectionLabel, statusColor } from '@/components/ui/primitives'

// ─── Types ────────────────────────────────────────────────────────────
interface AssetDetail {
  id: string
  name: string
  category: string | null
  make: string | null
  model: string | null
  serial_number: string | null
  install_date: string | null
  status: string
  notes: string | null
  property_id: string | null
  area_id: string | null
  properties?: { name: string | null; address: string | null } | null
}

interface ActionRow {
  id: string
  title: string | null
  description: string | null
  priority: string | null
  status: string | null
  due_date: string | null
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────
function titleCase(s?: string | null): string {
  if (!s) return ''
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(d?: string | null): string | null {
  if (!d) return null
  const parsed = new Date(d)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Defect priority → colour. Runtime-driven, so applied via inline `style`.
const PRIORITY_COLORS: Record<string, string> = {
  low: '#94a3b8',
  medium: '#f59e0b',
  high: '#ef4444',
  urgent: '#ef4444',
  critical: '#dc2626',
}
function priorityColor(p?: string | null): string {
  return PRIORITY_COLORS[(p ?? '').toLowerCase()] ?? '#94a3b8'
}

// ─── Screen ───────────────────────────────────────────────────────────
export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  const [asset, setAsset] = useState<AssetDetail | null>(null)
  const [actions, setActions] = useState<ActionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [assetRes, actionsRes] = await Promise.all([
        supabase
          .from('assets')
          .select('*, properties(name, address)')
          .eq('id', id)
          // maybeSingle (not single) so a missing asset returns null instead of
          // a PGRST116 error — lets the friendly "Asset not found" state render
          // when a stale/unknown QR code is scanned.
          .maybeSingle(),
        supabase
          .from('actions')
          .select('id, title, description, priority, status, due_date, created_at')
          .eq('asset_id', id)
          // The section is "Open Defects" — exclude terminal statuses (actions
          // are open|in_progress|resolved|closed per migration 00081) so an asset
          // with only historical (resolved/closed) defects doesn't display them
          // as if they were live on-site work.
          .not('status', 'in', '(resolved,closed)')
          .order('created_at', { ascending: false }),
      ])

      if (assetRes.error) throw assetRes.error
      // Surface a failed defects query instead of swallowing it — otherwise the
      // safety-relevant "Open Defects" section rendered a FALSE "No defects
      // logged" empty state when the query actually errored.
      if (actionsRes.error) throw actionsRes.error
      setAsset(assetRes.data as AssetDetail)
      setActions((actionsRes.data as ActionRow[]) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load asset')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // ── Loading / error / not-found states (match Today's muted styling) ──
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Stack.Screen options={{ title: 'Asset' }} />
        <ActivityIndicator color="#e8772e" />
      </View>
    )
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Stack.Screen options={{ title: 'Asset' }} />
        <Text className="text-base font-semibold text-foreground">Couldn't load asset</Text>
        <Text className="mt-1.5 text-center text-[13px] text-muted">{error}</Text>
      </View>
    )
  }

  if (!asset) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Stack.Screen options={{ title: 'Asset' }} />
        <Package size={44} color="#cbd5e1" />
        <Text className="mt-3 text-base font-semibold text-foreground">Asset not found</Text>
        <Text className="mt-1.5 text-center text-[13px] text-muted">
          This asset may have been removed or isn't visible to you.
        </Text>
      </View>
    )
  }

  const propertyName = asset.properties?.name ?? null
  const propertyAddress = asset.properties?.address ?? null

  // Detail rows — skip null/empty values.
  const detailRows: { icon: React.ReactNode; label: string; value: string }[] = []
  if (asset.make) detailRows.push({ icon: <Box size={16} color="#94a3b8" />, label: 'Make', value: asset.make })
  if (asset.model) detailRows.push({ icon: <Tag size={16} color="#94a3b8" />, label: 'Model', value: asset.model })
  if (asset.serial_number)
    detailRows.push({ icon: <Hash size={16} color="#94a3b8" />, label: 'Serial number', value: asset.serial_number })
  const installDate = formatDate(asset.install_date)
  if (installDate)
    detailRows.push({ icon: <Calendar size={16} color="#94a3b8" />, label: 'Install date', value: installDate })
  if (propertyName)
    detailRows.push({
      icon: <MapPin size={16} color="#94a3b8" />,
      label: 'Location',
      value: propertyAddress ? `${propertyName} — ${propertyAddress}` : propertyName,
    })

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: asset.name ?? 'Asset' }} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-8"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO ───────────────────────────────────────────────── */}
        <View className="rounded-2xl border border-border bg-surface">
          <View className="p-4">
            <View className="mb-2 flex-row items-start justify-between gap-3">
              <View className="flex-1 flex-row items-center gap-2.5">
                <View
                  className="h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'rgba(232,119,46,0.12)' }}
                >
                  <Package size={20} color="#e8772e" />
                </View>
                <Text className="flex-1 text-[19px] font-bold text-foreground" numberOfLines={2}>
                  {asset.name}
                </Text>
              </View>
              <StatusChip status={asset.status} label={titleCase(asset.status) || 'Unknown'} />
            </View>

            <View className="flex-row flex-wrap items-center gap-1.5">
              {!!asset.category && (
                <View className="rounded-md bg-surface-secondary px-2 py-0.5">
                  <Text className="text-[11px] font-medium text-muted">{titleCase(asset.category)}</Text>
                </View>
              )}
            </View>

            {!!propertyName && (
              <View className="mt-2 flex-row items-center gap-1">
                <MapPin size={14} color="#94a3b8" />
                <Text className="text-[13px] text-muted" numberOfLines={1}>
                  {propertyName}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── DETAILS ────────────────────────────────────────────── */}
        {detailRows.length > 0 && (
          <View className="mt-5">
            <SectionLabel>Details</SectionLabel>
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              {detailRows.map((row, i) => (
                <View
                  key={row.label}
                  className={`flex-row items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  {row.icon}
                  <Text className="text-[13px] text-muted">{row.label}</Text>
                  <Text className="flex-1 text-right text-[14px] font-medium text-foreground" numberOfLines={2}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── NOTES ──────────────────────────────────────────────── */}
        {!!asset.notes && (
          <View className="mt-5">
            <SectionLabel>Notes</SectionLabel>
            <View className="rounded-2xl border border-border bg-surface p-4">
              <View className="mb-1.5 flex-row items-center gap-1.5">
                <FileText size={14} color="#94a3b8" />
                <Text className="text-[12px] font-semibold text-muted">Engineer notes</Text>
              </View>
              <Text className="text-[14px] leading-5 text-foreground">{asset.notes}</Text>
            </View>
          </View>
        )}

        {/* ── DEFECTS ────────────────────────────────────────────── */}
        <View className="mt-5">
          <SectionLabel>Open Defects</SectionLabel>
          {actions.length === 0 ? (
            <View className="items-center rounded-2xl border border-border bg-surface px-8 py-10">
              <Wrench size={36} color="#cbd5e1" />
              <Text className="mt-2.5 text-[14px] font-semibold text-foreground">No defects logged</Text>
              <Text className="mt-1 text-center text-[12px] text-muted">
                This asset has no open actions or defects.
              </Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              {actions.map((action, i) => {
                const pc = priorityColor(action.priority)
                const due = formatDate(action.due_date)
                return (
                  <View
                    key={action.id}
                    className={`px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}
                  >
                    <View className="mb-1 flex-row items-center justify-between gap-2">
                      <View className="flex-1 flex-row items-center gap-1.5">
                        <AlertTriangle size={14} color={pc} />
                        <Text className="flex-1 text-[14px] font-semibold text-foreground" numberOfLines={1}>
                          {action.title || 'Untitled defect'}
                        </Text>
                      </View>
                      {!!action.priority && (
                        <View
                          className="rounded-full px-2 py-0.5"
                          style={{ backgroundColor: `${pc}1A` }}
                        >
                          <Text className="text-[11px] font-semibold" style={{ color: pc }}>
                            {titleCase(action.priority)}
                          </Text>
                        </View>
                      )}
                    </View>
                    {!!action.description && (
                      <Text className="mb-1.5 text-[13px] leading-5 text-muted" numberOfLines={3}>
                        {action.description}
                      </Text>
                    )}
                    <View className="flex-row items-center gap-3">
                      {!!action.status && (
                        <Text className="text-[12px] text-muted">{titleCase(action.status)}</Text>
                      )}
                      {!!due && (
                        <View className="flex-row items-center gap-1">
                          <Calendar size={12} color="#94a3b8" />
                          <Text className="text-[12px] text-muted">Due {due}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

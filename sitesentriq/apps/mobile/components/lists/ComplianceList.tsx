import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { ShieldCheck, MapPin, CalendarClock } from 'lucide-react-native'
import { useCompliance } from '@/hooks/useCompliance'
import type { ComplianceItem } from '@/hooks/useCompliance'
import { cardShadow } from '@/components/ui/primitives'

// Compliance status colours — match the web status palette:
// Compliant=green, Due Soon=amber, Overdue/Non-Compliant=red. Dynamic (runtime)
// colours go through the inline `style` prop — uniwind compiles className at
// build time, so it can't generate classes from runtime values.
const COMPLIANCE_STATUS_COLORS: Record<string, string> = {
  compliant: '#10b981',
  due_soon: '#f59e0b',
  due: '#f59e0b',
  upcoming: '#f59e0b',
  overdue: '#ef4444',
  non_compliant: '#dc2626',
  failed: '#dc2626',
}

function statusColor(status: string): string {
  return COMPLIANCE_STATUS_COLORS[status?.toLowerCase()] ?? '#94a3b8'
}

function titleCase(s: string): string {
  if (!s) return ''
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDueDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Compliance register list. Headerless body designed to sit under the Reference
 * segmented control. Pulls its own data.
 */
export function ComplianceList() {
  const { items, loading, error, refetch } = useCompliance()
  const list = items ?? []

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="p-4 pb-8"
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#e8772e" />}
    >
      {loading && !list.length ? (
        <ActivityIndicator color="#e8772e" style={{ marginTop: 40 }} />
      ) : error ? (
        <View className="items-center px-8 pt-14">
          <Text className="text-base font-semibold text-foreground">Couldn't load compliance</Text>
          <Text className="mt-1.5 text-center text-[13px] text-muted">{error}</Text>
        </View>
      ) : list.length === 0 ? (
        <View className="items-center px-8 pt-14">
          <ShieldCheck size={44} color="#cbd5e1" />
          <Text className="mt-3 text-base font-semibold text-foreground">No compliance items</Text>
          <Text className="mt-1.5 text-center text-[13px] text-muted">
            Compliance items for your sites will appear here.
          </Text>
        </View>
      ) : (
        list.map((item) => <ComplianceCard key={item.id} item={item} />)
      )}
    </ScrollView>
  )
}

function ComplianceCard({ item }: { item: ComplianceItem }) {
  const c = statusColor(item.status)
  const due = formatDueDate(item.next_due)

  return (
    <View className="mb-2.5 rounded-2xl border border-border bg-surface" style={cardShadow}>
      <View className="flex-row items-center p-3.5">
        {/* type icon tile */}
        <View
          className="mr-3 h-11 w-11 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'rgba(232,119,46,0.12)' }}
        >
          <ShieldCheck size={20} color="#e8772e" />
        </View>

        <View className="flex-1">
          <Text className="mb-1 text-base font-semibold text-foreground" numberOfLines={2}>
            {item.name}
          </Text>
          {!!item.compliance_type && (
            <View className="flex-row">
              <View className="rounded-md bg-surface-secondary px-2 py-0.5">
                <Text className="text-[11px] font-medium text-muted" numberOfLines={1}>
                  {titleCase(item.compliance_type)}
                </Text>
              </View>
            </View>
          )}
          {!!item.properties?.name && (
            <View className="mt-1 flex-row items-center gap-1">
              <MapPin size={13} color="#94a3b8" />
              <Text className="text-[13px] text-muted" numberOfLines={1}>
                {item.properties.name}
              </Text>
            </View>
          )}
          {!!due && (
            <View className="mt-1 flex-row items-center gap-1">
              <CalendarClock size={13} color="#94a3b8" />
              <Text className="text-[13px] text-muted">Due {due}</Text>
            </View>
          )}
        </View>

        {/* status chip — colour is runtime-driven, so via inline style */}
        <View className="ml-2 self-start rounded-full px-2.5 py-1" style={{ backgroundColor: `${c}1A` }}>
          <Text className="text-xs font-semibold" style={{ color: c }}>
            {titleCase(item.status) || 'Unknown'}
          </Text>
        </View>
      </View>
    </View>
  )
}

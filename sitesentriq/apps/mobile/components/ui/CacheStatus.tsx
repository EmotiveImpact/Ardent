import { View, Text } from 'react-native'
import { Clock3, TriangleAlert } from 'lucide-react-native'

export function CacheStatus({ lastUpdated, isStale }: { lastUpdated: string | null; isStale: boolean }) {
  if (!lastUpdated) return null

  const parsed = new Date(lastUpdated)
  const label = Number.isNaN(parsed.getTime())
    ? 'Update time unavailable'
    : `Last updated ${parsed.toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}`

  return (
    <View className="mb-3 flex-row items-center gap-1.5">
      {isStale ? <TriangleAlert size={13} color="#f59e0b" /> : <Clock3 size={13} color="#64748b" />}
      <Text className={`text-[12px] font-medium ${isStale ? 'text-[#b45309]' : 'text-muted'}`}>
        {label}{isStale ? ' · may be out of date' : ''}
      </Text>
    </View>
  )
}

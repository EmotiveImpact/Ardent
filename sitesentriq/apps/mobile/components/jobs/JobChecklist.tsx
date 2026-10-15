import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { CheckSquare2, Square } from 'lucide-react-native'
import { CacheStatus } from '@/components/ui/CacheStatus'
import type { JobTaskRow } from '@/hooks/useJobTasks'

export function JobChecklist({
  tasks,
  loading,
  error,
  lastUpdated,
  isStale,
  onToggle,
}: {
  tasks: JobTaskRow[]
  loading: boolean
  error: string | null
  lastUpdated: string | null
  isStale: boolean
  onToggle: (task: JobTaskRow) => Promise<unknown>
}) {
  return (
    <View>
      <CacheStatus lastUpdated={lastUpdated} isStale={isStale} />
      {loading && tasks.length === 0 ? <ActivityIndicator color="#e8772e" /> : null}
      {error && tasks.length === 0 ? <Text className="text-[14px] text-muted">{error}</Text> : null}
      {!loading && !error && tasks.length === 0 ? (
        <Text className="text-[14px] text-muted">No checklist has been added to this job.</Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">
        {tasks.map((task, index) => {
          const complete = task.outcome === 'complete'
          return (
            <Pressable
              key={task.id}
              onPress={() => { void onToggle(task) }}
              className="flex-row items-start gap-3 px-4 py-4"
              style={{ borderTopWidth: index === 0 ? 0 : 1, borderTopColor: '#e2e8f0' }}
            >
              {complete ? <CheckSquare2 size={22} color="#10b981" /> : <Square size={22} color="#94a3b8" />}
              <Text className={`flex-1 text-[15px] ${complete ? 'text-muted line-through' : 'text-foreground'}`}>
                {task.description || 'Untitled task'}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

import { useState } from 'react'
import { View, Text, StyleSheet, TextInput, ActivityIndicator, Alert } from 'react-native'
import { Button, Switch } from 'heroui-native'
import { Segmented as SegmentedControl } from '@/components/ui/Segmented'
import * as Haptics from 'expo-haptics'
import { Clock } from 'lucide-react-native'
import { COLORS } from '@/constants/config'
import { parseDurationMinutes } from '@/lib/duration'
import { useAppTheme } from '@/lib/theme'

// Time-entry kinds mirror the WEB canonical set
// (apps/web/src/lib/time-tracking — KIND_OPTIONS) AND the DB CHECK
// constraint on time_entries.kind, which allows ONLY these four values.
// 'labour' is NOT valid and would throw on insert/offline-replay.
const KIND_OPTIONS: Array<{ value: 'travel' | 'on_site' | 'admin' | 'break'; label: string }> = [
  { value: 'travel', label: 'Travel' },
  { value: 'on_site', label: 'On site' },
  { value: 'admin', label: 'Admin' },
  { value: 'break', label: 'Break' },
]

type TimeKind = 'travel' | 'on_site' | 'admin' | 'break'

// Minimal shape of the SegmentedControl onChange event we read. Declared
// locally so the file does not depend on the library's ambient types, which
// resolve inconsistently against the monorepo's duplicate @types/react.
type SegmentedChangeEvent = { nativeEvent: { selectedSegmentIndex: number } }

export interface TimeEntrySubmit {
  kind: TimeKind
  startedAt: string
  endedAt: string
  billable: boolean
  notes: string | null
}

interface TimeEntryFormProps {
  // Returns { error } | { error, queued } like addNote / submitServiceReport.
  onSubmit: (payload: TimeEntrySubmit) => Promise<{ error: { message: string } | null; queued?: boolean }>
}

export function TimeEntryForm({ onSubmit }: TimeEntryFormProps) {
  const { isDark } = useAppTheme()
  const [kind, setKind] = useState<TimeKind>('on_site')
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')
  // Breaks are unbillable by default, mirroring the web's behaviour
  // (TIME_ENTRY_DEFAULT_BILLABLE — break = false, others = true).
  const [billable, setBillable] = useState(true)
  const [saving, setSaving] = useState(false)

  function handleKind(next: TimeKind) {
    Haptics.selectionAsync()
    setKind(next)
    // Match the web: switching to break forces unbillable.
    if (next === 'break') setBillable(false)
  }

  async function handleSave() {
    const mins = parseDurationMinutes(duration)
    if (mins == null) {
      Alert.alert('Enter a duration', 'e.g. 90, 1h30, or 1:30')
      return
    }
    setSaving(true)
    // The web stores started_at + ended_at and lets the timesheet derive the
    // duration. We don't capture wall-clock start on site, so we anchor the
    // entry to "now" and back-date the start by the entered duration — giving
    // a valid started_at/ended_at pair that yields the right elapsed minutes.
    const endedAt = new Date()
    const startedAt = new Date(endedAt.getTime() - mins * 60_000)
    const result = await onSubmit({
      kind,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      billable,
      notes: notes.trim() || null,
    })
    setSaving(false)
    if (result.error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('Could not log time', result.error.message)
      return
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setDuration('')
    setNotes('')
    setKind('on_site')
    setBillable(true)
    Alert.alert(
      result.queued ? 'Time saved offline' : 'Time logged',
      result.queued
        ? "We'll sync it when you're back on signal."
        : 'The entry has been added to this job.',
    )
  }

  return (
    <View className="bg-surface border-border" style={styles.card}>
      <Text className="text-muted" style={styles.fieldLabel}>Kind</Text>
      <SegmentedControl
        values={KIND_OPTIONS.map(opt => opt.label)}
        selectedIndex={KIND_OPTIONS.findIndex(opt => opt.value === kind)}
        onChange={(event: SegmentedChangeEvent) => {
          const next = KIND_OPTIONS[event.nativeEvent.selectedSegmentIndex]
          if (next) handleKind(next.value)
        }}
        tintColor={COLORS.brand}
        backgroundColor={isDark ? '#2c2c2e' : COLORS.background}
        fontStyle={{ color: isDark ? '#e5e5ea' : COLORS.text }}
        activeFontStyle={{ color: '#fff', fontWeight: '600' }}
      />

      <Text className="text-muted" style={[styles.fieldLabel, { marginTop: 12 }]}>Duration</Text>
      <TextInput
        value={duration}
        onChangeText={setDuration}
        placeholder="e.g. 90, 1h30, or 1:30"
        placeholderTextColor={COLORS.muted}
        keyboardType="numbers-and-punctuation"
        className="text-foreground border-border"
        style={styles.input}
      />

      <View style={styles.billableRow}>
        <Text className="text-foreground" style={[styles.billableText, kind === 'break' && { opacity: 0.5 }]}>
          Billable{kind === 'break' ? ' (breaks are unbillable)' : ''}
        </Text>
        <Switch
          isSelected={billable}
          onSelectedChange={setBillable}
          isDisabled={kind === 'break'}
        />
      </View>

      <Text className="text-muted" style={[styles.fieldLabel, { marginTop: 12 }]}>Notes</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional context…"
        placeholderTextColor={COLORS.muted}
        multiline
        numberOfLines={2}
        className="text-foreground border-border"
        style={[styles.input, { minHeight: 56, textAlignVertical: 'top' }]}
      />

      <Button
        variant="primary"
        style={[styles.submitBtn, { opacity: duration.trim() && !saving ? 1 : 0.5 }]}
        isDisabled={!duration.trim() || saving}
        onPress={handleSave}
      >
        <Button.Label>
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <View style={styles.submitBtnInner}>
              <Clock size={16} color="#fff" />
              <Text style={styles.submitBtnText}>Log time</Text>
            </View>
          )}
        </Button.Label>
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  billableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 16,
  },
  billableText: {
    fontSize: 14,
    fontWeight: '500',
  },
  submitBtn: {
    minHeight: 52,
    marginTop: 16,
  },
  submitBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
})

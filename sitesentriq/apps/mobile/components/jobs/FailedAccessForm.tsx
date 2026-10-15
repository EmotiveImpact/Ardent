import { useState } from 'react'
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native'
import { Button } from 'heroui-native'
import * as Haptics from 'expo-haptics'
import { AlertTriangle, Check } from 'lucide-react-native'

// ─── Reasons ─────────────────────────────────────────────────────────────
// A small fixed set of "couldn't get in" reasons. The value is the stable
// payload key; the label is what the engineer taps. `other` lets them fall
// back to the notes field for anything not covered here.
export type FailedAccessReason =
  | 'no_access'
  | 'site_closed'
  | 'wrong_details'
  | 'no_one_present'
  | 'other'

export const FAILED_ACCESS_REASONS: ReadonlyArray<{
  value: FailedAccessReason
  label: string
}> = [
  { value: 'no_access', label: 'No access' },
  { value: 'site_closed', label: 'Site closed' },
  { value: 'wrong_details', label: 'Wrong details' },
  { value: 'no_one_present', label: 'No one present' },
  { value: 'other', label: 'Other' },
]

export interface FailedAccessFormProps {
  onSubmit: (payload: { reason: string; notes: string }) => void | Promise<void>
  submitting?: boolean
}

export function FailedAccessForm({ onSubmit, submitting = false }: FailedAccessFormProps) {
  const [reason, setReason] = useState<FailedAccessReason>('no_access')
  const [notes, setNotes] = useState('')

  function handleSelect(next: FailedAccessReason) {
    if (next === reason) return
    setReason(next)
    void Haptics.selectionAsync()
  }

  function handleSubmit() {
    if (submitting) return
    void onSubmit({ reason, notes: notes.trim() })
  }

  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      {/* Heading */}
      <View className="mb-4 flex-row items-center gap-2">
        <View
          className="h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}
        >
          <AlertTriangle size={18} color="#ef4444" />
        </View>
        <Text className="text-base font-bold text-foreground">Couldn't get in?</Text>
      </View>

      {/* Reason selector — vertical list of selectable rows */}
      <Text className="mb-2 ml-1 text-[11px] font-bold uppercase tracking-wider text-muted">
        Reason
      </Text>
      <View className="gap-2">
        {FAILED_ACCESS_REASONS.map((opt) => {
          const selected = opt.value === reason
          return (
            <Pressable
              key={opt.value}
              onPress={() => handleSelect(opt.value)}
              className={`flex-row items-center justify-between rounded-xl border bg-surface px-3.5 py-3 ${selected ? 'border-[#e8772e]' : 'border-border'}`}
              style={({ pressed }) => ({
                backgroundColor: selected ? 'rgba(232,119,46,0.08)' : undefined,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                className={`text-[15px] ${selected ? 'text-foreground font-semibold' : 'text-muted'}`}
              >
                {opt.label}
              </Text>
              {selected ? (
                <View
                  className="h-5 w-5 items-center justify-center rounded-full"
                  style={{ backgroundColor: '#e8772e' }}
                >
                  <Check size={13} color="#ffffff" strokeWidth={3} />
                </View>
              ) : (
                <View className="h-5 w-5 rounded-full border border-border" />
              )}
            </Pressable>
          )
        })}
      </View>

      {/* Notes */}
      <Text className="mb-2 ml-1 mt-4 text-[11px] font-bold uppercase tracking-wider text-muted">
        Notes
      </Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="What happened? (optional)"
        placeholderTextColor="#94a3b8"
        multiline
        numberOfLines={3}
        className="rounded-xl border border-border px-3.5 py-3 text-[15px] text-foreground"
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />

      {/* Submit — prominent danger button */}
      <Button
        variant="danger"
        isDisabled={submitting}
        onPress={handleSubmit}
        className="mt-4"
        style={{ minHeight: 52, opacity: submitting ? 0.6 : 1 }}
      >
        <Button.Label>
          {submitting ? (
            <View className="flex-row items-center justify-center gap-2">
              <ActivityIndicator color="#ffffff" size="small" />
              <Text className="text-[15px] font-semibold text-white">Reporting…</Text>
            </View>
          ) : (
            <View className="flex-row items-center justify-center gap-2">
              <AlertTriangle size={18} color="#ffffff" />
              <Text className="text-[15px] font-semibold text-white">Report No Access</Text>
            </View>
          )}
        </Button.Label>
      </Button>
    </View>
  )
}

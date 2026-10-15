import { useState } from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native'
import { Button } from 'heroui-native'
import * as Haptics from 'expo-haptics'
import { Package, Minus, Plus } from 'lucide-react-native'

// Payload contract — kept deliberately small. The parent owns persistence
// (insert / offline-queue) and resets/hides the card after a successful call,
// mirroring TimeEntryForm / RaiseDefectForm.
export type PartsSubmit = {
  description: string
  quantity: number
  unitCost: number | null
}

interface PartsFormProps {
  // Returns the persistence result so we only clear the form on success. The
  // parent owns the success/error haptic + alert (see handleAddPart).
  onSubmit: (payload: PartsSubmit) => void | Promise<{ error?: unknown } | void>
  submitting?: boolean
}

// Parse the optional "unit cost" field. Blank → null (cost is optional).
// A non-numeric / negative value also collapses to null rather than NaN.
function parseUnitCost(raw: string): number | null {
  // Normalize before parsing: strip currency symbols/spaces and accept a
  // decimal COMMA (European keyboards on decimal-pad emit '12,50'). Without this,
  // '12,50' → Number() = NaN → silently dropped, losing the cost for invoicing.
  const s = raw.trim().replace(/[£$€\s]/g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function PartsForm({ onSubmit, submitting = false }: PartsFormProps) {
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [cost, setCost] = useState('')

  const trimmed = description.trim()
  const canSubmit = trimmed.length > 0 && !submitting

  function decrement() {
    Haptics.selectionAsync()
    // Floor at 1, integer only.
    setQuantity((q) => Math.max(1, Math.floor(q) - 1))
  }

  function increment() {
    Haptics.selectionAsync()
    setQuantity((q) => Math.max(1, Math.floor(q) + 1))
  }

  async function handleSubmit() {
    if (!trimmed || submitting) return
    // The parent fires the success/error haptic based on the real result — don't
    // pre-fire Success here (it produced a false Success-then-Error buzz on a
    // failed save).
    const res = await onSubmit({ description: trimmed, quantity, unitCost: parseUnitCost(cost) })
    // Keep the engineer's input if the save failed so they don't have to re-type.
    if (res && (res as { error?: unknown }).error) return
    setDescription('')
    setQuantity(1)
    setCost('')
  }

  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      {/* Heading */}
      <View className="flex-row items-center gap-2">
        <Package size={18} color="#e8772e" />
        <Text className="text-[15px] font-semibold text-foreground">Add a part</Text>
      </View>

      {/* Description */}
      <Text className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Description
      </Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. 2× isolation valve"
        placeholderTextColor="#94a3b8"
        className="rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] text-foreground"
      />

      {/* Quantity stepper */}
      <Text className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Quantity
      </Text>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={decrement}
          disabled={quantity <= 1}
          hitSlop={8}
          style={{ opacity: quantity <= 1 ? 0.4 : 1 }}
          className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface"
        >
          <Minus size={18} color="#0f172a" />
        </Pressable>
        <Text className="min-w-[32px] text-center text-[18px] font-semibold text-foreground">
          {quantity}
        </Text>
        <Pressable
          onPress={increment}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface"
        >
          <Plus size={18} color="#0f172a" />
        </Pressable>
      </View>

      {/* Unit cost (optional) */}
      <Text className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Unit cost (optional)
      </Text>
      <View className="flex-row items-center rounded-xl border border-border bg-surface px-3">
        <Text className="text-[15px] text-muted">£</Text>
        <TextInput
          value={cost}
          onChangeText={setCost}
          placeholder="0.00"
          placeholderTextColor="#94a3b8"
          keyboardType="decimal-pad"
          className="flex-1 py-2.5 pl-1.5 text-[14px] text-foreground"
        />
      </View>

      {/* Submit */}
      <Button
        variant="primary"
        isDisabled={!canSubmit}
        onPress={handleSubmit}
        style={{ opacity: canSubmit ? 1 : 0.5, minHeight: 52 }}
        className="mt-5"
      >
        <Button.Label>
          {submitting ? (
            <View className="flex-row items-center justify-center gap-2">
              <ActivityIndicator color="#ffffff" size="small" />
              <Text className="text-[15px] font-semibold text-white">Adding…</Text>
            </View>
          ) : (
            <Text className="text-[15px] font-semibold text-white">Add part</Text>
          )}
        </Button.Label>
      </Button>
    </View>
  )
}

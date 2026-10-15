import { useState } from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { ClipboardCheck } from 'lucide-react-native'
import { COLORS } from '@/constants/config'
import { CERT_FORM_TEMPLATES, type CertTemplate } from '@/constants/cert-forms'

type Outcome = 'pass' | 'fail' | 'remedial' | 'n_a'

interface CertFormProps {
  /** Assets at the job's property — the engineer can tie the cert to one. */
  assets?: { id: string; name: string }[]
  onSubmit: (payload: {
    certType: string
    answers: Record<string, string>
    outcome: Outcome
    notes: string | null
    assetId: string | null
  }) => Promise<{ error: { message: string } | null; queued?: boolean }>
}

const PF_OPTIONS = ['Pass', 'Fail', 'N/A'] as const
const OUTCOMES: { value: Outcome; label: string; color: string }[] = [
  { value: 'pass', label: 'Pass', color: COLORS.success },
  { value: 'fail', label: 'Fail', color: COLORS.danger },
  { value: 'remedial', label: 'Remedial', color: COLORS.warning },
  { value: 'n_a', label: 'N/A', color: COLORS.muted },
]

export function CertForm({ assets = [], onSubmit }: CertFormProps) {
  const [template, setTemplate] = useState<CertTemplate>(CERT_FORM_TEMPLATES[0])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [outcome, setOutcome] = useState<Outcome>('pass')
  const [notes, setNotes] = useState('')
  const [assetId, setAssetId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function pickTemplate(t: CertTemplate) {
    Haptics.selectionAsync()
    setTemplate(t)
    setAnswers({})
  }
  function setAnswer(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const result = await onSubmit({ certType: template.key, answers, outcome, notes: notes.trim() || null, assetId })
    setSaving(false)
    if (result.error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('Could not save certificate', result.error.message)
      return
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setAnswers({})
    setNotes('')
    setOutcome('pass')
    setAssetId(null)
    Alert.alert(
      result.queued ? 'Saved offline' : 'Certificate saved',
      result.queued ? "We'll sync it when you're back on signal." : 'The completed certificate has been recorded.',
    )
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ClipboardCheck size={16} color={COLORS.brand} />
        <Text style={styles.headerText}>Compliance Certificate</Text>
      </View>

      {/* Cert type picker */}
      <View style={styles.typeRow}>
        {CERT_FORM_TEMPLATES.map((t) => {
          const active = t.key === template.key
          return (
            <Pressable
              key={t.key}
              onPress={() => pickTemplate(t)}
              style={[styles.typeChip, { backgroundColor: active ? COLORS.brand : '#f1f5f9' }]}
            >
              <Text style={[styles.typeChipText, { color: active ? '#fff' : COLORS.text }]} numberOfLines={1}>
                {t.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {/* Asset (optional) — tie the cert to a specific asset at the property */}
      {assets.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.fieldLabel}>Asset (optional)</Text>
          <View style={styles.typeRow}>
            {assets.map((a) => {
              const active = a.id === assetId
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setAssetId(active ? null : a.id)}
                  style={[styles.typeChip, { backgroundColor: active ? COLORS.navy : '#f1f5f9' }]}
                >
                  <Text style={[styles.typeChipText, { color: active ? '#fff' : COLORS.text }]} numberOfLines={1}>
                    {a.name}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      )}

      {/* Fields */}
      {template.fields.map((f) =>
        f.type === 'pass_fail' ? (
          <View key={f.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{f.label}</Text>
            <View style={styles.pfRow}>
              {PF_OPTIONS.map((opt) => {
                const selected = answers[f.key] === opt
                const tint = opt === 'Pass' ? COLORS.success : opt === 'Fail' ? COLORS.danger : COLORS.muted
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setAnswer(f.key, opt)}
                    style={[styles.pfBtn, { borderColor: selected ? tint : COLORS.border, backgroundColor: selected ? `${tint}1A` : '#fff' }]}
                  >
                    <Text style={[styles.pfText, { color: selected ? tint : COLORS.muted }]}>{opt}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ) : (
          <View key={f.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{f.label}</Text>
            <TextInput
              value={answers[f.key] ?? ''}
              onChangeText={(v) => setAnswer(f.key, v)}
              placeholder="Optional…"
              placeholderTextColor={COLORS.muted}
              multiline
              style={[styles.input, { minHeight: 48, textAlignVertical: 'top' }]}
            />
          </View>
        ),
      )}

      {/* Outcome */}
      <Text style={[styles.fieldLabel, { marginTop: 4 }]}>Overall outcome</Text>
      <View style={styles.pfRow}>
        {OUTCOMES.map((o) => {
          const selected = outcome === o.value
          return (
            <Pressable
              key={o.value}
              onPress={() => setOutcome(o.value)}
              style={[styles.pfBtn, { borderColor: selected ? o.color : COLORS.border, backgroundColor: selected ? `${o.color}1A` : '#fff' }]}
            >
              <Text style={[styles.pfText, { color: selected ? o.color : COLORS.muted }]}>{o.label}</Text>
            </Pressable>
          )
        })}
      </View>

      {/* Notes */}
      <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Notes</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Any remedial actions or context…"
        placeholderTextColor={COLORS.muted}
        multiline
        style={[styles.input, { minHeight: 56, textAlignVertical: 'top' }]}
      />

      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={[styles.submitBtn, { opacity: saving ? 0.6 : 1 }]}
      >
        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.submitText}>Save certificate</Text>}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  headerText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  typeChipText: { fontSize: 12, fontWeight: '600' },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 },
  pfRow: { flexDirection: 'row', gap: 8 },
  pfBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 8, borderWidth: 1 },
  pfText: { fontSize: 13, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' },
  submitBtn: { minHeight: 50, marginTop: 16, backgroundColor: COLORS.brand, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})

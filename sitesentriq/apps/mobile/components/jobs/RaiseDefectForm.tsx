import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  ActionSheetIOS,
  Modal,
  ScrollView,
  Pressable,
  Image,
  type NativeSyntheticEvent,
} from 'react-native'
import { type NativeSegmentedControlIOSChangeEvent } from '@react-native-segmented-control/segmented-control'
import { Button } from 'heroui-native'
import { Segmented as SegmentedControl } from '@/components/ui/Segmented'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { AlertTriangle, Calendar, Camera, ChevronDown, X } from 'lucide-react-native'
import { COLORS } from '@/constants/config'
import { useAssetsForProperty } from '@/hooks/useAssetsForProperty'

// Native segmented control needs parallel arrays. Index <-> value mapping is
// derived from these so the payload value (low|medium|high) is unchanged.
const PRIORITY_VALUES: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high']
const PRIORITY_LABELS = ['Low', 'Medium', 'High']

type Priority = 'low' | 'medium' | 'high'

export interface RaiseDefectSubmit {
  title: string
  description: string | null
  priority: Priority
  dueDate: string | null
  assetId: string | null
  evidenceUri: string | null
}

interface RaiseDefectFormProps {
  // The job's property — used to fetch the optional asset picker. Defects
  // link to the property + job; asset_id is optional (nullable in the schema,
  // and the web never sends it).
  propertyId: string | null | undefined
  // Returns { error } | { error, queued } like the other job-detail writes.
  onSubmit: (payload: RaiseDefectSubmit) => Promise<{ error: { message: string } | null; queued?: boolean }>
}

// Format a Date to the YYYY-MM-DD string the payload contract expects (local
// calendar date, no timezone shift).
function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Parse a YYYY-MM-DD string back into a local Date for the picker's value.
function fromDateString(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

// Human-friendly display for the tappable due-date row.
function formatDisplay(s: string): string {
  return fromDateString(s).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function RaiseDefectForm({ propertyId, onSubmit }: RaiseDefectFormProps) {
  const { assets, loading: assetsLoading } = useAssetsForProperty(propertyId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  // Stored as a YYYY-MM-DD string or null — the payload contract.
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [assetId, setAssetId] = useState<string | null>(null)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [evidenceUri, setEvidenceUri] = useState<string | null>(null)

  const selectedAsset = assetId ? assets.find(a => a.id === assetId) ?? null : null

  function handlePriorityChange(index: number) {
    const next = PRIORITY_VALUES[index]
    if (next) {
      setPriority(next)
      Haptics.selectionAsync()
    }
  }

  function onDateChange(event: DateTimePickerEvent, date?: Date) {
    // On Android the picker is a one-shot dialog: hide it on any result.
    if (Platform.OS !== 'ios') setShowDatePicker(false)
    if (event.type === 'dismissed') return
    if (date) setDueDate(toDateString(date))
  }

  function openAssetPicker() {
    if (assets.length === 0) return
    const names = assets.map(a => a.name)
    if (Platform.OS === 'ios') {
      // Options: each asset, then None, then Cancel (last = cancel index).
      const options = [...names, 'None', 'Cancel']
      const noneIndex = names.length
      const cancelIndex = names.length + 1
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Link an asset',
          options,
          cancelButtonIndex: cancelIndex,
        },
        index => {
          if (index === cancelIndex) return
          if (index === noneIndex) {
            setAssetId(null)
          } else {
            setAssetId(assets[index]?.id ?? null)
          }
          Haptics.selectionAsync()
        },
      )
    } else {
      // Android: Alert.alert caps at 3 buttons, so with 2+ assets most were
      // unselectable. Use a scrollable in-app modal list instead.
      setAssetPickerOpen(true)
    }
  }

  async function captureEvidence() {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required for defect evidence.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.8 })
    if (!result.canceled && result.assets?.[0]) setEvidenceUri(result.assets[0].uri)
  }

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Title required', 'Give the defect a short title.')
      return
    }
    setSaving(true)
    const result = await onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      dueDate,
      assetId,
      evidenceUri,
    })
    setSaving(false)
    if (result.error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('Could not raise defect', result.error.message)
      return
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setTitle('')
    setDescription('')
    setPriority('medium')
    setDueDate(null)
    setAssetId(null)
    setEvidenceUri(null)
    Alert.alert(
      result.queued ? 'Defect saved offline' : 'Defect raised',
      result.queued
        ? "We'll sync it when you're back on signal."
        : 'The action has been logged for the FM team.',
    )
  }

  return (
    <View className="bg-surface border-border" style={styles.card}>
      <Text className="text-muted" style={styles.fieldLabel}>Title</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Cracked fire exit sign"
        placeholderTextColor={COLORS.muted}
        className="text-foreground border-border"
        style={styles.input}
      />

      <Text className="text-muted" style={[styles.fieldLabel, { marginTop: 12 }]}>Description</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="What's wrong, and where on site?"
        placeholderTextColor={COLORS.muted}
        multiline
        numberOfLines={3}
        className="text-foreground border-border"
        style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
      />

      <Text className="text-muted" style={[styles.fieldLabel, { marginTop: 16 }]}>Evidence photo</Text>
      {evidenceUri ? (
        <View style={styles.evidenceWrap}>
          <Image source={{ uri: evidenceUri }} style={styles.evidenceImage} />
          <TouchableOpacity style={styles.evidenceRemove} onPress={() => setEvidenceUri(null)}>
            <X size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity className="bg-surface border-border" style={styles.evidenceButton} onPress={captureEvidence}>
          <Camera size={18} color={COLORS.brand} />
          <Text style={styles.evidenceButtonText}>Take evidence photo</Text>
        </TouchableOpacity>
      )}

      <Text className="text-muted" style={[styles.fieldLabel, { marginTop: 12 }]}>Priority</Text>
      <SegmentedControl
        values={PRIORITY_LABELS}
        selectedIndex={PRIORITY_VALUES.indexOf(priority)}
        onChange={(e: NativeSyntheticEvent<NativeSegmentedControlIOSChangeEvent>) =>
          handlePriorityChange(e.nativeEvent.selectedSegmentIndex)
        }
        tintColor={COLORS.brand}
        backgroundColor="#f1f5f9"
        fontStyle={{ color: COLORS.text }}
        activeFontStyle={{ color: '#fff' }}
        style={styles.segmented}
      />

      <Text className="text-muted" style={[styles.fieldLabel, { marginTop: 16 }]}>Due date (optional)</Text>
      <View style={styles.dateRow}>
        <TouchableOpacity
          className="bg-surface border-border"
          style={styles.triggerRow}
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.7}
        >
          <Calendar size={16} color={COLORS.muted} />
          <Text className="text-foreground" style={[styles.triggerText, !dueDate && styles.triggerPlaceholder]}>
            {dueDate ? formatDisplay(dueDate) : 'None'}
          </Text>
        </TouchableOpacity>
        {dueDate ? (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => {
              setDueDate(null)
              setShowDatePicker(false)
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={16} color={COLORS.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {showDatePicker ? (
        <View className="bg-surface border-border" style={styles.pickerWrap}>
          <DateTimePicker
            value={dueDate ? fromDateString(dueDate) : new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onDateChange}
          />
          {Platform.OS === 'ios' ? (
            <TouchableOpacity style={styles.doneBtn} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* Asset picker — optional. Defects link to the property + job; pinning
          an asset is a nicety. asset_id stays null when "None" is chosen (the
          web's own behaviour), so an empty list is never blocking. */}
      <Text className="text-muted" style={[styles.fieldLabel, { marginTop: 16 }]}>Asset (optional)</Text>
      {assetsLoading ? (
        <View style={styles.assetLoading}>
          <ActivityIndicator color={COLORS.brand} size="small" />
        </View>
      ) : assets.length === 0 ? (
        <Text className="text-muted" style={styles.noAssets}>
          No assets recorded for this property — the defect will be logged against the property and job.
        </Text>
      ) : (
        <TouchableOpacity className="bg-surface border-border" style={styles.triggerRow} onPress={openAssetPicker} activeOpacity={0.7}>
          <Text className="text-foreground" style={[styles.triggerText, !selectedAsset && styles.triggerPlaceholder]}>
            {selectedAsset ? selectedAsset.name : 'None'}
          </Text>
          <ChevronDown size={16} color={COLORS.muted} />
        </TouchableOpacity>
      )}

      <Button
        variant="primary"
        style={[styles.submitBtn, { opacity: title.trim() && !saving ? 1 : 0.5 }]}
        isDisabled={!title.trim() || saving}
        onPress={handleSave}
      >
        <Button.Label>
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <View style={styles.submitBtnInner}>
              <AlertTriangle size={16} color="#fff" />
              <Text style={styles.submitBtnText}>Raise defect</Text>
            </View>
          )}
        </Button.Label>
      </Button>

      {/* Android asset picker — scrollable modal (Alert.alert caps at 3 buttons). */}
      <Modal
        visible={assetPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAssetPickerOpen(false)}
      >
        <Pressable style={styles.pickerBackdrop} onPress={() => setAssetPickerOpen(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>Link an asset</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => {
                  setAssetId(null)
                  setAssetPickerOpen(false)
                  Haptics.selectionAsync()
                }}
              >
                <Text style={styles.pickerRowText}>None</Text>
              </TouchableOpacity>
              {assets.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={styles.pickerRow}
                  onPress={() => {
                    setAssetId(a.id)
                    setAssetPickerOpen(false)
                    Haptics.selectionAsync()
                  }}
                >
                  <Text style={styles.pickerRowText} numberOfLines={1}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  segmented: {
    height: 36,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  triggerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  triggerText: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  triggerPlaceholder: {
    color: COLORS.muted,
    fontWeight: '400',
  },
  clearBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  doneBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  doneBtnText: {
    color: COLORS.brand,
    fontWeight: '600',
    fontSize: 15,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  assetLoading: {
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  noAssets: {
    fontSize: 12,
    lineHeight: 18,
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
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  evidenceWrap: { position: 'relative', alignSelf: 'flex-start' },
  evidenceImage: { width: 144, height: 108, borderRadius: 10, backgroundColor: '#e2e8f0' },
  evidenceRemove: { position: 'absolute', right: 6, top: 6, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,18,37,0.75)' },
  evidenceButton: { minHeight: 48, borderWidth: 1, borderRadius: 10, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  evidenceButtonText: { color: COLORS.brand, fontSize: 14, fontWeight: '600' },
  pickerSheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  pickerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pickerRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eef1f6',
  },
  pickerRowText: {
    fontSize: 15,
    color: COLORS.text,
  },
})

import { useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import SignatureCanvas from 'react-native-signature-canvas'
import { COLORS } from '@/constants/config'

interface SignaturePadProps {
  onSave: (signature: string) => void
  onCancel: () => void
  label?: string
}

export function SignaturePad({ onSave, onCancel, label = 'Sign here' }: SignaturePadProps) {
  const ref = useRef<any>(null)

  const handleSave = () => {
    ref.current?.readSignature()
  }

  const handleClear = () => {
    ref.current?.clearSignature()
  }

  const style = `
    .m-signature-pad { box-shadow: none; border: none; }
    .m-signature-pad--body { border: none; }
    .m-signature-pad--footer { display: none; }
    body, html { background-color: #f8f9fa; }
  `

  return (
    <View style={styles.container} className="bg-surface">
      <Text style={styles.label} className="text-foreground border-border">{label}</Text>
      <View style={styles.padWrapper} className="border-border">
        <SignatureCanvas
          ref={ref}
          onOK={onSave}
          onEmpty={() => {}}
          descriptionText=""
          clearText="Clear"
          confirmText="Save"
          webStyle={style}
          autoClear={false}
          backgroundColor="rgba(248,250,252,1)"
          penColor="#0f1225"
          style={styles.pad}
        />
      </View>
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.clearBtn} className="border-border" onPress={handleClear}>
          <Text style={styles.clearText} className="text-muted">Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} className="border-border" onPress={onCancel}>
          <Text style={styles.cancelText} className="text-muted">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveText}>Save Signature</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    padding: 16,
    borderBottomWidth: 1,
  },
  padWrapper: {
    flex: 1,
    borderBottomWidth: 1,
    backgroundColor: '#f8fafc',
  },
  pad: {
    flex: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    alignItems: 'center',
  },
  clearBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearText: {
    fontSize: 13,
    fontWeight: '500',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 13,
    fontWeight: '500',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
  },
  saveText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
})

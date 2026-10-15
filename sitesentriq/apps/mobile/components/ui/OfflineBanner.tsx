import { useState } from 'react'
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, TouchableOpacity } from 'react-native'
import { WifiOff, RefreshCw, TriangleAlert, X } from 'lucide-react-native'
import { useOffline } from '@/hooks/useOffline'
import type { OfflineAction } from '@/lib/offline-queue'

function actionLabel(action: OfflineAction): string {
  if (action.kind === 'sequence') return `Job workflow (${action.actions.length} ordered steps)`
  if (action.kind === 'storage_upload') return `Upload ${action.payload.path.split('/').pop() ?? 'file'}`
  if (action.kind === 'function_invoke') return `Notify via ${action.fn}`
  if (action.kind === 'rpc') return action.fn.replace(/_/g, ' ')
  return `${action.kind === 'insert' ? 'Add to' : 'Update'} ${action.table.replace(/_/g, ' ')}`
}

/**
 * Field trust signal. Three states:
 *  - offline: reassure the engineer their work is saved and will sync (any
 *    offline write goes to the queue) — not just "features unavailable".
 *  - online with queued work: an active "Syncing N changes…" bar so they can
 *    see their offline writes flushing (useOffline drains on reconnect/foreground
 *    and refreshes `pending` after each drain).
 *  - online, nothing queued: render nothing.
 */
export function OfflineBanner() {
  const { isOffline, pending, failed, pendingActions, failedActions, retryFailed, syncNow } = useOffline()
  const [open, setOpen] = useState(false)

  if (!isOffline && pending === 0 && failed === 0) return null

  const label = failed > 0
    ? `${failed} change${failed === 1 ? '' : 's'} need attention — tap to review`
    : isOffline
      ? pending > 0
        ? "You're offline — changes are saved and will sync automatically"
        : "You're offline — changes will be saved and synced when you reconnect"
      : `Syncing ${pending} change${pending === 1 ? '' : 's'}…`

  return (
    <>
      <Pressable
        style={[styles.banner, !isOffline && failed === 0 ? styles.syncing : null, failed > 0 ? styles.failed : null]}
        onPress={() => setOpen(true)}
      >
        {failed > 0 ? <TriangleAlert size={14} color="#fff" /> : isOffline ? <WifiOff size={14} color="#fff" /> : <RefreshCw size={14} color="#fff" />}
        <Text style={styles.text}>{label}</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Field sync</Text>
              <Text style={styles.sheetSubtitle}>{pending} pending · {failed} failed</Text>
            </View>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}><X size={22} color="#64748b" /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {[...failedActions.map(action => ({ action, failed: true })), ...pendingActions.map(action => ({ action, failed: false }))].map(({ action, failed: didFail }) => (
              <View key={action.id} style={styles.row}>
                <TriangleAlert size={17} color={didFail ? '#ef4444' : '#f59e0b'} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{actionLabel(action)}</Text>
                  <Text style={styles.rowMeta}>
                    {didFail ? action.lastError ?? 'Could not sync after 8 attempts' : `Waiting to sync · attempt ${action.attempts + 1}`}
                  </Text>
                </View>
              </View>
            ))}
            {pending === 0 && failed === 0 ? <Text style={styles.empty}>Everything is synced.</Text> : null}
          </ScrollView>
          <View style={styles.footer}>
            {failed > 0 ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => { void retryFailed() }}>
                <Text style={styles.primaryText}>Retry failed changes</Text>
              </TouchableOpacity>
            ) : null}
            {pending > 0 && !isOffline ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => { void syncNow() }}>
                <Text style={styles.secondaryText}>Sync now</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#f59e0b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  // Online + draining: navy (app chrome) reads as "system working", distinct
  // from the amber offline warning.
  syncing: {
    backgroundColor: '#0f1225',
  },
  failed: { backgroundColor: '#dc2626' },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  sheet: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  sheetTitle: { color: '#0f172a', fontSize: 20, fontWeight: '700' },
  sheetSubtitle: { color: '#64748b', fontSize: 13, marginTop: 3 },
  list: { padding: 16, gap: 10 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', padding: 14 },
  rowTitle: { color: '#0f172a', fontSize: 14, fontWeight: '600' },
  rowMeta: { color: '#64748b', fontSize: 12, marginTop: 3 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 40 },
  footer: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff' },
  primaryBtn: { alignItems: 'center', borderRadius: 12, backgroundColor: '#e8772e', paddingVertical: 13 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 13 },
  secondaryText: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
})

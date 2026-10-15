import { useState } from 'react'
import { View, Text, Pressable, ActivityIndicator, Linking, Alert } from 'react-native'
import { FileText, Download } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { supabase } from '@/lib/supabase'
import { useJobDocuments, type JobDocument } from '@/hooks/useJobDocuments'
import { SectionLabel } from '@/components/ui/primitives'
import { CacheStatus } from '@/components/ui/CacheStatus'
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus'

const DOC_BUCKET = 'documents'
const SIGNED_URL_TTL = 60 * 60 // 1 hour

function formatUploaded(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function DocumentRow({ doc, isLast }: { doc: JobDocument; isLast: boolean }) {
  const [opening, setOpening] = useState(false)

  const subline = [
    doc.document_type ? doc.document_type.replace(/_/g, ' ') : null,
    formatUploaded(doc.uploaded_at),
  ]
    .filter(Boolean)
    .join(' · ')

  async function openDocument() {
    if (opening) return
    void Haptics.selectionAsync()
    try {
      setOpening(true)
      // `file_url` may already be a full https URL, or a storage path in the
      // private `documents` bucket that we sign on demand.
      if (/^https?:\/\//i.test(doc.file_url)) {
        await Linking.openURL(doc.file_url)
        return
      }
      const { data } = await supabase.storage
        .from(DOC_BUCKET)
        .createSignedUrl(doc.file_url, SIGNED_URL_TTL)
      if (!data?.signedUrl) {
        Alert.alert("Couldn't open document")
        return
      }
      await Linking.openURL(data.signedUrl)
    } catch {
      Alert.alert("Couldn't open document")
    } finally {
      setOpening(false)
    }
  }

  return (
    <Pressable
      onPress={openDocument}
      className="flex-row items-center px-3.5 py-3"
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: '#e6e9ef',
      })}
    >
      <View
        className="mr-3 h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: 'rgba(232,119,46,0.12)' }}
      >
        <FileText size={20} color="#e8772e" />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
          {doc.name}
        </Text>
        {subline ? (
          <Text className="mt-0.5 text-[13px] capitalize text-muted" numberOfLines={1}>
            {subline}
          </Text>
        ) : null}
      </View>
      {opening ? (
        <ActivityIndicator size="small" color="#94a3b8" />
      ) : (
        <Download size={18} color="#94a3b8" />
      )}
    </Pressable>
  )
}

export function JobDocuments({
  jobId,
  propertyId,
  assetId,
}: {
  jobId?: string
  propertyId?: string
  assetId?: string | null
}) {
  const { documents, loading, error, refetch, lastUpdated, isStale } = useJobDocuments({ jobId, propertyId, assetId })
  useRefetchOnFocus(refetch)

  return (
    <View>
      <SectionLabel>Documents</SectionLabel>
      <CacheStatus lastUpdated={lastUpdated} isStale={isStale} />
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">
        {loading ? (
          <View className="items-center py-6">
            <ActivityIndicator size="small" color="#e8772e" />
          </View>
        ) : error ? (
          <Text className="px-3.5 py-4 text-[14px] text-muted">{error}</Text>
        ) : documents.length === 0 ? (
          <Text className="px-3.5 py-4 text-[14px] text-muted">
            No documents for this job
          </Text>
        ) : (
          documents.map((doc, i) => (
            <DocumentRow key={doc.id} doc={doc} isLast={i === documents.length - 1} />
          ))
        )}
      </View>
    </View>
  )
}

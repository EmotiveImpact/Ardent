import { useState, useCallback, useEffect, type ReactNode } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
  FlatList,
  TextInput,
  ActionSheetIOS,
  Platform,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { Segmented as SegmentedControl } from '@/components/ui/Segmented'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useLocalSearchParams, Stack, type Href } from 'expo-router'
import * as Location from 'expo-location'
import * as ImagePicker from 'expo-image-picker'
import {
  startTracking as startLocationTracking,
  stopTracking as stopLocationTracking,
  setMovementStatus,
  isTracking,
} from '@/lib/location-tracker'
import {
  MapPin,
  Clock,
  Building2,
  Camera,
  PenTool,
  CheckCircle2,
  LogIn,
  LogOut,
  AlertTriangle,
  ClipboardCheck,
  Navigation,
  Radio,
  MessageCircle,
  Package,
  FileText,
  StickyNote,
  ShieldCheck,
  ScanLine,
  X,
} from 'lucide-react-native'
import { useJob } from '@/hooks/useJobs'
import type { ServiceReportRow } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SignaturePad } from '@/components/jobs/SignaturePad'
import { TimeEntryForm } from '@/components/jobs/TimeEntryForm'
import { RaiseDefectForm } from '@/components/jobs/RaiseDefectForm'
import { PartsForm } from '@/components/jobs/PartsForm'
import { CertForm } from '@/components/jobs/CertForm'
import { useAssetsForProperty } from '@/hooks/useAssetsForProperty'
import { JobDocuments } from '@/components/jobs/JobDocuments'
import { ContactActions } from '@/components/jobs/ContactActions'
import { FailedAccessForm } from '@/components/jobs/FailedAccessForm'
import { supabase } from '@/lib/supabase'
import { enqueue } from '@/lib/offline-queue'
import { compressImage } from '@/lib/image-compress'
import { COLORS, JOB_STATUS_COLORS } from '@/constants/config'
import { CacheStatus } from '@/components/ui/CacheStatus'
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus'
import { shouldQueueOfflineWrite } from '@/lib/write-gate'
import { useJobTasks } from '@/hooks/useJobTasks'
import { JobChecklist } from '@/components/jobs/JobChecklist'

// Permit-to-work types (mirror of @haumea/types PERMIT_TYPE_LABELS, kept
// Metro-local like the cert templates). The office issues; the engineer can
// request from the field.
const PERMIT_TYPES: { key: string; label: string }[] = [
  { key: 'hot_works', label: 'Hot works' },
  { key: 'confined_space', label: 'Confined space' },
  { key: 'working_at_height', label: 'Working at height' },
  { key: 'electrical_isolation', label: 'Electrical isolation' },
  { key: 'roof_access', label: 'Roof access' },
  { key: 'excavation', label: 'Excavation' },
  { key: 'general', label: 'General permit' },
]

const PHOTO_BUCKET = 'job-photos'
const PHOTO_CONTENT_TYPE = 'image/jpeg'
const PHOTO_SIGNED_URL_TTL = 60 * 60 // 1 hour

// job-photos is a private bucket (migration 00059), so getPublicUrl links
// 403. file_url rows persist a legacy public URL
// (`.../object/public/job-photos/{path}`); pull the storage path back out.
function storagePathFromFileUrl(fileUrl: string): string | null {
  const parts = fileUrl.split(`/${PHOTO_BUCKET}/`)
  return parts.length > 1 ? parts[1] : null
}

// Sign a single storage path for display. Returns null on failure so the
// caller can skip the photo rather than render a 403.
async function signPhotoPath(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, PHOTO_SIGNED_URL_TTL)
  return data?.signedUrl ?? null
}

// Resolve a stored signature value to a DISPLAYABLE uri: a data URL or http URL
// is used directly; a raw object path (the canonical form saveSignature now
// stores in the private field-signatures bucket) is re-signed.
async function resolveSignatureUri(value: string | null | undefined): Promise<string | null> {
  if (!value) return null
  if (value.startsWith('data:') || /^https?:\/\//i.test(value)) return value
  const { data } = await supabase.storage
    .from('field-signatures')
    .createSignedUrl(value.split('?')[0], PHOTO_SIGNED_URL_TTL)
  return data?.signedUrl ?? null
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)))
  }
  const binary = parts.join('')

  const btoaFn = (globalThis as { btoa?: (value: string) => string }).btoa
  if (typeof btoaFn === 'function') {
    return btoaFn(binary)
  }

  const bufferCtor = (globalThis as {
    Buffer?: {
      from: (value: string, encoding: 'binary') => { toString: (encoding: 'base64') => string }
    }
  }).Buffer
  if (bufferCtor) {
    return bufferCtor.from(binary, 'binary').toString('base64')
  }

  throw new Error('No base64 encoder available')
}

async function fileUriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri)
  const buffer = await response.arrayBuffer()
  return arrayBufferToBase64(buffer)
}

// ─── Hub tile ────────────────────────────────────────────────────────────
// One tappable action in the 3-col grid: a soft-tinted rounded icon square,
// a short label, and an optional small badge (count or a ✓). Kept tiny so the
// render stays tidy; all logic lives in the parent's onPress handlers.
type TileProps = {
  icon: ReactNode
  label: string
  tint: string
  fg: string
  badge?: string | number
  badgeColor?: string
  onPress: () => void
}

function Tile({ icon, label, tint, fg, badge, badgeColor, onPress }: TileProps) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.tileIcon, { backgroundColor: tint }]}>
        {icon}
        {badge != null && (
          <View style={[styles.tileBadge, { backgroundColor: badgeColor ?? fg }]}>
            <Text style={styles.tileBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  )
}

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { job, loading, error, refetch, checkIn, checkOut, updateStatus, setExpectedArrival, saveSignature, addNote, submitServiceReport, logTime, raiseAction, failAccess, addPart, saveCert, lastUpdated, isStale } = useJob(id)
  useRefetchOnFocus(refetch)
  const checklist = useJobTasks(id)
  useRefetchOnFocus(checklist.refetch)
  // Scope the cert/defect asset picker to THIS job's property (matching
  // RaiseDefectForm) instead of pulling the entire org asset table to the
  // device and client-filtering it.
  const { assets: propertyAssets } = useAssetsForProperty(
    (job as { property_id?: string | null } | null)?.property_id ?? null,
  )
  const { profile, user } = useAuth()

  const [checkingIn, setCheckingIn] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  // Live-location sharing (feeds the web Engineer Tracker via engineer_locations).
  const [sharingLocation, setSharingLocation] = useState(false)
  // Failed-access flow (couldn't get into the site).
  const [reportingFail, setReportingFail] = useState(false)
  // Parts/materials logged against the job.
  const [parts, setParts] = useState<{ id: string; description: string; quantity: number; unit_cost: number | null }[]>([])
  const [addingPart, setAddingPart] = useState(false)
  const insets = useSafeAreaInsets()
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [photoType, setPhotoType] = useState<'before' | 'after' | 'issue' | 'general'>('general')
  const [showSignature, setShowSignature] = useState<'customer' | 'engineer' | null>(null)
  // Just-captured data URLs (immediate preview, works offline before upload) +
  // signed URLs resolved from the stored object paths (for a reloaded job).
  const [localSig, setLocalSig] = useState<{ customer?: string; engineer?: string }>({})
  const [sigUris, setSigUris] = useState<{ customer: string | null; engineer: string | null }>({ customer: null, engineer: null })
  // HUB layout — which action sheet/modal is open. null = the hub itself.
  // Quick actions open a pageSheet; heavy ones (parts/photos/cert/docs/report)
  // open fullScreen. See the single <Modal> + sheetMeta map in the render.
  const [sheet, setSheet] = useState<
    null | 'time' | 'parts' | 'photos' | 'defect' | 'cert' | 'docs' | 'note' | 'report' | 'signoff' | 'failaccess' | 'jobstatus' | 'checklist'
  >(null)
  // Sprint 3 / C3 — engineer note input. Multi-line, save → insert
  // into the notes table (offline-queued).
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // Critical fix #3 — Service report form state. Outcome is the same
  // enum the web side uses (apps/web/src/lib/constants.ts JOB_OUTCOMES)
  // so the customer-facing email chip renders consistently regardless
  // of where the report was filed.
  const [reportOutcome, setReportOutcome] = useState<'pass' | 'fail' | 'incomplete' | 'revisit' | 'n_a'>('pass')
  const [reportNotes, setReportNotes] = useState('')
  const [savingReport, setSavingReport] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [latestReport, setLatestReport] = useState<ServiceReportRow | null>(null)

  // Critical fix #3 — load the latest service_report for this job so the
  // engineer sees what they (or someone else) already submitted instead
  // of an empty form. Single() with order desc + limit 1 — same pattern
  // the web edge function uses to pick the report for the email.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('service_reports')
        .select('id, job_id, organisation_id, engineer_id, outcome, notes, signature_url, submitted_at')
        .eq('job_id', id)
        .order('submitted_at', { ascending: false })
        .limit(1)
      if (!cancelled && data && data.length > 0) {
        setLatestReport(data[0] as ServiceReportRow)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // Load existing job_photos on mount so the gallery survives a reload and
  // matches what the web side sees. Web's job-detail page reads from the same
  // `job_photos` table.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('job_photos')
        .select('file_url')
        .eq('job_id', id)
        .order('uploaded_at', { ascending: true })
      if (!data) return
      // Batch-sign every stored path in one round-trip; the bucket is private.
      const paths = data
        .map((p: { file_url: string }) => storagePathFromFileUrl(p.file_url))
        .filter((path): path is string => !!path)
      if (paths.length === 0) return
      const { data: signedRes } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls(paths, PHOTO_SIGNED_URL_TTL)
      const signedUrls = (signedRes ?? [])
        .map((entry) => entry.signedUrl)
        .filter((url): url is string => !!url)
      if (!cancelled) {
        setPhotos(signedUrls)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // Safety net: if the engineer leaves the job screen without checking out,
  // stop the GPS stream so we don't keep broadcasting their location.
  useEffect(() => {
    return () => {
      void stopLocationTracking()
    }
  }, [])

  // Load parts/materials logged against this job (job_parts, migration 00092).
  const loadParts = useCallback(async () => {
    if (!id) return
    const { data } = await supabase
      .from('job_parts')
      .select('id, description, quantity, unit_cost')
      .eq('job_id', id)
      .order('created_at', { ascending: true })
    setParts((data as typeof parts) ?? [])
  }, [id])

  useEffect(() => {
    void loadParts()
  }, [loadParts])

  // W3-T10: read-only permit status for flagged jobs — check-in is DB-gated
  // on an issued permit, so the engineer should see the state up front.
  const [permitStatus, setPermitStatus] = useState<string | null>(null)
  const requiresPermit = !!(job as { requires_permit?: boolean } | null)?.requires_permit
  useEffect(() => {
    if (!id || !requiresPermit) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('permits')
        .select('status')
        .eq('job_id', id)
        .in('status', ['requested', 'issued', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
      if (!cancelled) setPermitStatus((data?.[0] as { status?: string } | undefined)?.status ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [id, requiresPermit])

  // W3-T10 (mobile completion): let the engineer REQUEST a permit from the
  // field. The office still ISSUES it (role-gated server-side) — this just
  // raises the request. Offline-aware via the queue.
  const [requestingPermit, setRequestingPermit] = useState(false)
  const [submittingPermit, setSubmittingPermit] = useState(false)
  async function requestPermit(permitType: string) {
    const orgId = (job as { organisation_id?: string } | null)?.organisation_id
    const propId = (job as { property_id?: string } | null)?.property_id
    if (!orgId || !propId || !id) {
      setRequestingPermit(false)
      return
    }
    setSubmittingPermit(true)
    const row = {
      organisation_id: orgId,
      job_id: id,
      property_id: propId,
      permit_type: permitType,
      requested_by: user?.id ?? null,
    }
    try {
      if (await shouldQueueOfflineWrite()) {
        await enqueue({ kind: 'insert', table: 'permits', payload: row })
      } else {
        const { error } = await supabase.from('permits').insert(row)
        if (error) {
          // Don't lose the request on a flaky connection — queue it.
          await enqueue({ kind: 'insert', table: 'permits', payload: row })
        }
      }
      setPermitStatus('requested')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } finally {
      setSubmittingPermit(false)
      setRequestingPermit(false)
    }
  }

  // Re-sign the stored signature object paths for in-app preview.
  const custSig = job?.signature_url ?? null
  const engSig = (job as { engineer_signature_url?: string | null } | null)?.engineer_signature_url ?? null
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [customer, engineer] = await Promise.all([
        resolveSignatureUri(custSig),
        resolveSignatureUri(engSig),
      ])
      if (!cancelled) setSigUris({ customer, engineer })
    })()
    return () => {
      cancelled = true
    }
  }, [custSig, engSig])

  async function handleAddPart(payload: { description: string; quantity: number; unitCost: number | null }) {
    setAddingPart(true)
    try {
      const res = await addPart({ description: payload.description, quantity: payload.quantity, unitCost: payload.unitCost })
      if (res.error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert('Could not add part', res.error.message)
        return res // let PartsForm KEEP the engineer's input on failure
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      if ((res as { queued?: boolean }).queued) {
        // Offline: the row is only in the queue, so loadParts() (a DB read)
        // can't see it. Optimistically add it so the list + badge update.
        setParts((prev) => [
          ...prev,
          { id: `pending-${Date.now()}`, description: payload.description, quantity: payload.quantity, unit_cost: payload.unitCost },
        ])
        Alert.alert('Part saved offline', "We'll sync it when you're back on signal.")
      } else {
        await loadParts()
      }
      return res
    } finally {
      setAddingPart(false)
    }
  }

  const buildPhotoRow = useCallback(
    (publicUrl: string, kind = photoType) => {
      if (!profile?.organisation_id || !user?.id || !id) return null
      return {
        job_id: id,
        organisation_id: profile.organisation_id,
        file_url: publicUrl,
        // job_photos.photo_type CHECK allows before|after|issue|general only;
        // 'on_site' violated it and the metadata insert (incl. offline replay) threw.
        photo_type: kind,
        uploaded_by: user.id,
      }
    },
    [id, photoType, profile?.organisation_id, user?.id],
  )

  // Persist a freshly-uploaded photo URL to the `job_photos` table so it
  // survives reload + appears in the web app's job-detail gallery.
  //
  // Offline path: if NetInfo reports we're offline we skip the live insert
  // and hand the row to the offline queue. The queue is drained on the next
  // reconnect by useOffline. Either way the local photos[] state is already
  // updated by the caller, so the engineer's gallery doesn't disappear.
  //
  // Online path with transient error: we still enqueue, so a momentary
  // network blip between storage upload and DB insert doesn't lose the row.
  const persistPhotoRow = useCallback(
    async (publicUrl: string, kind?: typeof photoType) => {
      const row = buildPhotoRow(publicUrl, kind)
      if (!row) return

      // Offline → queue immediately, don't even attempt the live insert.
      if (await shouldQueueOfflineWrite()) {
        await enqueue({ kind: 'insert', table: 'job_photos', payload: row })
        return
      }

      const { error: insertErr } = await supabase.from('job_photos').insert(row)
      if (insertErr) {
        // Live insert failed despite the device claiming online — fall back
        // to the queue rather than dropping the row.
        await enqueue({ kind: 'insert', table: 'job_photos', payload: row })
      }
    },
    [buildPhotoRow],
  )

  const enqueuePhotoUpload = useCallback(
    async (input: { uri: string; path: string; publicUrl: string; contentType: string; photoType?: typeof photoType }) => {
      const base64Data = await fileUriToBase64(input.uri)
      const row = buildPhotoRow(input.publicUrl, input.photoType)
      const payload = {
        bucket: PHOTO_BUCKET,
        path: input.path,
        base64_data: base64Data,
        content_type: input.contentType,
      }
      if (row) {
        Object.assign(payload, { metadata_insert: { table: 'job_photos', payload: row } })
      }
      await enqueue({
        kind: 'storage_upload',
        payload,
      })
    },
    [buildPhotoRow],
  )

  const uploadPhoto = useCallback(
    async (sourceUri: string, kind = photoType) => {
      if (!id) throw new Error('missing job id')
      const orgId = profile?.organisation_id
      if (!orgId) throw new Error('missing organisation')
      const compressedUri = await compressImage(sourceUri)
      // First path segment MUST be the org id — job-photos bucket RLS (00059)
      // requires foldername[1] = caller's organisation_id, else upload rejected.
      const path = `${orgId}/${id}/${Date.now()}.jpg`
      // Persist the canonical public-URL form in job_photos.file_url so the
      // web app (which extracts the path from this string) stays compatible.
      // getPublicUrl here only builds a string — it makes no network call and
      // is never rendered; display always goes through a signed URL below.
      const { data: urlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      if (await shouldQueueOfflineWrite()) {
        await enqueuePhotoUpload({
          uri: compressedUri,
          path,
          publicUrl,
          contentType: PHOTO_CONTENT_TYPE,
          photoType: kind,
        })
        // Show the local file optimistically — the object isn't uploaded yet,
        // so a signed URL would 404 until the offline queue drains.
        setPhotos(prev => [...prev, compressedUri])
        Alert.alert('Photo saved offline', "We'll upload it when you're back on signal.")
        return
      }

      const response = await fetch(compressedUri)
      const blob = await response.blob()

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: PHOTO_CONTENT_TYPE, upsert: false })

      if (uploadError) {
        if (await shouldQueueOfflineWrite()) {
          await enqueuePhotoUpload({
            uri: compressedUri,
            path,
            publicUrl,
            contentType: PHOTO_CONTENT_TYPE,
            photoType: kind,
          })
          setPhotos(prev => [...prev, compressedUri])
          Alert.alert('Photo saved offline', "We'll upload it when you're back on signal.")
          return
        }
        throw uploadError
      }

      // Bucket is private — render a signed URL, not the public link.
      const signedUrl = await signPhotoPath(path)
      setPhotos(prev => [...prev, signedUrl ?? compressedUri])
      await persistPhotoRow(publicUrl, kind)
    },
    [enqueuePhotoUpload, id, persistPhotoRow, photoType, profile?.organisation_id],
  )

  // ─── Live location sharing ───────────────────────────────────────────
  // Streams GPS into engineer_locations — the table the web Engineer Tracker
  // reads — so the office sees a live dot + movement status. 'travelling' while
  // en route, 'on_site' after check-in. Auto-stops on check-out / unmount.
  async function beginLocationShare(status: 'travelling' | 'on_site', etaAt?: string | null) {
    if (!user?.id || !profile?.organisation_id) return
    // Already streaming for this visit → just flip the broadcast status.
    if (isTracking()) {
      setMovementStatus(status)
      setSharingLocation(true)
      return
    }
    const res = await startLocationTracking({
      profileId: user.id,
      organisationId: profile.organisation_id,
      currentJobId: id,
      movementStatus: status,
      etaAt: etaAt ?? (job as { expected_arrival_at?: string | null } | null)?.expected_arrival_at ?? null,
    })
    setSharingLocation(res.ok)
    if (!res.ok && res.reason === 'permission') {
      Alert.alert(
        'Location off',
        'Allow location access to share your live position with the office.',
      )
    }
  }

  async function startTravelWithEta(minutes: number) {
    const eta = await setExpectedArrival(minutes)
    await beginLocationShare('travelling', eta.expectedArrivalAt)
    if (isTracking()) {
      Alert.alert('On your way', `Customer ETA set for about ${minutes} minutes from now. Your live location is shared with the office.`)
    }
  }

  function handleStartTravel() {
    Alert.alert('Set customer ETA', 'Roughly how long until you arrive?', [
      { text: '15 min', onPress: () => { void startTravelWithEta(15) } },
      { text: '30 min', onPress: () => { void startTravelWithEta(30) } },
      { text: '45 min', onPress: () => { void startTravelWithEta(45) } },
    ])
  }

  async function handleStopSharing() {
    await stopLocationTracking('available')
    setSharingLocation(false)
  }

  // Report that the engineer couldn't get into the site → status failed_access
  // + a note with the reason. Stops location sharing and returns to the list.
  async function handleFailAccess(payload: { reason: string; notes: string }) {
    setReportingFail(true)
    try {
      const res = await failAccess(payload)
      if (res.error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert('Could not report', res.error.message)
        return
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await handleStopSharing()
      setSheet(null)
      Alert.alert(
        'No access reported',
        "The job is marked as no-access and the office can see the reason.",
        [{ text: 'OK', onPress: () => router.back() }],
      )
    } finally {
      setReportingFail(false)
    }
  }

  async function handleStatusChange(
    status: 'pending' | 'pending_external' | 'incomplete' | 'revisit',
    label: string,
  ) {
    setUpdatingStatus(true)
    try {
      const result = await updateStatus(status)
      setSheet(null)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      Alert.alert(
        label,
        result.queued ? "Saved offline — we'll sync it when signal returns." : 'The office can now see this job status.',
      )
    } finally {
      setUpdatingStatus(false)
    }
  }


  async function handleCheckIn() {
    setCheckingIn(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location access is required for check-in.')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      const { error } = await checkIn(loc.coords.latitude, loc.coords.longitude)
      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        // W3-T10: the DB permit gate blocks starting a flagged job — show a
        // human message instead of the raw Postgres error.
        Alert.alert(
          'Check-in failed',
          error.message?.includes('permit_required')
            ? 'This job needs a permit to work before it can start. Ask the office to issue one.'
            : error.message,
        )
      } else {
        // Engineer is now ON SITE — start (or switch to) live on-site tracking
        // so the web Engineer Tracker shows them at the job. Best-effort:
        // sharing is a bonus, never block check-in feedback on it.
        await beginLocationShare('on_site')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Alert.alert('Checked in!', 'Your location has been recorded.')
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('Error', 'Could not get your location. Please try again.')
    } finally {
      setCheckingIn(false)
    }
  }

  async function handleCheckOut() {
    Alert.alert(
      'Check Out',
      'This will mark the job as completed. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Check Out',
          onPress: async () => {
            setCheckingOut(true)
            try {
              const { status } = await Location.requestForegroundPermissionsAsync()
              if (status !== 'granted') {
                Alert.alert('Permission needed', 'Location access is required for check-out.')
                return
              }
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
              const { error } = await checkOut(loc.coords.latitude, loc.coords.longitude)
              if (error) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
                Alert.alert('Check-out failed', error.message)
              } else {
                // Left site — final 'available' fix, then stop the GPS stream.
                await handleStopSharing()
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                Alert.alert('Checked out!', 'Job marked as completed.')
              }
            } catch {
              Alert.alert('Error', 'Could not get your location. Please try again.')
            } finally {
              setCheckingOut(false)
            }
          },
        },
      ]
    )
  }

  async function handleAddPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    })

    if (result.canceled || !result.assets?.[0]) return

    setUploadingPhoto(true)
    try {
      const asset = result.assets[0]
      await uploadPhoto(asset.uri)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } catch {
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required.')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    })

    if (result.canceled || !result.assets?.[0]) return

    setUploadingPhoto(true)
    try {
      const asset = result.assets[0]
      await uploadPhoto(asset.uri)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } catch {
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.')
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Canonical iOS pattern: a single "Add Photo" affordance → action sheet
  // (Take Photo / Choose from Library / Cancel). Android falls back to an Alert.
  function handlePhotoPress() {
    if (uploadingPhoto) return
    Haptics.selectionAsync()
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Take Photo', 'Choose from Library', 'Cancel'],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) handleTakePhoto()
          else if (index === 1) handleAddPhoto()
        },
      )
    } else {
      Alert.alert('Add Photo', undefined, [
        { text: 'Take Photo', onPress: handleTakePhoto },
        { text: 'Choose from Library', onPress: handleAddPhoto },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }

  // Critical fix #3 — Submit the service report. Optionally chain a
  // check-out so the engineer can finish in one tap. We rely on the
  // existing checkOut() to set status=completed AND fire the customer
  // email — the email reads `service_reports` so insert MUST land first
  // (or be queued before checkOut is called) for the outcome chip to
  // populate correctly.
  async function handleSubmitReport(opts: { thenCheckOut: boolean }) {
    setSavingReport(true)
    try {
      const result = await submitServiceReport({ outcome: reportOutcome, notes: reportNotes })
      if (result.error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert('Could not save report', result.error.message)
        return
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      // Optimistically reflect the new report in the read-only summary.
      setLatestReport(result.row as ServiceReportRow)
      setReportNotes('')
      const wasQueued = (result as { queued?: boolean }).queued

      if (opts.thenCheckOut) {
        // Chain into the existing check-out flow so we get GPS + the
        // completion-email trigger for free.
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Location access is required for check-out.')
          return
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        const { error: outErr } = await checkOut(loc.coords.latitude, loc.coords.longitude)
        if (outErr) {
          Alert.alert('Report saved, check-out failed', outErr.message)
        } else {
          // Left site — stop live-location sharing.
          await handleStopSharing()
          Alert.alert(
            wasQueued ? 'Saved offline' : 'Report submitted',
            wasQueued
              ? "Report + check-out queued. We'll sync when you're back on signal."
              : 'Report saved and job marked complete.',
          )
        }
      } else if (wasQueued) {
        Alert.alert('Report saved offline', "We'll sync it when you're back on signal.")
      } else {
        Alert.alert('Report submitted', 'The customer will see the outcome on their job email.')
      }
    } catch {
      // Location.getCurrentPositionAsync (the check-out branch) rejects on GPS
      // timeout / services off / revoked permission — routine for field
      // engineers. Without this catch the rejection was silent: the report
      // saved, the form flipped to read-only, but the job stayed in_progress and
      // the engineer got NO feedback (believing it was complete). The report is
      // already persisted, and the standalone "Check Out" button stays visible
      // (canCheckOut) so they can retry. Mirrors handleCheckOut's own catch.
      Alert.alert(
        'Report saved — check-out failed',
        'Could not get your location. Tap "Check Out" to finish marking the job complete.',
      )
    } finally {
      setSavingReport(false)
    }
  }

  function handleSaveSignature(dataUrl: string) {
    if (!showSignature) return
    // Keep the just-captured data URL for immediate preview — the stored value
    // becomes an object path that needs (re-)signing, which isn't available yet
    // when offline.
    setLocalSig(prev => ({ ...prev, [showSignature]: dataUrl }))
    saveSignature(dataUrl, showSignature)
      .then(({ error }) => {
        if (error) Alert.alert('Error', 'Could not save signature.')
        else setShowSignature(null)
      })
      // saveSignature can reject on the offline path (AsyncStorage enqueue) —
      // surface it instead of leaving an unhandled rejection + silent failure.
      .catch(() => Alert.alert('Error', 'Could not save signature. Please try again.'))
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.brand} size="large" />
          <Text style={styles.loadingText}>Loading job...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (error || !job) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorContainer}>
          <AlertTriangle size={40} color="#ef4444" />
          <Text style={styles.errorTitle}>Job not found</Text>
          <Text style={styles.errorText}>{error ?? 'This job could not be loaded.'}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  // Gate on the REAL columns: arrived_at (check-in) + completed_date (check-out).
  // 'revisit' and 'failed_access' are active statuses that need ANOTHER on-site
  // attempt; they carry a STALE arrived_at from the prior visit (never cleared on
  // reschedule), so allow re-check-in there — otherwise those jobs were a dead
  // end on mobile (no Check In / Check Out / No-access CTA rendered at all).
  const checkInStatuses = [
    'scheduled', 'due', 'pending', 'ready', 'pending_external',
    'contractor_review', 'incomplete', 'revisit', 'failed_access',
  ]
  const canCheckIn = !job.completed_date && (
    checkInStatuses.includes(job.status ?? '') ||
    (job.status === 'in_progress' && !job.arrived_at)
  )
  const canCheckOut = !job.completed_date && (
    (job.status === 'in_progress' && !!job.arrived_at) || job.status === 'performed'
  )
  const isCompleted = job.status === 'completed'
  const shouldMessageOffice = job.status === 'not_ready' || job.status === 'rejected'

  // Critical fix #3 — surface the report form once the engineer is on
  // site (status=in_progress OR they've checked in). Hide it once the
  // job is completed and a report already exists — at that point the
  // read-only summary tells the full story.
  const canSubmitReport = (job.status === 'in_progress' || !!job.arrived_at) && !latestReport
  const outcomeOptions: Array<{ value: typeof reportOutcome; label: string }> = [
    { value: 'pass', label: 'Pass' },
    { value: 'fail', label: 'Fail' },
    { value: 'incomplete', label: 'Incomplete' },
    { value: 'revisit', label: 'Revisit' },
    { value: 'n_a', label: 'N/A' },
  ]
  const outcomeColor = (o: ServiceReportRow['outcome']) => {
    switch (o) {
      case 'pass': return COLORS.success
      case 'fail': return COLORS.danger
      case 'incomplete': return COLORS.warning
      case 'revisit': return COLORS.warning
      default: return COLORS.muted
    }
  }
  const outcomeLabel = (o: ServiceReportRow['outcome']) =>
    outcomeOptions.find(opt => opt.value === o)?.label ?? '—'

  // Status-colored accent for the hero's left edge.
  const statusColor = JOB_STATUS_COLORS[job.status] ?? COLORS.muted

  // Title shown in the sheet header for each section.
  const sheetTitles: Record<NonNullable<typeof sheet>, string> = {
    time: 'Time',
    parts: 'Parts',
    photos: 'Job Photos',
    defect: 'Raise a defect',
    cert: 'Certificate',
    docs: 'Documents',
    note: 'Add a note',
    report: 'Service report',
    signoff: 'Sign-off',
    failaccess: 'No access',
    jobstatus: 'Update job status',
    checklist: 'Job checklist',
  }
  // Heavy sections get a fullScreen sheet; quick actions get a pageSheet.
  const fullScreenSheets = new Set(['parts', 'photos', 'cert', 'docs', 'report', 'checklist'])
  const sheetPresentation: 'fullScreen' | 'pageSheet' =
    sheet && fullScreenSheets.has(sheet) ? 'fullScreen' : 'pageSheet'

  return (
    <View style={styles.safe}>
      {/* Native header (configured in app/_layout.tsx) — set the job title +
          native back chevron. Status moves into the content as a chip row. */}
      <Stack.Screen
        options={{
          title: job.title,
          headerBackTitle: 'Back',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/job-chat/${id}`)}
              hitSlop={8}
              accessibilityLabel="Message the office"
            >
              <MessageCircle size={22} color="#ffffff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <CacheStatus lastUpdated={lastUpdated} isStale={isStale} />
        {/* ─── HERO ─────────────────────────────────────────────────────
            One premium card: status-colored accent bar + job meta + the
            contact/navigate affordances + a compact arrived/completed row. */}
        <View style={styles.hero}>
          <View style={[styles.heroAccent, { backgroundColor: statusColor }]} />
          <View style={styles.heroBody}>
            <View style={styles.heroTopRow}>
              <StatusBadge status={job.status} />
              {job.job_number ? <Text style={styles.heroJobNumber}>{job.job_number}</Text> : null}
            </View>

            <Text style={styles.heroTitle} numberOfLines={3}>{job.title}</Text>

            {job.properties && (
              <View style={styles.heroPropertyRow}>
                <MapPin size={16} color={COLORS.muted} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroPropertyName}>{job.properties.name}</Text>
                  {!!job.properties.address && (
                    <Text style={styles.heroPropertyAddr}>{job.properties.address}</Text>
                  )}
                </View>
                <ContactActions
                  phone={(job.clients as { contact_phone?: string | null } | null)?.contact_phone}
                  address={job.properties.address}
                />
              </View>
            )}

            <View style={styles.heroMetaList}>
              {job.clients && (
                <View style={styles.heroMetaRow}>
                  <Building2 size={14} color={COLORS.muted} />
                  <Text style={styles.heroMetaText}>{job.clients.name}</Text>
                </View>
              )}
              {job.scheduled_date && (
                <View style={styles.heroMetaRow}>
                  <Clock size={14} color={COLORS.muted} />
                  <Text style={styles.heroMetaText}>
                    {new Date(job.scheduled_date).toLocaleDateString('en-GB', {
                      weekday: 'long', day: 'numeric', month: 'long',
                    })}
                    {job.time_start ? ` at ${job.time_start.slice(0, 5)}` : job.time_window ? ` · ${job.time_window}` : ''}
                  </Text>
                </View>
              )}
            </View>

            {job.description ? (
              <Text style={styles.heroDesc} numberOfLines={3}>{job.description}</Text>
            ) : null}

            {/* Compact arrived / completed times */}
            <View style={styles.heroTimes}>
              <View style={styles.heroTimeItem}>
                <Text style={styles.heroTimeLabel}>Arrived</Text>
                <Text style={styles.heroTimeValue}>
                  {job.arrived_at
                    ? new Date(job.arrived_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </Text>
              </View>
              <View style={styles.heroTimeDivider} />
              <View style={styles.heroTimeItem}>
                <Text style={styles.heroTimeLabel}>Completed</Text>
                <Text style={styles.heroTimeValue}>
                  {job.completed_date
                    ? new Date(job.completed_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </Text>
              </View>
            </View>

            {/* En route — share live location before arriving so the office
                sees the engineer travelling. Hidden once sharing is active. */}
            {canCheckIn && !sharingLocation && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary, { marginTop: 14 }]}
                onPress={handleStartTravel}
              >
                <Navigation size={16} color={COLORS.brand} />
                <Text style={[styles.actionBtnText, { color: COLORS.brand }]}>On My Way</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {sharingLocation && (
          <View style={styles.sharingBanner}>
            <View style={styles.sharingPulse}>
              <Radio size={15} color={COLORS.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sharingText}>Sharing live location</Text>
              <Text style={styles.sharingSub}>
                {job.arrived_at
                  ? `On site since ${new Date(job.arrived_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · office tracking you`
                  : 'En route · office tracking you'}
              </Text>
            </View>
            <TouchableOpacity onPress={handleStopSharing} hitSlop={8} style={styles.sharingStopBtn}>
              <Text style={styles.sharingStop}>Stop</Text>
            </TouchableOpacity>
          </View>
        )}

        {isCompleted && (
          <View style={[styles.completedBanner, { marginBottom: 16 }]}>
            <CheckCircle2 size={18} color={COLORS.success} />
            <Text style={styles.completedText}>Job Completed</Text>
          </View>
        )}

        {/* W3-T10: permit-to-work banner — check-in is DB-gated on an
            issued permit, so surface the state before the engineer tries. */}
        {requiresPermit && !isCompleted && (
          <View
            style={{
              backgroundColor:
                permitStatus === 'active' || permitStatus === 'issued'
                  ? 'rgba(16,185,129,0.10)'
                  : 'rgba(239,68,68,0.10)',
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 11,
              marginBottom: 16,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldCheck
                size={17}
                color={permitStatus === 'active' || permitStatus === 'issued' ? COLORS.success : COLORS.danger}
              />
              <Text
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: '600',
                  color: permitStatus === 'active' || permitStatus === 'issued' ? COLORS.success : COLORS.danger,
                }}
              >
                {permitStatus === 'active'
                  ? 'Permit to work: active'
                  : permitStatus === 'issued'
                    ? 'Permit to work: issued'
                    : permitStatus === 'requested'
                      ? 'Permit requested — not yet issued. Check-in is blocked until issued.'
                      : 'Permit required — none issued. Check-in is blocked until the office issues one.'}
              </Text>
            </View>
            {!permitStatus && (
              <TouchableOpacity
                onPress={() => setRequestingPermit(true)}
                activeOpacity={0.8}
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 10,
                  backgroundColor: COLORS.danger,
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}>Request a permit</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ─── ACTIONS GRID ─────────────────────────────────────────────
            Every section is now a tappable tile that opens its sheet. */}
        <Text style={styles.seclbl}>Job actions</Text>
        <View style={styles.grid}>
          <Tile
            icon={<Clock size={22} color="#2563eb" />}
            label="Time"
            tint="rgba(37,99,235,0.10)"
            fg="#2563eb"
            onPress={() => setSheet('time')}
          />
          <Tile
            icon={<ClipboardCheck size={22} color={COLORS.success} />}
            label="Checklist"
            tint="rgba(16,185,129,0.10)"
            fg={COLORS.success}
            badge={checklist.tasks.length > 0
              ? `${checklist.tasks.filter(task => task.outcome === 'complete').length}/${checklist.tasks.length}`
              : undefined}
            onPress={() => setSheet('checklist')}
          />
          <Tile
            icon={<Package size={22} color={COLORS.brand} />}
            label="Parts"
            tint="rgba(232,119,46,0.10)"
            fg={COLORS.brand}
            badge={parts.length > 0 ? parts.length : undefined}
            onPress={() => setSheet('parts')}
          />
          <Tile
            icon={<Camera size={22} color="#0891b2" />}
            label="Photos"
            tint="rgba(8,145,178,0.10)"
            fg="#0891b2"
            badge={photos.length > 0 ? photos.length : undefined}
            onPress={() => setSheet('photos')}
          />
          <Tile
            icon={<AlertTriangle size={22} color={COLORS.danger} />}
            label="Defect"
            tint="rgba(239,68,68,0.10)"
            fg={COLORS.danger}
            onPress={() => setSheet('defect')}
          />
          <Tile
            icon={<ShieldCheck size={22} color="#16a34a" />}
            label="Certificate"
            tint="rgba(22,163,74,0.10)"
            fg="#16a34a"
            onPress={() => setSheet('cert')}
          />
          <Tile
            icon={<FileText size={22} color="#6366f1" />}
            label="Documents"
            tint="rgba(99,102,241,0.10)"
            fg="#6366f1"
            onPress={() => setSheet('docs')}
          />
          <Tile
            icon={<StickyNote size={22} color="#d97706" />}
            label="Note"
            tint="rgba(217,119,6,0.10)"
            fg="#d97706"
            onPress={() => setSheet('note')}
          />
          {!isCompleted && (job as unknown as { organisation_id?: string } | null)?.organisation_id && (
            <Tile
              icon={<ScanLine size={22} color="#0d9488" />}
              label="QR check-in"
              tint="rgba(13,148,136,0.10)"
              fg="#0d9488"
              onPress={() => {
                const orgId = (job as unknown as { organisation_id?: string } | null)?.organisation_id
                if (!orgId) return
                router.push(
                  (`/scan?jobId=${encodeURIComponent(id)}&orgId=${encodeURIComponent(orgId)}`) as Href,
                )
              }}
            />
          )}
          {(canSubmitReport || latestReport) && (
            <Tile
              icon={<ClipboardCheck size={22} color="#4f46e5" />}
              label="Report"
              tint="rgba(79,70,229,0.10)"
              fg="#4f46e5"
              badge={latestReport ? '✓' : undefined}
              badgeColor={COLORS.success}
              onPress={() => setSheet('report')}
            />
          )}
          <Tile
            icon={<PenTool size={22} color="#7c3aed" />}
            label="Sign-off"
            tint="rgba(124,58,237,0.10)"
            fg="#7c3aed"
            onPress={() => setSheet('signoff')}
          />
          {!isCompleted && job.status !== 'cancelled' && (
            <Tile
              icon={<Radio size={22} color={COLORS.warning} />}
              label="Job status"
              tint="rgba(245,158,11,0.10)"
              fg={COLORS.warning}
              onPress={() => setSheet('jobstatus')}
            />
          )}
          {canCheckIn && !isCompleted && (
            <Tile
              icon={<AlertTriangle size={22} color={COLORS.danger} />}
              label="No access"
              tint="rgba(239,68,68,0.10)"
              fg={COLORS.danger}
              onPress={() => setSheet('failaccess')}
            />
          )}
        </View>
      </ScrollView>

      {/* Sticky stateful CTA — ONE unmistakable primary action for the current
          state (check in → check out), pinned above the home indicator. */}
      {(canCheckIn || canCheckOut || shouldMessageOffice) && (
        <View style={[styles.ctaBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {shouldMessageOffice ? (
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={() => router.push(`/job-chat/${id}`)}
              activeOpacity={0.85}
            >
              <MessageCircle size={18} color="#fff" />
              <Text style={styles.ctaBtnText}>Message Office</Text>
            </TouchableOpacity>
          ) : canCheckOut ? (
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: COLORS.success }]}
              onPress={handleCheckOut}
              disabled={checkingOut}
              activeOpacity={0.85}
            >
              {checkingOut ? <ActivityIndicator color="#fff" /> : <LogOut size={18} color="#fff" />}
              <Text style={styles.ctaBtnText}>{job.status === 'performed' ? 'Complete Job' : 'Check Out & Complete'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={handleCheckIn}
              disabled={checkingIn}
              activeOpacity={0.85}
            >
              {checkingIn ? <ActivityIndicator color="#fff" /> : <LogIn size={18} color="#fff" />}
              <Text style={styles.ctaBtnText}>Check In</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ─── ACTION SHEET ────────────────────────────────────────────────
          One modal hosts every section. Quick actions (time/defect/note/
          failaccess/signoff) present as a pageSheet; heavy ones (parts/
          photos/cert/docs/report) go fullScreen. The body markup is the
          EXACT same JSX moved out of the old long scroll, handlers intact. */}
      <Modal
        visible={sheet !== null}
        animationType="slide"
        presentationStyle={sheetPresentation}
        onRequestClose={() => setSheet(null)}
      >
        <SafeAreaView style={styles.sheetSafe}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{sheet ? sheetTitles[sheet] : ''}</Text>
            <TouchableOpacity onPress={() => setSheet(null)} hitSlop={10} style={styles.sheetClose}>
              <X size={20} color={COLORS.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Time logging — offline-queued. Mirrors the web JobTimeCard /
                useUpsertManualEntry insert into time_entries. */}
            {sheet === 'time' && (
              <TimeEntryForm
                onSubmit={async (payload) => {
                  const result = await logTime(payload)
                  if (!result.error && !(result as { queued?: boolean }).queued) {
                    await refetch()
                  }
                  return result
                }}
              />
            )}

            {sheet === 'jobstatus' && (
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>What happens next?</Text>
                {([
                  ['pending', 'Put on hold', 'Pause work until the office is ready.'],
                  ['pending_external', 'Awaiting parts', 'Waiting for parts or another external dependency.'],
                  ['incomplete', 'Mark incomplete', 'Work could not be finished on this visit.'],
                  ['revisit', 'Revisit required', 'A return visit needs to be scheduled.'],
                ] as const).map(([status, label, description], index) => (
                  <TouchableOpacity
                    key={status}
                    style={[styles.partRow, { paddingVertical: 14 }, index > 0 ? styles.partRowBorder : null]}
                    disabled={updatingStatus}
                    onPress={() => handleStatusChange(status, label)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: COLORS.text, fontSize: 15, fontWeight: '600' }}>{label}</Text>
                      <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 3 }}>{description}</Text>
                    </View>
                    {updatingStatus ? <ActivityIndicator size="small" color={COLORS.brand} /> : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {sheet === 'checklist' && (
              <JobChecklist
                tasks={checklist.tasks}
                loading={checklist.loading}
                error={checklist.error}
                lastUpdated={checklist.lastUpdated}
                isStale={checklist.isStale}
                onToggle={checklist.toggleTask}
              />
            )}

            {/* Parts / materials used (job_parts, migration 00092). */}
            {sheet === 'parts' && (
              <>
                {parts.length > 0 && (
                  <View style={styles.card}>
                    {parts.map((p, i) => (
                      <View key={p.id} style={[styles.partRow, i > 0 ? styles.partRowBorder : null]}>
                        <Text style={styles.partQty}>{p.quantity}×</Text>
                        <Text style={styles.partDesc} numberOfLines={2}>{p.description}</Text>
                        {p.unit_cost != null && <Text style={styles.partCost}>£{Number(p.unit_cost).toFixed(2)}</Text>}
                      </View>
                    ))}
                  </View>
                )}
                <PartsForm onSubmit={handleAddPart} submitting={addingPart} />
              </>
            )}

            {/* Photos */}
            {sheet === 'photos' && (
              <>
                {uploadingPhoto && (
                  <View style={{ alignItems: 'center', marginBottom: 12 }}>
                    <ActivityIndicator color={COLORS.brand} size="small" />
                  </View>
                )}
                <Text style={styles.fieldLabel}>Photo type</Text>
                <SegmentedControl
                  values={['Before', 'After', 'Issue', 'General']}
                  selectedIndex={['before', 'after', 'issue', 'general'].indexOf(photoType)}
                  onChange={(event) => {
                    const next = ['before', 'after', 'issue', 'general'][event.nativeEvent.selectedSegmentIndex]
                    if (next) setPhotoType(next as typeof photoType)
                  }}
                  tintColor={COLORS.brand}
                  activeFontStyle={{ color: '#fff' }}
                  style={{ marginBottom: 14 }}
                />
                <View style={styles.photoActions}>
                  <TouchableOpacity style={styles.photoBtn} onPress={handlePhotoPress} disabled={uploadingPhoto}>
                    <Camera size={16} color={COLORS.navy} />
                    <Text style={styles.photoBtnText}>Add Photo</Text>
                  </TouchableOpacity>
                </View>

                {photos.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                    {photos.map((url, i) => (
                      <Image key={i} source={{ uri: url }} style={styles.photoThumb} />
                    ))}
                  </ScrollView>
                )}
              </>
            )}

            {/* Raise a defect — offline-queued. Mirrors the web new-action insert
                into the `actions` table (org + property_id + job_id from the job;
                asset_id optional/nullable; created_by + assigned_to = engineer). */}
            {sheet === 'defect' && (
              <RaiseDefectForm
                propertyId={job.property_id}
                onSubmit={async (payload) => {
                  const result = await raiseAction(payload)
                  if (!result.error && payload.evidenceUri) {
                    try {
                      await uploadPhoto(payload.evidenceUri, 'issue')
                    } catch {
                      Alert.alert('Defect raised', 'The defect was saved, but its evidence photo could not be saved. Please add it from Job Photos.')
                    }
                  }
                  if (!result.error && !(result as { queued?: boolean }).queued) {
                    await refetch()
                  }
                  return result
                }}
              />
            )}

            {/* Compliance certificate (V1 #9) — engineer fills the discipline
                checklist on site; saved to cert_completions, offline-queued. */}
            {sheet === 'cert' && (
              <CertForm assets={propertyAssets} onSubmit={(payload) => saveCert(payload)} />
            )}

            {/* Documents — certs / manuals / RAMS for this job, property or asset.
                (Renders its own "Documents" heading.) */}
            {sheet === 'docs' && (
              <JobDocuments jobId={id} propertyId={job.property_id ?? undefined} />
            )}

            {/* Sprint 3 / C3 — Engineer notes (offline-queued).
                Inserts a new row in the notes table per save. The
                dashboard surfaces these on the property + job + asset
                timelines so the FM team sees what the engineer wrote
                without waiting for the service report. */}
            {sheet === 'note' && (
              <View style={styles.card}>
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="What's happening on site? Saves even offline."
                  placeholderTextColor={COLORS.muted}
                  multiline
                  numberOfLines={3}
                  style={{
                    minHeight: 72,
                    fontSize: 14,
                    color: '#111827',
                    textAlignVertical: 'top',
                    padding: 0,
                  }}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { paddingHorizontal: 16, opacity: noteDraft.trim() && !savingNote ? 1 : 0.5 }]}
                    disabled={!noteDraft.trim() || savingNote}
                    onPress={async () => {
                      setSavingNote(true)
                      const result = await addNote(noteDraft)
                      setSavingNote(false)
                      if (result.error) {
                        Alert.alert('Could not save note', result.error.message)
                      } else {
                        setNoteDraft('')
                        Alert.alert(
                          (result as { queued?: boolean }).queued ? 'Note saved offline' : 'Note saved',
                          (result as { queued?: boolean }).queued
                            ? "We'll sync it when you're back on signal."
                            : 'The office can see it on the job timeline.',
                        )
                      }
                    }}
                  >
                    {savingNote ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <CheckCircle2 size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Save note</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Critical fix #3 — Service report.
                The web edge function (job-completion-email) reads the most
                recent service_report for the job to populate the customer
                email's outcome chip + engineer name. Without this card the
                email shipped from a mobile-completed job goes out empty. */}
            {sheet === 'report' && (canSubmitReport || latestReport) && (
              latestReport ? (
                // Read-only summary of the latest report so the engineer
                // (and anyone covering for them) can see what was filed.
                <View style={styles.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={[
                        styles.outcomeChip,
                        { backgroundColor: outcomeColor(latestReport.outcome) },
                      ]}
                    >
                      <Text style={styles.outcomeChipText}>{outcomeLabel(latestReport.outcome)}</Text>
                    </View>
                    {latestReport.submitted_at &&
                      !Number.isNaN(new Date(latestReport.submitted_at).getTime()) && (
                      <Text style={styles.reportSubmittedText}>
                        Submitted {new Date(latestReport.submitted_at).toLocaleString('en-GB', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </Text>
                    )}
                  </View>
                  {latestReport.notes ? (
                    <Text style={styles.reportNotesPreview}>{latestReport.notes}</Text>
                  ) : (
                    <Text style={[styles.reportNotesPreview, { fontStyle: 'italic', color: COLORS.muted }]}>
                      No notes recorded.
                    </Text>
                  )}
                </View>
              ) : (
                <View style={styles.card}>
                  <Text style={styles.fieldLabel}>Outcome</Text>
                  <SegmentedControl
                    values={outcomeOptions.map(o => o.label)}
                    selectedIndex={outcomeOptions.findIndex(o => o.value === reportOutcome)}
                    onChange={(e) => {
                      Haptics.selectionAsync()
                      const opt = outcomeOptions[e.nativeEvent.selectedSegmentIndex]
                      if (opt) setReportOutcome(opt.value)
                    }}
                    tintColor={outcomeColor(reportOutcome)}
                    activeFontStyle={{ color: '#fff' }}
                    style={{ marginTop: 4 }}
                  />

                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Notes</Text>
                  <TextInput
                    value={reportNotes}
                    onChangeText={setReportNotes}
                    placeholder="Summary of work, parts replaced, follow-ups…"
                    placeholderTextColor={COLORS.muted}
                    multiline
                    numberOfLines={3}
                    style={{
                      minHeight: 72,
                      fontSize: 14,
                      color: '#111827',
                      textAlignVertical: 'top',
                      padding: 0,
                    }}
                  />

                  {/* Signature reuse — surface a hint instead of a second
                      capture pad. Engineer signs once via the Sign-off
                      section; the report references that URL. */}
                  <View style={styles.sigHintRow}>
                    <PenTool size={13} color={COLORS.muted} />
                    <Text style={styles.sigHintText}>
                      {((job as { engineer_signature_url?: string | null }).engineer_signature_url ?? job.signature_url)
                        ? 'Signature attached.'
                        : 'Add a signature in Sign-off before submitting.'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { flex: 1, opacity: savingReport ? 0.5 : 1 }]}
                      disabled={savingReport}
                      onPress={() => handleSubmitReport({ thenCheckOut: false })}
                    >
                      {savingReport ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <ClipboardCheck size={16} color="#fff" />
                          <Text style={styles.actionBtnText}>Submit report</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {canCheckOut && (
                      <TouchableOpacity
                        style={[
                          styles.actionBtn,
                          { flex: 1, backgroundColor: COLORS.success, opacity: savingReport ? 0.5 : 1 },
                        ]}
                        disabled={savingReport}
                        onPress={() => handleSubmitReport({ thenCheckOut: true })}
                      >
                        <CheckCircle2 size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Submit & check out</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )
            )}

            {/* Signatures */}
            {sheet === 'signoff' && (
              <View style={styles.sigRow}>
                <View style={styles.sigItem}>
                  <Text style={styles.sigLabel}>Customer Signature</Text>
                  {localSig.customer || sigUris.customer ? (
                    <Image source={{ uri: (localSig.customer || sigUris.customer)! }} style={styles.sigPreview} resizeMode="contain" />
                  ) : (
                    <TouchableOpacity
                      style={styles.sigBtn}
                      onPress={() => setShowSignature('customer')}
                    >
                      <PenTool size={14} color={COLORS.brand} />
                      <Text style={styles.sigBtnText}>Sign Now</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.sigItem}>
                  <Text style={styles.sigLabel}>Engineer Signature</Text>
                  {localSig.engineer || sigUris.engineer ? (
                    <Image
                      source={{ uri: (localSig.engineer || sigUris.engineer)! }}
                      style={styles.sigPreview}
                      resizeMode="contain"
                    />
                  ) : (
                    <TouchableOpacity
                      style={styles.sigBtn}
                      onPress={() => setShowSignature('engineer')}
                    >
                      <PenTool size={14} color={COLORS.brand} />
                      <Text style={styles.sigBtnText}>Sign Now</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* Failed access — couldn't get into the site. */}
            {sheet === 'failaccess' && (
              <FailedAccessForm onSubmit={handleFailAccess} submitting={reportingFail} />
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Signature Modal */}
      <Modal
        visible={showSignature !== null}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={{ flex: 1 }}>
          <SignaturePad
            label={showSignature === 'customer' ? 'Customer Signature' : 'Engineer Signature'}
            onSave={handleSaveSignature}
            onCancel={() => setShowSignature(null)}
          />
        </SafeAreaView>
      </Modal>

      {/* Permit request picker (W3-T10 mobile) */}
      <Modal
        visible={requestingPermit}
        animationType="slide"
        transparent
        onRequestClose={() => setRequestingPermit(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: Math.max(insets.bottom, 16) }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.text }}>Request a permit</Text>
              <Text style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>
                The office issues the permit — this raises the request.
              </Text>
            </View>
            {PERMIT_TYPES.map((pt) => (
              <TouchableOpacity
                key={pt.key}
                disabled={submittingPermit}
                onPress={() => requestPermit(pt.key)}
                activeOpacity={0.7}
                style={{ paddingHorizontal: 20, paddingVertical: 15, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border }}
              >
                <Text style={{ fontSize: 15, color: COLORS.text }}>{pt.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              disabled={submittingPermit}
              onPress={() => setRequestingPermit(false)}
              activeOpacity={0.7}
              style={{ paddingHorizontal: 20, paddingVertical: 15, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.muted }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
  },
  backBtn: {
    marginTop: 8,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  jobTitleInline: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,119,46,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(232,119,46,0.25)',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  infoSub: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 1,
  },
  descText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  partRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  partQty: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.brand,
    minWidth: 30,
  },
  partDesc: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  partCost: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
  },
  checkRow: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    marginBottom: 12,
    overflow: 'hidden',
  },
  checkItem: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
  },
  checkDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
  },
  checkLabel: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  checkValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  checkGps: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 2,
  },
  actionRow: {
    marginBottom: 24,
    gap: 8,
  },
  actionBtn: {
    backgroundColor: COLORS.navy,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  actionBtnSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: COLORS.brand,
  },
  ctaBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.navy,
    borderRadius: 14,
    paddingVertical: 16,
  },
  ctaBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  sharingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(232,119,46,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(232,119,46,0.30)',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  sharingPulse: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,119,46,0.16)',
  },
  sharingText: {
    color: COLORS.brandDark,
    fontWeight: '700',
    fontSize: 13,
  },
  sharingSub: {
    color: COLORS.muted,
    fontWeight: '500',
    fontSize: 11.5,
    marginTop: 1,
  },
  sharingStopBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(100,116,139,0.10)',
  },
  sharingStop: {
    color: COLORS.muted,
    fontWeight: '700',
    fontSize: 12.5,
  },
  failAccessLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 24,
    marginTop: -8,
  },
  failAccessLinkText: {
    color: COLORS.danger,
    fontWeight: '600',
    fontSize: 13.5,
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    paddingVertical: 14,
  },
  completedText: {
    color: COLORS.success,
    fontWeight: '600',
    fontSize: 14,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  photoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  photoScroll: {
    marginBottom: 20,
  },
  photoThumb: {
    width: 88,
    height: 88,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sigRow: {
    gap: 12,
    marginBottom: 20,
  },
  sigItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  sigLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
  },
  sigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.brand,
    borderRadius: 8,
    paddingVertical: 14,
  },
  sigBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.brand,
  },
  sigPreview: {
    width: '100%',
    height: 100,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  // ── Service report (Critical fix #3) ────────────────────────────
  fieldLabel: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  outcomeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  outcomeOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  outcomeOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  outcomeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  outcomeChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  reportSubmittedText: {
    fontSize: 12,
    color: COLORS.muted,
    flex: 1,
  },
  reportNotesPreview: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 19,
  },
  sigHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  sigHintText: {
    fontSize: 12,
    color: COLORS.muted,
  },

  // ── HUB: hero card ──────────────────────────────────────────────
  hero: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  heroAccent: {
    width: 5,
    alignSelf: 'stretch',
  },
  heroBody: {
    flex: 1,
    padding: 18,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  heroJobNumber: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#94a3b8',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 28,
    marginBottom: 14,
  },
  heroPropertyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  heroPropertyName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  heroPropertyAddr: {
    fontSize: 12.5,
    color: COLORS.muted,
    marginTop: 2,
    lineHeight: 17,
  },
  heroMetaList: {
    gap: 7,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroMetaText: {
    fontSize: 13.5,
    color: COLORS.text,
    fontWeight: '500',
    flex: 1,
  },
  heroDesc: {
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 19,
    marginTop: 12,
  },
  heroTimes: {
    flexDirection: 'row',
    marginTop: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eef2f7',
    overflow: 'hidden',
  },
  heroTimeItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  heroTimeDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
  },
  heroTimeLabel: {
    fontSize: 10.5,
    color: COLORS.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  heroTimeValue: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },

  // ── HUB: actions grid ───────────────────────────────────────────
  seclbl: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  tile: {
    width: '33.333%',
    paddingHorizontal: 6,
    marginBottom: 14,
    alignItems: 'center',
  },
  tileIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  tileLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  tileBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  tileBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },

  // ── HUB: action sheet ───────────────────────────────────────────
  sheetSafe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#fff',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    padding: 16,
    paddingBottom: 40,
  },
})

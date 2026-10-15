import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import { toast } from 'sonner'
import {
  Camera,
  CalendarCheck,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation2,
  Play,
  PhoneCall,
  Wifi,
  WifiOff,
  ChevronRight,
  RotateCw,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useEngineers } from '@/hooks/use-engineers'
import { useRecordEngineerLocation } from '@/hooks/use-engineer-locations'
import { useQueryClient } from '@tanstack/react-query'
import { useJobs, useUpdateJob } from '@/hooks/use-jobs'
import { JOB_STATUSES } from '@/lib/constants'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { enqueue, getQueue, removeFromQueue, subscribeQueue } from '@/lib/offline-queue'
import { uploadFile } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { ListSkeleton } from '@/components/shared/skeletons'
import { PageHeader } from '@haumea/ui'

interface JobRow {
  id: string
  title: string
  status: string
  priority?: string
  scheduled_date?: string
  time_start?: string
  time_end?: string
  is_callout?: boolean
  organisation_id: string
  property_id: string
  properties?: { name?: string; address?: string }
}

const SWIPE_THRESHOLD = 120

function todayIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// Local-midnight of *tomorrow*, as an ISO string. useJobs only applies a lower
// bound (.gte scheduled_date >= today) so the query returns today AND every
// future-dated job. Field Mode frames the list strictly as "today's work" and
// lets the engineer complete cards, so we re-filter to the same calendar day
// [today, tomorrow) before presenting — otherwise a future visit could be
// marked complete prematurely (which mints certs + emails the client).
function tomorrowIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

async function dataUrlToFile(dataUrl: string, name: string, type: string): Promise<File> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], name, { type })
}

export default function FieldPage() {
  const { profile, organisation } = useAuth()
  const queryClient = useQueryClient()
  const { data: jobs, isLoading, refetch } = useJobs({ date: todayIso() })
  const updateJob = useUpdateJob()
  const { data: engineers } = useEngineers()
  const recordLocation = useRecordEngineerLocation()

  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [queueCount, setQueueCount] = useState(0)
  const [draining, setDraining] = useState(false)
  const drainingRef = useRef(false)

  useEffect(() => {
    const setOn = () => setOnline(true)
    const setOff = () => setOnline(false)
    window.addEventListener('online', setOn)
    window.addEventListener('offline', setOff)
    return () => {
      window.removeEventListener('online', setOn)
      window.removeEventListener('offline', setOff)
    }
  }, [])

  useEffect(() => subscribeQueue(setQueueCount), [])

  // Auto-drain when we come back online
  useEffect(() => {
    if (online && queueCount > 0 && !draining) {
      void drainQueue()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  const currentEngineer = useMemo(() => {
    if (!profile?.id) return null
    return (engineers ?? []).find((engineer) => engineer.profile_id === profile.id || engineer.id === profile.id) ?? null
  }, [engineers, profile?.id])

  const myJobs = useMemo<JobRow[]>(() => {
    if (!jobs) return []
    const assignmentIds = new Set([profile?.id, currentEngineer?.id].filter(Boolean))
    if (assignmentIds.size === 0) return []
    const dayEndMs = new Date(tomorrowIso()).getTime()
    // Only show jobs explicitly assigned to this engineer AND scheduled for
    // today. Some deployments store profile ids on assignments, while newer
    // rows store engineer ids. The same-day bound (scheduled_date < tomorrow)
    // is applied client-side because useJobs' date filter is lower-bound only.
    // Parse to epoch so DB timestamptz format ("+00:00") vs JS ISO ("Z") never
    // mis-compares at the boundary.
    return (jobs as unknown as Array<JobRow & { engineer_assignments?: Array<{ engineer_id: string }> }>).filter((j) => {
      if (j.scheduled_date && new Date(j.scheduled_date).getTime() >= dayEndMs) return false
      const a = j.engineer_assignments
      if (!a || a.length === 0) return false
      return a.some((x) => assignmentIds.has(x.engineer_id))
    })
  }, [currentEngineer?.id, jobs, profile?.id])

  async function drainQueue() {
    if (drainingRef.current) return
    drainingRef.current = true
    setDraining(true)
    const items = getQueue()
    for (const item of items) {
      try {
        if (item.kind === 'job-status') {
          await updateJob.mutateAsync({ id: item.jobId, status: item.status })
        } else if (item.kind === 'job-photo') {
          const orgId = organisation?.id
          if (!orgId) throw new Error('No organisation context to upload queued photo')
          const file = await dataUrlToFile(item.fileDataUrl, item.fileName, item.mimeType)
          // Deterministic path keyed on the stable rowId. `upsert` makes a
          // retried drain overwrite the same object rather than create a
          // Date.now()-suffixed duplicate. First segment MUST be the org id
          // (job-photos bucket RLS 00059 requires foldername[1] = caller org).
          const path = `${orgId}/${item.jobId}/${item.rowId}_${item.fileName}`
          const url = await uploadFile('job-photos', path, file, { upsert: true })
          // Upsert the row on the stable id so re-syncing is a no-op, not a dup.
          const { error: insertErr } = await supabase
            .from('job_photos')
            .upsert(
              {
                id: item.rowId,
                job_id: item.jobId,
                organisation_id: orgId,
                file_url: url,
                caption: item.fileName,
                photo_type: 'general',
                uploaded_by: profile?.id ?? null,
              },
              { onConflict: 'id', ignoreDuplicates: true },
            )
          if (insertErr) throw insertErr
          queryClient.invalidateQueries({ queryKey: ['job-photos', item.jobId] })
        }
        removeFromQueue(item.id)
      } catch (err) {
        console.warn('[field] drain failed for', item, err)
        toast.error('Some queued items failed to sync — will retry')
        // Stop draining; keep remaining items for next attempt.
        break
      }
    }
    drainingRef.current = false
    setDraining(false)
    refetch()
  }

  async function setStatus(jobId: string, status: string) {
    if (!online) {
      enqueue({ kind: 'job-status', jobId, status })
      toast('Saved offline', { description: 'Will sync when back online' })
      return
    }
    try {
      await updateJob.mutateAsync({ id: jobId, status })
    } catch {
      enqueue({ kind: 'job-status', jobId, status })
      toast('Saved offline', { description: 'Will sync when back online' })
    }
  }

  async function captureLocation(jobId: string, movementStatus: 'travelling' | 'on_site' | 'available' = 'travelling') {
    if (!currentEngineer) {
      toast.error('No engineer profile linked to this user')
      return
    }
    if (!navigator.geolocation) {
      toast.error('Location is not available on this device')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        recordLocation.mutate(
          {
            organisationId: organisation?.id,
            engineerId: currentEngineer.id,
            currentJobId: jobId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMetres: position.coords.accuracy ? Math.round(position.coords.accuracy) : null,
            movementStatus,
          },
          {
            onSuccess: () => toast.success('Location updated'),
            onError: (error) => toast.error(error.message || 'Failed to update location'),
          },
        )
      },
      (error) => {
        toast.error(error.message || 'Location permission denied')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  }

  async function handlePhotoCapture(jobId: string, file: File) {
    if (!online) {
      const dataUrl = await fileToDataUrl(file)
      enqueue({ kind: 'job-photo', jobId, fileDataUrl: dataUrl, fileName: file.name, mimeType: file.type })
      toast('Photo queued', { description: 'Will upload when back online' })
      return
    }

    // Upload to the real `job-photos` bucket (the previous `field-uploads`
    // bucket does not exist → every online upload threw and fell through to the
    // offline queue). The first path segment MUST be the org id (bucket RLS
    // 00059 requires foldername[1] = caller org). Without an org we can't form a
    // valid path, so queue instead.
    if (!organisation?.id) {
      const dataUrl = await fileToDataUrl(file)
      enqueue({ kind: 'job-photo', jobId, fileDataUrl: dataUrl, fileName: file.name, mimeType: file.type })
      toast('Photo queued', { description: 'Will upload when back online' })
      return
    }
    try {
      const path = `${organisation.id}/${jobId}/${Date.now()}_${file.name}`
      const url = await uploadFile('job-photos', path, file)
      // Insert a job_photos row so it shows up on the job detail too.
      // NB: `file_name` is NOT a column on job_photos — including it threw.
      await supabase.from('job_photos').insert({
        job_id: jobId,
        organisation_id: organisation.id,
        file_url: url,
        caption: file.name,
        photo_type: 'general',
        uploaded_by: profile?.id,
      })
      toast.success('Photo uploaded')
    } catch (err) {
      console.warn('[field] photo upload failed', err)
      const dataUrl = await fileToDataUrl(file)
      enqueue({ kind: 'job-photo', jobId, fileDataUrl: dataUrl, fileName: file.name, mimeType: file.type })
      toast('Photo queued', { description: 'Will upload when back online' })
    }
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-24">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Field Mode' },
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title="Field Mode" />
          <p className="text-label text-text-secondary mt-0.5">{myJobs.length} job{myJobs.length === 1 ? '' : 's'} for today</p>
        </div>
        <Chip
          variant="soft"
          color={online ? 'success' : 'warning'}
          size="sm"
        >
          <span className="inline-flex items-center gap-1">
            {online ? <Wifi size={12} /> : <WifiOff size={12} />}
            {online ? 'Online' : 'Offline'}
          </span>
        </Chip>
      </div>

      {/* Offline queue banner */}
      {queueCount > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-border-default bg-surface-card">
          <div className="w-9 h-9 rounded-lg bg-status-due-soon/15 text-status-due-soon flex items-center justify-center flex-shrink-0">
            <RotateCw size={16} className={draining ? 'animate-spin' : ''} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-label font-medium text-text-primary">
              {queueCount} action{queueCount === 1 ? '' : 's'} queued
            </p>
            <p className="text-micro text-text-secondary">
              {online ? 'Syncing…' : 'Will sync when online'}
            </p>
          </div>
          {online && !draining && (
            <Button size="sm" variant="secondary" onPress={() => void drainQueue()}>Sync now</Button>
          )}
        </div>
      )}

      {/* Job list */}
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : myJobs.length === 0 ? (
        <div className="bg-surface-card border border-border-default rounded-xl py-12 px-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-4">
            <CalendarCheck size={48} strokeWidth={1.25} className="text-text-muted" />
          </div>
          <h2 className="text-[16px] font-semibold text-text-primary">All clear today</h2>
          <p className="text-label text-text-secondary mt-1 max-w-sm">
            No assigned visits. Browse the schedule or check back later.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button asChild variant="primary" size="sm">
              <Link to="/dashboard/schedule">View schedule</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/jobs?filter=unassigned">Available jobs</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {myJobs.map((job) => (
            <FieldJobCard
              key={job.id}
              job={job}
              onSetStatus={(status) => setStatus(job.id, status)}
              onPhoto={(file) => handlePhotoCapture(job.id, file)}
              onLocation={(movementStatus) => captureLocation(job.id, movementStatus)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface CardProps {
  job: JobRow
  onSetStatus: (status: string) => void
  onPhoto: (file: File) => void
  onLocation: (movementStatus: 'travelling' | 'on_site' | 'available') => void
}

function FieldJobCard({ job, onSetStatus, onPhoto, onLocation }: CardProps) {
  const x = useMotionValue(0)
  const bg = useTransform(x, [0, SWIPE_THRESHOLD], ['rgba(34,197,94,0)', 'rgba(34,197,94,0.18)'])
  const fileRef = useRef<HTMLInputElement>(null)
  const [completing, setCompleting] = useState(false)

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD && job.status !== JOB_STATUSES.COMPLETED) {
      setCompleting(true)
      onSetStatus(JOB_STATUSES.COMPLETED)
      // animate off then snap back
      window.setTimeout(() => setCompleting(false), 600)
    }
  }

  const isComplete = job.status === JOB_STATUSES.COMPLETED
  const inProgress = job.status === JOB_STATUSES.IN_PROGRESS

  return (
    <li className="relative">
      <motion.div
        style={{ background: bg }}
        className="absolute inset-0 rounded-xl pointer-events-none flex items-center justify-start pl-5 text-status-compliant"
      >
        <CheckCircle2 size={20} />
        <span className="ml-2 text-caption font-medium">Mark complete</span>
      </motion.div>

      <motion.div
        drag={isComplete ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.4}
        style={{ x }}
        onDragEnd={handleDragEnd}
        animate={completing ? { x: 400, opacity: 0 } : { x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`relative bg-surface-card border rounded-xl shadow-sm overflow-hidden touch-pan-y ${
          isComplete ? 'border-status-compliant/40 opacity-70' : 'border-border-default'
        }`}
      >
        {/* Title row */}
        <div className="p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Chip size="sm" variant="soft" color={isComplete ? 'success' : inProgress ? 'warning' : 'accent'}>
                {job.status.replace(/_/g, ' ')}
              </Chip>
              {job.is_callout && (
                <Chip size="sm" variant="soft" color="danger">
                  <span className="inline-flex items-center gap-1"><PhoneCall size={11} /> Reactive</span>
                </Chip>
              )}
            </div>
            <h3 className="text-[16px] font-semibold text-text-primary mt-1.5 truncate">{job.title}</h3>
            {job.properties?.name && (
              <p className="text-label text-text-secondary mt-0.5 inline-flex items-center gap-1">
                <MapPin size={12} className="text-text-muted" />
                <span className="truncate">{job.properties.name}</span>
              </p>
            )}
            {(job.time_start || job.time_end) && (
              <p className="text-caption text-text-muted mt-1 inline-flex items-center gap-1">
                <Clock size={11} />
                {job.time_start ?? '—'} → {job.time_end ?? '—'}
              </p>
            )}
          </div>
          <Link
            to={`/dashboard/jobs/${job.id}`}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors flex-shrink-0"
            aria-label="Open job detail"
          >
            <ChevronRight size={20} />
          </Link>
        </div>

        {/* Action bar — large touch targets */}
        <div className="px-3 pb-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              onLocation('travelling')
              onSetStatus(JOB_STATUSES.IN_PROGRESS)
            }}
            disabled={isComplete}
            className="h-[60px] rounded-lg border border-border-default bg-surface-elevated text-text-primary font-medium text-label flex flex-col items-center justify-center gap-1 transition-colors hover:border-brand-500 hover:text-brand-500 disabled:opacity-40 disabled:hover:border-border-default disabled:hover:text-text-primary"
          >
            <Navigation2 size={18} />
            Travel
          </button>
          <button
            type="button"
            onClick={() => {
              onLocation('on_site')
              onSetStatus(JOB_STATUSES.IN_PROGRESS)
            }}
            disabled={isComplete}
            className="h-[60px] rounded-lg border border-border-default bg-surface-elevated text-text-primary font-medium text-label flex flex-col items-center justify-center gap-1 transition-colors hover:border-brand-500 hover:text-brand-500 disabled:opacity-40 disabled:hover:border-border-default disabled:hover:text-text-primary"
          >
            <Play size={18} />
            Arrived
          </button>
          <button
            type="button"
            onClick={() => onSetStatus(JOB_STATUSES.COMPLETED)}
            disabled={isComplete}
            className="h-[60px] rounded-lg bg-brand-500 text-white font-medium text-label flex flex-col items-center justify-center gap-1 transition-colors hover:bg-brand-600 disabled:opacity-40"
          >
            <CheckCircle2 size={18} />
            Complete
          </button>
        </div>

        {/* Camera quick action */}
        <div className="px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-12 rounded-lg border border-dashed border-border-default text-label font-medium text-text-secondary inline-flex items-center justify-center gap-2 hover:border-brand-500 hover:text-brand-500 transition-colors"
            >
              <Camera size={16} /> Add photo
            </button>
            <button
              type="button"
              onClick={() => onLocation(inProgress ? 'on_site' : 'travelling')}
              className="h-12 rounded-lg border border-border-default text-label font-medium text-text-secondary inline-flex items-center justify-center gap-2 hover:border-brand-500 hover:text-brand-500 transition-colors"
            >
              <MapPin size={16} /> Share location
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPhoto(f)
              if (fileRef.current) fileRef.current.value = ''
            }}
          />
        </div>
      </motion.div>
    </li>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// A single row from the `job_messages` table (migration 00093).
// `from_office` distinguishes office-originated messages from engineer ones
// (we also compare sender_id to currentUserId for bubble alignment).
export interface MessageRow {
  id: string
  sender_id: string | null
  sender_name: string | null
  body: string
  from_office: boolean
  created_at: string
}

// Job Chat data hook — a polled (NOT realtime) message thread scoped to a job.
//
// Realtime is deliberately avoided here: a per-job subscription on every open
// chat would add a standing Realtime connection + WAL pressure that's wasteful
// against the DB Disk IO budget for a low-frequency office⇄engineer thread.
// A lightweight 10s poll while the screen is mounted is plenty for this UX.
export function useJobMessages(jobId: string) {
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Resolved once and cached for the lifetime of the hook. We need the job's
  // organisation_id for inserts (RLS scopes rows to the caller's org), and the
  // user id for both inserts and bubble alignment in the UI.
  const orgIdRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)

  const fetch = useCallback(async () => {
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('job_messages')
        .select('id, sender_id, sender_name, body, from_office, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })

      if (fetchError) throw fetchError
      setMessages((data as MessageRow[]) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  // One-time resolution of the current user + the job's org, then an initial
  // fetch. Kept separate from `fetch` so the poll and `send` don't re-resolve.
  useEffect(() => {
    let cancelled = false
    // jobId changed (or first mount) — clear the previous job's thread and the
    // cached org/user context so a reused instance never briefly renders job A's
    // messages or sends a message with job A's org under job B.
    setMessages([])
    setLoading(true)
    orgIdRef.current = null
    userIdRef.current = null
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id ?? null
        if (!cancelled) {
          userIdRef.current = uid
          setCurrentUserId(uid)
        }

        const { data: jobRow } = await supabase
          .from('jobs')
          .select('organisation_id')
          .eq('id', jobId)
          .single()
        if (!cancelled) {
          orgIdRef.current = (jobRow as { organisation_id?: string } | null)?.organisation_id ?? null
        }
      } catch {
        // Non-fatal — the fetch below still runs and surfaces its own error.
      }
      if (!cancelled) await fetch()
    })()
    return () => {
      cancelled = true
    }
  }, [jobId, fetch])

  // Lightweight 10s poll while mounted (no realtime — see hook header).
  useEffect(() => {
    const interval = setInterval(() => {
      fetch()
    }, 10_000)
    return () => clearInterval(interval)
  }, [fetch])

  // Returns true only when the message was persisted, so the caller can keep
  // the engineer's typed text in the input on any failure (offline, RLS reject,
  // unresolved context) instead of silently losing it.
  const send = useCallback(
    async (body: string): Promise<boolean> => {
      const trimmed = body.trim()
      if (!trimmed) return false

      setSending(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const u = session?.user
        const userId = u?.id ?? userIdRef.current
        const orgId = orgIdRef.current
        if (!userId || !orgId) {
          setError('Cannot send — message context not ready')
          return false
        }

        const senderName =
          (u?.user_metadata?.full_name as string | undefined) ?? u?.email ?? 'Engineer'

        const { error: insertError } = await supabase.from('job_messages').insert({
          organisation_id: orgId,
          job_id: jobId,
          sender_id: userId,
          sender_name: senderName,
          body: trimmed,
          from_office: false,
        })
        if (insertError) {
          setError(insertError.message)
          return false
        }
        await fetch()
        return true
      } finally {
        setSending(false)
      }
    },
    [jobId, fetch],
  )

  return { messages, loading, error, sending, send, refetch: fetch, currentUserId }
}

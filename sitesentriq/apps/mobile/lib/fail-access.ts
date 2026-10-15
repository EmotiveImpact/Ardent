/**
 * Pure helpers for the failed-access flow. Kept out of useJobs so the note
 * composition + RPC args shape are unit-testable without the hook harness.
 */

export interface FailAccessInput {
  reason: string
  notes?: string | null
}

/** "no_answer" + "rang twice" → "Failed access — no answer: rang twice" */
export function composeFailAccessNote(payload: FailAccessInput): string {
  const reasonLabel = payload.reason.replace(/_/g, ' ')
  const extra = payload.notes?.trim()
  return `Failed access — ${reasonLabel}${extra ? `: ${extra}` : ''}`
}

/** Named args for the record_failed_access RPC (one transactional call —
 *  status update + reason note land atomically; see offline-queue.ts
 *  "Atomicity rule"). p_note_id is stamped by the CALLER so the enqueued
 *  action replays idempotently. */
export function buildFailAccessArgs(opts: {
  jobId: string
  noteId: string
  note: string
  userName: string
}): Record<string, unknown> {
  return {
    p_job_id: opts.jobId,
    p_note_id: opts.noteId,
    p_note_content: opts.note,
    p_user_name: opts.userName,
  }
}

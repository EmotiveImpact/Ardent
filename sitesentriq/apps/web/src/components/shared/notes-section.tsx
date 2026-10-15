import { useState } from 'react'
import { Button, Tooltip } from '@haumea/ui'
import { X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useNotes, useCreateNote, useDeleteNote } from '@/hooks/use-notes'
import { useAuthContext } from '@/contexts/auth-context'
import { ListSkeleton } from '@/components/shared/skeletons'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'

interface NotesSectionProps {
  propertyId?: string
  assetId?: string
  jobId?: string
  clientId?: string
}

export function NotesSection({ propertyId, assetId, jobId, clientId }: NotesSectionProps) {
  const [content, setContent] = useState('')
  // Wave A1 — confirm before delete. Notes were previously wiped on a
  // single click with no undo path; now we gate the mutation behind the
  // shared <ConfirmDialog> primitive used by other destructive actions.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const filters = { propertyId, assetId, jobId, clientId }
  const { data: notes, isLoading } = useNotes(filters)
  const createNote = useCreateNote()
  const deleteNote = useDeleteNote()
  const { profile } = useAuthContext()

  const handleAdd = () => {
    if (!content.trim()) return
    createNote.mutate(
      {
        content: content.trim(),
        property_id: propertyId,
        asset_id: assetId,
        job_id: jobId,
        client_id: clientId,
        organisation_id: profile?.organisation_id,
      },
      {
        onSuccess: () => setContent(''),
      }
    )
  }

  const requestDelete = (id: string) => {
    setPendingDeleteId(id)
  }

  const confirmDelete = () => {
    if (!pendingDeleteId) return
    deleteNote.mutate({ id: pendingDeleteId, filters })
    setPendingDeleteId(null)
  }

  const cancelDelete = () => {
    setPendingDeleteId(null)
  }

  return (
    <div className="rounded-lg border border-border-default bg-surface-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">Notes</h3>

      {/* Add note form */}
      <div className="mb-4 flex gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a note..."
          rows={2}
          className="flex-1 rounded-md border border-border-default bg-surface-card px-3 py-2 text-label text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Button
          size="sm"
          variant="primary"
          isDisabled={!content.trim() || createNote.isPending}
          onPress={handleAdd}
        >
          {createNote.isPending ? 'Adding...' : 'Add Note'}
        </Button>
      </div>

      {/* Notes list */}
      {isLoading ? (
        <ListSkeleton rows={2} withAvatar={false} framed={false} />
      ) : !notes?.length ? (
        <p className="py-4 text-center text-label text-text-muted">No notes yet</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="group relative rounded-md border border-border-subtle bg-surface-elevated px-3 py-2"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-label font-medium text-text-secondary">
                  {note.user_name || 'Unknown'}
                </span>
                <span className="text-caption text-text-muted">
                  {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                </span>
              </div>
              <p className="text-label text-text-primary whitespace-pre-wrap">{note.content}</p>
              <Tooltip delay={400}>
                <Tooltip.Trigger>
                  <button
                    onClick={() => requestDelete(note.id)}
                    className="absolute right-2 top-2 hidden rounded p-0.5 text-text-muted hover:bg-surface-elevated hover:text-text-secondary group-hover:block"
                    aria-label="Delete note"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Content placement="top">
                  <Tooltip.Arrow />
                  Delete note
                </Tooltip.Content>
              </Tooltip>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete Note"
        message="Are you sure you want to delete this note? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  )
}

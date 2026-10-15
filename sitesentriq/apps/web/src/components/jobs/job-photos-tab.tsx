import { Button, Chip, Modal } from '@haumea/ui'
import { AppCard, FormSelect, Heading, Text } from '@haumea/ui'
import { Camera, Plus, Trash2, X } from 'lucide-react'

import { formatDate } from '@haumea/utils'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { FileUpload } from '@/components/shared/file-upload'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import type { JobPhoto, JobPhotoType } from '@haumea/types'

const PHOTO_TYPE_OPTIONS: { value: JobPhotoType; label: string }[] = [
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
  { value: 'issue', label: 'Issue' },
  { value: 'general', label: 'General' },
]

const PHOTO_TYPE_CHIP_COLOR: Record<JobPhotoType, 'accent' | 'success' | 'danger' | 'default'> = {
  before: 'accent',
  after: 'success',
  issue: 'danger',
  general: 'default',
}

export function JobPhotosTab({
  photos,
  isLoading,
  showUploadForm,
  onToggleUploadForm,
  uploadFile,
  onUploadFileChange,
  uploadCaption,
  onUploadCaptionChange,
  uploadPhotoType,
  onUploadPhotoTypeChange,
  onUploadPhoto,
  isUploading,
  deletePhotoConfirm,
  onDeletePhotoConfirmChange,
  onDeletePhoto,
  lightboxPhoto,
  onLightboxPhotoChange,
}: {
  photos?: JobPhoto[]
  isLoading: boolean
  showUploadForm: boolean
  onToggleUploadForm: () => void
  uploadFile: File | null
  onUploadFileChange: (file: File | null) => void
  uploadCaption: string
  onUploadCaptionChange: (caption: string) => void
  uploadPhotoType: JobPhotoType
  onUploadPhotoTypeChange: (type: JobPhotoType) => void
  onUploadPhoto: () => void
  isUploading: boolean
  deletePhotoConfirm: JobPhoto | null
  onDeletePhotoConfirmChange: (photo: JobPhoto | null) => void
  onDeletePhoto: (photo: JobPhoto) => void
  lightboxPhoto: JobPhoto | null
  onLightboxPhotoChange: (photo: JobPhoto | null) => void
}) {
  const photoCount = photos?.length ?? 0

  return (
    <>
      <AppCard>
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Heading level={2} scale="body">
              Photos
            </Heading>
            {photoCount > 0 ? (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent-soft px-1.5 text-micro font-medium text-accent-soft-foreground">
                {photoCount}
              </span>
            ) : null}
          </div>
          <Button variant="primary" size="sm" onPress={onToggleUploadForm}>
            <Plus size={14} />
            Add Photos
          </Button>
        </div>

        {showUploadForm ? (
          <div className="mb-5 space-y-4 rounded-xl border border-border-default bg-surface-page p-4">
            <div className="flex items-center justify-between">
              <Heading level={3} scale="body">
                Upload Photo
              </Heading>
              <button
                type="button"
                onClick={() => {
                  onToggleUploadForm()
                  onUploadFileChange(null)
                  onUploadCaptionChange('')
                  onUploadPhotoTypeChange('general')
                }}
                className="rounded-lg p-1 transition-colors hover:bg-surface-page"
              >
                <X size={14} className="text-text-muted" />
              </button>
            </div>

            <FileUpload
              accept="image/*"
              onChange={onUploadFileChange}
              value={uploadFile}
              description="Drop a photo here or click to browse"
              maxSizeMB={10}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-caption font-medium uppercase tracking-[0.04em] text-text-muted">Caption</label>
                <input
                  type="text"
                  value={uploadCaption}
                  onChange={(e) => onUploadCaptionChange(e.target.value)}
                  placeholder="Optional caption..."
                  className="w-full rounded-lg border border-border-default bg-surface-card px-3 py-2 text-label text-text-secondary transition-colors focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-caption font-medium uppercase tracking-[0.04em] text-text-muted">Photo Type</label>
                <FormSelect<JobPhotoType>
                  value={uploadPhotoType}
                  onChange={onUploadPhotoTypeChange}
                  ariaLabel="Photo Type"
                  options={PHOTO_TYPE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="primary" size="sm" onPress={onUploadPhoto} isDisabled={!uploadFile || isUploading}>
                {!isUploading ? <Camera size={14} /> : null}
                Upload Photo
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <CardGridSkeleton count={4} columns={4} />
        ) : photos && photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => (
              <div key={photo.id} className="group overflow-hidden rounded-xl border border-border-default bg-surface-card">
                <div className="relative aspect-[4/3] cursor-pointer bg-surface-page" onClick={() => onLightboxPhotoChange(photo)}>
                  <img src={photo.file_url} alt={photo.caption || 'Job photo'} className="h-full w-full object-cover" loading="lazy" />
                  <div className="absolute left-2 top-2">
                    <Chip size="sm" color={PHOTO_TYPE_CHIP_COLOR[photo.photo_type as JobPhotoType] ?? 'default'} variant="soft" className="text-[10px]">
                      {photo.photo_type}
                    </Chip>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeletePhotoConfirmChange(photo)
                    }}
                    className="absolute right-2 top-2 rounded-lg bg-surface-card/80 p-1 text-text-muted opacity-0 transition-all hover:bg-surface-card hover:text-status-overdue group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="px-3 py-2">
                  {photo.caption ? <p className="truncate text-label text-text-secondary">{photo.caption}</p> : null}
                  <Text scale="micro" tone="muted">
                    {photo.uploaded_at ? formatDate(photo.uploaded_at) : '-'}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <Camera size={32} strokeWidth={1.5} className="mb-3" />
            <Text scale="caption" tone="muted">
              No photos yet
            </Text>
            <Text scale="micro" tone="muted" className="mt-1">
              Add before/after photos to document this job
            </Text>
          </div>
        )}
      </AppCard>

      <ConfirmDialog
        open={!!deletePhotoConfirm}
        title="Delete Photo"
        message="Are you sure you want to delete this photo? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deletePhotoConfirm && onDeletePhoto(deletePhotoConfirm)}
        onCancel={() => onDeletePhotoConfirmChange(null)}
      />

      <Modal.Backdrop
        isOpen={!!lightboxPhoto}
        onOpenChange={(next) => {
          if (!next) onLightboxPhotoChange(null)
        }}
      >
        <Modal.Container size="cover">
          <Modal.Dialog className="border-0 bg-transparent shadow-none">
            <Modal.CloseTrigger />
            <Modal.Body className="flex flex-col items-center justify-center">
              {lightboxPhoto ? (
                <>
                  <img
                    src={lightboxPhoto.file_url}
                    alt={lightboxPhoto.caption || 'Job photo'}
                    className="h-auto max-h-[85vh] w-full rounded-xl object-contain"
                  />
                  {lightboxPhoto.caption ? (
                    <div className="mt-3 text-center">
                      <Text scale="body">{lightboxPhoto.caption}</Text>
                      <div className="mt-1">
                        <Chip size="sm" color={PHOTO_TYPE_CHIP_COLOR[lightboxPhoto.photo_type as JobPhotoType] ?? 'default'} variant="soft" className="text-[10px]">
                          {lightboxPhoto.photo_type}
                        </Chip>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}

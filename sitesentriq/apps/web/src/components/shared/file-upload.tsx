import { useRef, useState, useCallback } from 'react'
import { Upload, X, FileText } from 'lucide-react'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface FileUploadProps {
  accept?: string
  onChange: (file: File | null) => void
  value?: File | null
  label?: string
  description?: string
  maxSizeMB?: number
  disabled?: boolean
}

export function FileUpload({
  accept,
  onChange,
  value,
  label,
  description = 'Drop files here or click to browse',
  maxSizeMB = 25,
  disabled = false,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    (file: File | null) => {
      setError(null)
      if (file && maxSizeMB && file.size > maxSizeMB * 1024 * 1024) {
        setError(`File must be smaller than ${maxSizeMB}MB`)
        return
      }
      onChange(file)
    },
    [onChange, maxSizeMB],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      if (disabled) return
      const file = e.dataTransfer.files?.[0] || null
      handleFile(file)
    },
    [handleFile, disabled],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) setDragActive(true)
    },
    [disabled],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null
      handleFile(file)
    },
    [handleFile],
  )

  const handleRemove = useCallback(() => {
    onChange(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [onChange])

  const openFilePicker = useCallback(() => {
    if (!disabled) inputRef.current?.click()
  }, [disabled])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        inputRef.current?.click()
      }
    },
    [disabled],
  )

  return (
    <div>
      {label && (
        <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">
          {label}
        </label>
      )}

      {value ? (
        <div className="flex items-center gap-3 border border-border-default rounded-xl bg-surface-elevated px-4 py-3">
          <FileText size={20} strokeWidth={1.5} className="text-text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-label font-medium text-text-primary truncate">{value.name}</p>
            <p className="text-micro text-text-muted">{formatFileSize(value.size)}</p>
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleRemove}
              aria-label={label ? `Remove ${label}` : 'Remove file'}
              className="shrink-0 p-1 rounded-lg hover:bg-surface-page transition-colors"
            >
              <X size={14} className="text-text-muted" />
            </button>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={label ? `Upload ${label}` : 'Upload file'}
          aria-disabled={disabled}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={openFilePicker}
          onKeyDown={handleKeyDown}
          className={`
            border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
            ${dragActive ? 'border-accent bg-accent-soft/40' : 'border-border-default bg-surface-elevated'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-accent'}
          `}
        >
          <Upload size={28} strokeWidth={1.5} className="text-text-muted mx-auto mb-3" />
          <p className="text-label text-text-secondary">{description}</p>
          <p className="text-micro text-text-muted mt-1">Max {maxSizeMB}MB</p>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleChange}
            className="hidden"
            disabled={disabled}
          />
        </div>
      )}

      {error && <p className="text-caption text-status-overdue mt-1">{error}</p>}
    </div>
  )
}

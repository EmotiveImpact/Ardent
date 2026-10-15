import { useCallback, useRef, useState } from 'react'
import { Upload, FileText, X } from 'lucide-react'
import { Button } from '@haumea/ui'

interface CsvDropZoneProps {
  onFile: (filename: string, text: string) => void
  filename?: string | null
  onClear?: () => void
}

export function CsvDropZone({ onFile, filename, onClear }: CsvDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    (file: File) => {
      setError(null)
      if (!/\.csv$/i.test(file.name)) {
        setError('Only .csv files are supported (XLSX coming soon).')
        return
      }
      if (file.size > 25 * 1024 * 1024) {
        setError('File too large — max 25 MB per import.')
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result ?? '')
        onFile(file.name, text)
      }
      reader.onerror = () => setError('Could not read the file.')
      reader.readAsText(file)
    },
    [onFile],
  )

  if (filename) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border-default bg-surface-elevated">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={18} className="text-brand-500 flex-shrink-0" />
          <span className="text-label text-text-primary truncate">{filename}</span>
        </div>
        {onClear && (
          <Button isIconOnly size="sm" variant="ghost" onPress={onClear} aria-label="Remove file">
            <X size={16} />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files?.[0]
          if (file) handleFile(file)
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        className={[
          'flex flex-col items-center justify-center gap-2 px-6 py-12 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
          dragOver
            ? 'border-brand-500 bg-brand-500/5'
            : 'border-border-default hover:border-brand-500/60 hover:bg-surface-elevated',
        ].join(' ')}
      >
        <Upload size={32} className="text-brand-500" />
        <p className="text-body font-medium text-text-primary">Drop your CSV here, or click to browse</p>
        <p className="text-caption text-text-muted">Only .csv files. Max 25 MB.</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {error && (
        <p className="text-caption text-status-overdue" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

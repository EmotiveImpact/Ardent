// Wave 17C — CsvImportModal migrated from a bespoke `fixed inset-0` div
// pile to HeroUI v3 <Modal>. The component still exposes the same prop
// shape (open / onClose / title / columns / onImport) so callers don't
// need to change. Focus trap, ESC, and click-outside-to-close are now
// handled by HeroUI for free.
import { Button, Modal } from '@haumea/ui'
import { FormSelect } from '@haumea/ui'
import { useState, useCallback, useRef } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

export interface CsvColumnConfig {
  field: string
  label: string
  required?: boolean
  type?: 'string' | 'number' | 'email'
}

interface CsvImportModalProps {
  open: boolean
  onClose: () => void
  title: string
  columns: CsvColumnConfig[]
  onImport: (rows: Record<string, string>[]) => Promise<{ success: number; failed: number }>
}

type ImportState = 'idle' | 'preview' | 'importing' | 'done'

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  // Single character-level parse that tracks quotes ACROSS newlines. The old
  // version split on \n BEFORE handling quotes, so a quoted field containing a
  // newline (exactly what exportToCsv emits for multi-line address/notes) was
  // split mid-field — truncating the first fragment and turning continuations
  // into garbage rows. A newline is a row delimiter only when not inside quotes.
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field.trim())
      field = ''
    } else if (ch === '\r') {
      // ignore — handled on the following \n
    } else if (ch === '\n') {
      row.push(field.trim())
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  // Flush the final field/row (input without a trailing newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim())
    rows.push(row)
  }
  // Drop fully-empty rows (blank lines).
  const nonEmpty = rows.filter((r) => r.some((c) => c !== ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }
  return { headers: nonEmpty[0], rows: nonEmpty.slice(1) }
}

export function CsvImportModal({ open, onClose, title, columns, onImport }: CsvImportModalProps) {
  const [state, setState] = useState<ImportState>('idle')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<string[]>([])
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [importResult, setImportResult] = useState({ success: 0, failed: 0 })
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = useCallback(() => {
    setState('idle')
    setCsvHeaders([])
    setCsvRows([])
    setColumnMapping({})
    setErrors([])
    setImportProgress({ current: 0, total: 0 })
    setImportResult({ success: 0, failed: 0 })
    setFileName('')
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.csv')) {
        setErrors(['Please select a CSV file.'])
        return
      }
      setFileName(file.name)
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        const { headers, rows } = parseCsv(text)
        if (headers.length === 0 || rows.length === 0) {
          setErrors(['CSV file is empty or has no data rows.'])
          return
        }
        setCsvHeaders(headers)
        setCsvRows(rows)

        // Auto-map columns by matching header names (case-insensitive)
        const autoMap: Record<string, string> = {}
        for (const col of columns) {
          const match = headers.find(
            (h) =>
              h.toLowerCase() === col.field.toLowerCase() ||
              h.toLowerCase() === col.label.toLowerCase() ||
              h.toLowerCase().replace(/[\s_-]/g, '') === col.field.toLowerCase().replace(/[\s_-]/g, '')
          )
          if (match) {
            autoMap[col.field] = match
          }
        }
        setColumnMapping(autoMap)
        setErrors([])
        setState('preview')
      }
      reader.readAsText(file)
    },
    [columns]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const validateAndImport = useCallback(async () => {
    // Validate required columns are mapped
    const validationErrors: string[] = []
    for (const col of columns) {
      if (col.required && !columnMapping[col.field]) {
        validationErrors.push(`"${col.label}" is required but not mapped to a CSV column.`)
      }
    }
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }

    // Build mapped rows
    const mappedRows: Record<string, string>[] = csvRows.map((row) => {
      const obj: Record<string, string> = {}
      for (const col of columns) {
        const csvHeader = columnMapping[col.field]
        if (csvHeader) {
          const idx = csvHeaders.indexOf(csvHeader)
          if (idx !== -1) {
            obj[col.field] = row[idx] ?? ''
          }
        }
      }
      return obj
    })

    // Validate required field values
    const rowErrors: string[] = []
    for (let i = 0; i < mappedRows.length; i++) {
      for (const col of columns) {
        if (col.required && !mappedRows[i][col.field]?.trim()) {
          rowErrors.push(`Row ${i + 1}: "${col.label}" is empty.`)
        }
      }
    }
    if (rowErrors.length > 0) {
      setErrors(rowErrors.slice(0, 10))
      return
    }

    setErrors([])
    setState('importing')
    setImportProgress({ current: 0, total: mappedRows.length })

    const result = await onImport(mappedRows)

    setImportResult(result)
    setImportProgress({ current: mappedRows.length, total: mappedRows.length })
    setState('done')
  }, [columns, columnMapping, csvHeaders, csvRows, onImport])

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
    >
      <Modal.Container size="lg">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
          {/* Idle: drop zone */}
          {state === 'idle' && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              // Wave G1 — `role="button"` + tabIndex + keyboard handler so the
              // drop-zone is reachable by keyboard and announced as a button.
              // Stays a <div> so we keep native drag-and-drop semantics.
              role="button"
              tabIndex={0}
              aria-label="Choose a CSV file to upload, or drop one here"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileRef.current?.click()
                }
              }}
              className="border-2 border-dashed border-border-default rounded-xl p-10 text-center hover:border-accent hover:bg-accent-soft/30 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/50"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={32} className="mx-auto text-text-muted mb-3" />
              <p className="text-label font-medium text-text-primary">
                Drop a CSV file here or click to browse
              </p>
              <p className="text-micro text-text-muted mt-1">
                Expected columns: {columns.map((c) => c.label).join(', ')}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                aria-label="Choose a CSV file to upload"
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          )}

          {/* Preview */}
          {state === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-label text-text-secondary">
                <FileText size={14} className="text-text-muted" />
                <span className="font-medium">{fileName}</span>
                <span className="text-text-muted">-- {csvRows.length} rows found</span>
              </div>

              {/* Column mapping */}
              <div>
                <h4 className="text-micro font-medium text-text-muted uppercase tracking-[0.04em] mb-2">
                  Column Mapping
                </h4>
                <div className="space-y-2">
                  {columns.map((col) => (
                    <div key={col.field} className="flex items-center gap-3">
                      <span className="text-label text-text-secondary w-36 shrink-0">
                        {col.label}
                        {col.required && <span className="text-status-overdue ml-0.5">*</span>}
                      </span>
                      <div className="flex-1">
                        <FormSelect
                          value={columnMapping[col.field] || ''}
                          onChange={(v) => setColumnMapping((prev) => ({ ...prev, [col.field]: v }))}
                          ariaLabel={`Map ${col.label}`}
                          placeholder="-- Skip --"
                          clearable
                          options={csvHeaders.map((h) => ({ value: h, label: h }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview table */}
              <div>
                <h4 className="text-micro font-medium text-text-muted uppercase tracking-[0.04em] mb-2">
                  Preview (first 5 rows)
                </h4>
                <div className="overflow-x-auto border border-border-default rounded-lg">
                  <table aria-label="CSV import preview" className="w-full text-caption">
                      <thead><tr>
                        {columns
                          .filter((col) => columnMapping[col.field])
                          .map((col) => (
                            <th
                              key={col.field}
                              id={col.field}
                              className="text-left py-2 px-3 text-micro font-medium text-text-muted uppercase"
                            >
                              {col.label}
                            </th>
                          ))}
                      </tr></thead>
                      <tbody>
                        {csvRows.slice(0, 5).map((row, rowIdx) => (
                          <tr key={rowIdx} id={String(rowIdx)} className="border-b border-border-subtle last:border-0">
                            {columns
                              .filter((col) => columnMapping[col.field])
                              .map((col) => {
                                const idx = csvHeaders.indexOf(columnMapping[col.field])
                                return (
                                  <td key={col.field} id={col.field} className="py-2 px-3 text-text-secondary">
                                    {idx !== -1 ? row[idx] || '-' : '-'}
                                  </td>
                                )
                              })}
                          </tr>
                        ))}
                      </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Importing */}
          {state === 'importing' && (
            <div className="text-center py-10">
              <Loader2 size={32} className="mx-auto text-brand-500 animate-spin mb-3" />
              <p className="text-label font-medium text-text-primary">
                Importing {importProgress.current} of {importProgress.total}...
              </p>
            </div>
          )}

          {/* Done */}
          {state === 'done' && (
            <div className="text-center py-10">
              <CheckCircle2 size={32} className="mx-auto text-status-compliant mb-3" />
              <p className="text-[15px] font-semibold text-text-primary mb-1">Import Complete</p>
              <p className="text-label text-text-secondary">
                {importResult.success} imported successfully
                {importResult.failed > 0 && (
                  <span className="text-status-overdue">, {importResult.failed} failed</span>
                )}
              </p>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="mt-4 bg-status-overdue/10 border border-status-overdue/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="text-status-overdue mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  {errors.map((err, i) => (
                    <p key={i} className="text-caption text-status-overdue">
                      {err}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
          </Modal.Body>
          <Modal.Footer>
            {state === 'done' ? (
              <Button variant="primary" onPress={handleClose}>
                Close
              </Button>
            ) : (
              <>
                <Button variant="tertiary" onPress={handleClose}>
                  Cancel
                </Button>
                {state === 'preview' && (
                  <Button variant="primary" onPress={validateAndImport}>
                    Import {csvRows.length} Rows
                  </Button>
                )}
              </>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

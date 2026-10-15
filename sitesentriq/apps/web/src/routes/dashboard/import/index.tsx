import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, Chip, Spinner } from '@haumea/ui'
import { ArrowLeft, ArrowRight, Download, FileWarning, CheckCircle2 } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { SectionHeader } from '@/components/shared/section-header'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { supabase } from '@/lib/supabase'
import { ENTITY_LIST, SCHEMAS, type ImportEntity } from '@/lib/import/schemas'
import { parseCsv, buildCsv } from '@/lib/import/parse'
import { suggestMapping } from '@/lib/import/match'
import { runImport, validateRows, hasBlockingErrors, type ImportResult, type ValidatedRow } from '@/lib/import/run'
import { EntityPicker } from '@/components/import/entity-picker'
import { CsvDropZone } from '@/components/import/csv-drop-zone'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { MappingTable } from '@/components/import/mapping-table'
import { PreviewTable } from '@/components/import/preview-table'
import { StepIndicator } from '@/components/import/step-indicator'
import { Text } from '@haumea/ui'

const STEPS = [
  { key: 'entity', label: 'Pick entity' },
  { key: 'upload', label: 'Upload + parse' },
  { key: 'map', label: 'Map columns' },
  { key: 'preview', label: 'Preview + import' },
  { key: 'result', label: 'Result' },
]

const cardClass = 'bg-surface-card border border-border-default rounded-xl'

function downloadFile(filename: string, content: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function buildSampleCsv(entity: ImportEntity): string {
  const schema = SCHEMAS[entity]
  const headers = schema.fields.map((f) => f.label)
  const example1 = schema.fields.map((f) => {
    if (f.key === 'name') return entity === 'engineers' ? 'Alice Brown' : 'Acme HQ'
    if (f.key === 'client_name') return 'Acme Corp'
    if (f.key === 'property_name') return 'Acme HQ'
    if (f.key === 'asset_name') return 'Boiler 1'
    if (f.key === 'email' || f.key === 'contact_email') return 'alice@example.com'
    if (f.key === 'phone' || f.key === 'contact_phone') return '+44 20 7946 0000'
    if (f.key === 'address') return '10 Downing Street'
    if (f.key === 'postcode' || f.key === 'home_postcode') return 'SW1A 2AA'
    if (f.key === 'city') return 'London'
    if (f.key === 'latitude') return '51.5034'
    if (f.key === 'longitude') return '-0.1276'
    if (f.key === 'property_type') return 'Office'
    if (f.key === 'category') return 'HVAC'
    if (f.key === 'make') return 'Vaillant'
    if (f.key === 'model') return 'EcoTec 30'
    if (f.key === 'serial_number') return 'SN-12345'
    if (f.key === 'install_date' || f.key === 'last_completed') return '2024-01-15'
    if (f.key === 'next_due') return '2025-01-15'
    if (f.key === 'location') return 'Plant room'
    if (f.key === 'trade') return 'HVAC Engineer'
    if (f.key === 'skills') return 'gas safe, electrical'
    if (f.key === 'weekly_capacity_hours') return '40'
    if (f.key === 'compliance_type') return 'Gas Safety'
    if (f.key === 'frequency') return 'annual'
    return ''
  })
  return buildCsv(headers, [example1])
}

export default function ImportWizardPage() {
  const [params, setParams] = useSearchParams()
  const { profile } = useAuth()
  const { can } = usePermissions()

  const orgId = profile?.organisation_id ?? ''
  const userId = profile?.id ?? null

  const stepFromUrl = Math.max(0, Math.min(STEPS.length - 1, Number(params.get('step') ?? '0')))
  const entityFromUrl = (params.get('entity') as ImportEntity | null) ?? null

  const [step, setStep] = useState(stepFromUrl)
  const [entity, setEntity] = useState<ImportEntity | null>(
    entityFromUrl && ENTITY_LIST.includes(entityFromUrl) ? entityFromUrl : null,
  )
  const [filename, setFilename] = useState<string | null>(null)
  const [csv, setCsv] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null)
  const [mapping, setMapping] = useState<Record<string, string | null>>({})
  const [suggested, setSuggested] = useState<Record<string, string | null>>({})
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const [lifetime, setLifetime] = useState<Partial<Record<ImportEntity, number>>>({})
  const [lifetimeLoaded, setLifetimeLoaded] = useState(false)

  // Sync URL whenever step/entity changes
  useEffect(() => {
    const next = new URLSearchParams(params)
    next.set('step', String(step))
    if (entity) next.set('entity', entity)
    else next.delete('entity')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, entity])

  // Load lifetime counts on mount
  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('import_runs')
        .select('entity_type, inserted_rows')
        .eq('organisation_id', orgId)
        .eq('status', 'completed')
      if (cancelled) return
      const totals: Partial<Record<ImportEntity, number>> = {}
      if (!error && data) {
        for (const row of data as { entity_type: ImportEntity; inserted_rows: number }[]) {
          totals[row.entity_type] = (totals[row.entity_type] ?? 0) + (row.inserted_rows ?? 0)
        }
      }
      setLifetime(totals)
      setLifetimeLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  // Validate rows for preview / import
  const validated: ValidatedRow[] = useMemo(() => {
    if (!entity || !csv) return []
    return validateRows(entity, csv.rows, mapping)
  }, [entity, csv, mapping])

  const blocking = hasBlockingErrors(validated)
  const validCount = validated.filter((r) => r.errors.length === 0 && !r.isDuplicate).length
  const dupCount = validated.filter((r) => !r.errors.length && r.isDuplicate).length
  const errCount = validated.filter((r) => r.errors.length > 0).length

  // Required fields covered? (used to gate "Next" on the mapping step)
  const requiredCovered = useMemo(() => {
    if (!entity) return false
    const claimed = new Set<string>()
    for (const v of Object.values(mapping)) if (v) claimed.add(v)
    return SCHEMAS[entity].fields.filter((f) => f.required).every((f) => claimed.has(f.key))
  }, [entity, mapping])

  // Handlers ────────────────────────────────────────────────────────────────
  const handlePickEntity = (e: ImportEntity) => {
    setEntity(e)
    setStep(1)
    setFilename(null)
    setCsv(null)
    setMapping({})
    setResult(null)
  }

  const handleFile = (name: string, text: string) => {
    setFilename(name)
    const parsed = parseCsv(text)
    setCsv(parsed)
    if (entity) {
      const { mapping: suggestedMap } = suggestMapping(parsed.headers, SCHEMAS[entity].fields)
      setSuggested(suggestedMap)
      setMapping(suggestedMap)
    }
  }

  const handleClearFile = () => {
    setFilename(null)
    setCsv(null)
    setMapping({})
    setSuggested({})
  }

  const handleRunImport = async () => {
    if (!entity || !csv || !orgId) return
    setImporting(true)
    try {
      const res = await runImport({
        entity,
        validated,
        organisationId: orgId,
        userId,
        sourceFilename: filename ?? 'upload.csv',
      })
      setResult(res)
      setStep(4)
      setLifetime((prev) => ({ ...prev, [entity]: (prev[entity] ?? 0) + res.inserted }))
    } finally {
      setImporting(false)
    }
  }

  const handleDownloadErrorsCsv = () => {
    if (!result || !entity) return
    const headers = ['row', 'message']
    const rows = result.errors.map((e) => [e.row, e.message])
    downloadFile(`import-errors-${entity}-${Date.now()}.csv`, buildCsv(headers, rows))
  }

  const handleStartOver = () => {
    setEntity(null)
    setFilename(null)
    setCsv(null)
    setMapping({})
    setSuggested({})
    setResult(null)
    setStep(0)
  }

  // Permission check ────────────────────────────────────────────────────────
  if (!can('import:write')) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Breadcrumbs
          items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Bulk import' }]}
        />
        <div className={`${cardClass} p-8 text-center space-y-3`}>
          <FileWarning size={32} className="mx-auto text-status-overdue" />
          <h2 className="text-[16px] font-semibold text-text-primary">Access denied</h2>
          <p className="text-label text-text-muted">
            Only organisation admins can run bulk imports.
          </p>
        </div>
      </div>
    )
  }

  const schema = entity ? SCHEMAS[entity] : null
  const stepReachable = (i: number) => {
    if (i === 0) return true
    if (i === 1) return !!entity
    if (i === 2) return !!entity && !!csv
    if (i === 3) return !!entity && !!csv
    if (i === 4) return !!result
    return false
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <Breadcrumbs
        items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Bulk import' }]}
      />

      <SectionHeader
        variant="page"
        title="Bulk import"
        subtitle="Import clients, properties, assets, engineers, or compliance items from CSV."
      />

      <div className={`${cardClass} p-4`}>
        <StepIndicator
          steps={STEPS}
          currentIndex={step}
          reachable={stepReachable}
          onStepClick={(i) => stepReachable(i) && setStep(i)}
        />
      </div>

      {/* STEP 1 — pick entity ───────────────────────────────────────────── */}
      {step === 0 && (
        <div className={`${cardClass} p-6 space-y-4`}>
          <h2 className="text-[15px] font-semibold text-text-primary">
            What would you like to import?
          </h2>
          {!lifetimeLoaded ? (
            <CardGridSkeleton count={6} columns={3} />
          ) : (
            <EntityPicker onPick={handlePickEntity} lifetime={lifetime} />
          )}
        </div>
      )}

      {/* STEP 2 — upload ────────────────────────────────────────────────── */}
      {step === 1 && entity && schema && (
        <div className={`${cardClass} p-6 space-y-4`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">
                Upload CSV — {schema.label}
              </h2>
              <Text scale="caption" tone="muted">{schema.description}</Text>
            </div>
            <Button
              size="sm"
              variant="outline"
              onPress={() => downloadFile(`sample-${entity}.csv`, buildSampleCsv(entity))}
            >
              <Download size={14} />
              Download sample CSV
            </Button>
          </div>
          <CsvDropZone onFile={handleFile} filename={filename} onClear={handleClearFile} />
          {csv && (
            <div className="rounded-lg border border-border-default p-4 space-y-3">
              <div className="flex items-center gap-3 text-caption text-text-muted">
                <span>{csv.rows.length.toLocaleString()} rows detected</span>
                <span>·</span>
                <span>{csv.headers.length} columns</span>
              </div>
              <div className="overflow-x-auto">
                <table aria-label="CSV preview" className="w-full text-caption">
                    <thead><tr>
                      {csv.headers.map((h) => (
                        <th
                          key={h}
                          id={h}
                          className="text-left px-3 py-1.5 font-medium whitespace-nowrap text-text-muted"
                        >
                          {h}
                        </th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {csv.rows.slice(0, 5).map((r, i) => (
                        <tr key={i} id={String(i)} className="border-t border-border-default">
                          {csv.headers.map((h) => (
                            <td key={h} id={h} className="px-3 py-1.5 whitespace-nowrap text-text-primary">
                              {r[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                </table>
              </div>
            </div>
          )}
          {entity === 'engineers' && (
            <p className="text-caption text-text-muted bg-surface-elevated px-3 py-2 rounded-md">
              Engineer records only. To grant login access, invite each engineer separately from{' '}
              <Link to="/dashboard/settings/users" className="text-brand-500 hover:underline">
                Settings → Users
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {/* STEP 3 — map columns ──────────────────────────────────────────── */}
      {step === 2 && entity && schema && csv && (
        <div className={`${cardClass} p-6 space-y-4`}>
          <h2 className="text-[15px] font-semibold text-text-primary">Map your columns</h2>
          <MappingTable
            schema={schema}
            csvHeaders={csv.headers}
            mapping={mapping}
            suggested={suggested}
            onChange={setMapping}
          />
        </div>
      )}

      {/* STEP 4 — preview + import ─────────────────────────────────────── */}
      {step === 3 && entity && schema && csv && (
        <div className={`${cardClass} p-6 space-y-4`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">Preview</h2>
              <Text scale="caption" tone="muted">
                Review formatted rows. Errors are highlighted; duplicates are flagged.
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <Chip size="sm" variant="soft" color="success">{validCount} valid</Chip>
              {dupCount > 0 && (
                <Chip size="sm" variant="soft" color="warning">{dupCount} duplicate</Chip>
              )}
              {errCount > 0 && (
                <Chip size="sm" variant="soft" color="danger">{errCount} with errors</Chip>
              )}
            </div>
          </div>
          <PreviewTable schema={schema} validated={validated} />
          {blocking && (
            <p className="text-caption text-status-overdue">
              Fix or remove the rows above before importing. Either fix the source CSV and re-upload, or go back and remap columns.
            </p>
          )}
        </div>
      )}

      {/* STEP 5 — result ───────────────────────────────────────────────── */}
      {step === 4 && result && entity && schema && (
        <div className={`${cardClass} p-8 space-y-5 text-center`}>
          <div className="inline-flex w-12 h-12 mx-auto rounded-full bg-status-compliant/15 items-center justify-center">
            <CheckCircle2 size={24} className="text-status-compliant" />
          </div>
          <h2 className="text-[18px] font-semibold text-text-primary">
            Imported {result.inserted.toLocaleString()} {schema.label.toLowerCase()}
          </h2>
          <p className="text-label text-text-muted">
            {result.skipped > 0 && `${result.skipped} skipped`}
            {result.skipped > 0 && result.errors.length > 0 && ' · '}
            {result.errors.length > 0 && `${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`}
            {result.skipped === 0 && result.errors.length === 0 && 'No issues.'}
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button asChild variant="primary">
              <Link to={schema.viewPath}>
                View imported {schema.label.toLowerCase()}
              </Link>
            </Button>
            {result.errors.length > 0 && (
              <Button variant="outline" onPress={handleDownloadErrorsCsv}>
                <Download size={14} />
                Download errors CSV
              </Button>
            )}
            <Button variant="ghost" onPress={handleStartOver}>
              Start another import
            </Button>
          </div>
          {result.errors.length > 0 && (
            <div className="text-left bg-surface-elevated rounded-lg p-4 max-h-64 overflow-y-auto">
              <Text scale="caption" tone="muted" weight="medium" className="mb-2">First 10 issues:</Text>
              <ul className="space-y-1 text-caption">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i} className="text-status-overdue">
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Nav buttons ───────────────────────────────────────────────────── */}
      {step < 4 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            isDisabled={step === 0}
            onPress={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ArrowLeft size={14} />
            Back
          </Button>
          {step === 3 ? (
            <Button
              variant="primary"
              isDisabled={blocking || validCount === 0 || importing}
              onPress={handleRunImport}
            >
              {importing ? <Spinner size="sm" /> : null}
              Import {validCount.toLocaleString()} valid row{validCount === 1 ? '' : 's'}
            </Button>
          ) : (
            <Button
              variant="primary"
              isDisabled={
                (step === 0 && !entity) ||
                (step === 1 && !csv) ||
                (step === 2 && !requiredCovered)
              }
              onPress={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            >
              Next
              <ArrowRight size={14} />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

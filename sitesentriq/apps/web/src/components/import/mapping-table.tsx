import { useMemo, useState } from 'react'
import { Button } from '@haumea/ui'
import { FormSelect } from '@haumea/ui'
import { RotateCcw, Check } from 'lucide-react'
import type { EntitySchema } from '@/lib/import/schemas'

interface MappingTableProps {
  schema: EntitySchema
  csvHeaders: string[]
  /** csv header → field key (or null) */
  mapping: Record<string, string | null>
  onChange: (mapping: Record<string, string | null>) => void
  /** Suggested mapping — used by "Reset to suggested". */
  suggested: Record<string, string | null>
}

const inputClass =
  'bg-surface-page border border-border-default rounded-md text-label px-2 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-accent/20'

export function MappingTable({
  schema,
  csvHeaders,
  mapping,
  onChange,
  suggested,
}: MappingTableProps) {
  const [search, setSearch] = useState('')

  const fieldOptions = useMemo(() => {
    return schema.fields.map((f) => ({
      key: f.key,
      label: `${f.label}${f.required ? ' *' : ''}`,
      required: f.required,
    }))
  }, [schema])

  const claimedKeys = useMemo(() => {
    const set = new Set<string>()
    for (const v of Object.values(mapping)) if (v) set.add(v)
    return set
  }, [mapping])

  const visibleHeaders = useMemo(() => {
    if (!search.trim()) return csvHeaders
    const q = search.toLowerCase()
    return csvHeaders.filter((h) => h.toLowerCase().includes(q))
  }, [csvHeaders, search])

  const requiredCovered = useMemo(() => {
    return schema.fields
      .filter((f) => f.required)
      .every((f) => claimedKeys.has(f.key))
  }, [schema.fields, claimedKeys])

  const setHeader = (header: string, fieldKey: string | null) => {
    const next = { ...mapping }
    if (fieldKey) {
      for (const h of Object.keys(next)) {
        if (next[h] === fieldKey && h !== header) next[h] = null
      }
    }
    next[header] = fieldKey
    onChange(next)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search CSV columns..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} max-w-xs`}
        />
        <div className="flex items-center gap-2">
          {requiredCovered ? (
            <span className="flex items-center gap-1 text-caption text-status-compliant">
              <Check size={14} /> All required fields mapped
            </span>
          ) : (
            <span className="text-caption text-status-overdue">
              Required fields missing
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onPress={() => onChange({ ...suggested })}
          >
            <RotateCcw size={14} />
            Reset to suggested
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border-default overflow-hidden">
        <table aria-label="CSV column mapping" className="w-full text-label">
            <thead><tr>
              <th className="text-left px-4 py-2 font-medium text-text-muted">Your CSV column</th>
              <th className="text-left px-4 py-2 font-medium text-text-muted">Maps to</th>
            </tr></thead>
            <tbody>
              {visibleHeaders.map((header) => {
                const current = mapping[header] ?? ''
                return (
                  <tr key={header} id={header} className="border-t border-border-default">
                    <td className="px-4 py-2 text-text-primary">{header}</td>
                    <td className="px-4 py-2">
                      <FormSelect
                        value={current}
                        onChange={(v) => setHeader(header, v || null)}
                        ariaLabel={`Map ${header}`}
                        placeholder="— Don't import —"
                        clearable
                        options={fieldOptions
                          .filter((f) => !(claimedKeys.has(f.key) && f.key !== current))
                          .map((f) => ({ value: f.key, label: f.label }))}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border-default p-4 bg-surface-elevated">
        <p className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-2">
          Required fields
        </p>
        <ul className="space-y-1 text-caption">
          {schema.fields
            .filter((f) => f.required)
            .map((f) => {
              const ok = claimedKeys.has(f.key)
              return (
                <li key={f.key} className="flex items-center gap-2">
                  <span
                    className={[
                      'w-1.5 h-1.5 rounded-full',
                      ok ? 'bg-status-compliant' : 'bg-status-overdue',
                    ].join(' ')}
                  />
                  <span className={ok ? 'text-text-primary' : 'text-status-overdue'}>
                    {f.label}
                  </span>
                  {f.helperText && <span className="text-text-muted"> — {f.helperText}</span>}
                </li>
              )
            })}
        </ul>
      </div>
    </div>
  )
}

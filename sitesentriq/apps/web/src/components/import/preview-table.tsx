import { Chip } from '@haumea/ui'
import type { EntitySchema } from '@/lib/import/schemas'
import type { ValidatedRow } from '@/lib/import/run'

interface PreviewTableProps {
  schema: EntitySchema
  validated: ValidatedRow[]
  /** Limit visible rows; default 10. */
  limit?: number
}

function formatValue(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

export function PreviewTable({ schema, validated, limit = 10 }: PreviewTableProps) {
  const visible = validated.slice(0, limit)
  const cols = schema.fields

  return (
    <div className="rounded-lg border border-border-default overflow-x-auto">
      <table aria-label="Import preview" className="w-full text-caption">
          <thead><tr>
            <th className="text-left px-3 py-2 font-medium text-text-muted">#</th>
            {cols.map((c) => (
              <th key={c.key} id={c.key} className="text-left px-3 py-2 font-medium whitespace-nowrap text-text-muted">
                {c.label}
                {c.required && <span className="text-status-overdue"> *</span>}
              </th>
            ))}
            <th className="text-left px-3 py-2 font-medium text-text-muted">Status</th>
          </tr></thead>
          <tbody>
            {visible.map((r) => {
              const hasErrors = r.errors.length > 0
              return (
                <tr
                  key={r.rowNumber}
                  id={String(r.rowNumber)}
                  className={[
                    'border-t border-border-default',
                    hasErrors ? 'bg-status-overdue/5' : r.isDuplicate ? 'bg-status-due-soon/5' : '',
                  ].join(' ')}
                >
                  <td className="px-3 py-2 text-text-muted">{r.rowNumber}</td>
                  {cols.map((c) => {
                    const fieldErr = r.errors.find((e) => e.field === c.key)
                    return (
                      <td
                        key={c.key}
                        id={c.key}
                        className={[
                          'px-3 py-2 whitespace-nowrap',
                          fieldErr ? 'text-status-overdue' : 'text-text-primary',
                        ].join(' ')}
                      >
                        {formatValue(r.mapped[c.key])}
                        {fieldErr && (
                          <div className="text-micro text-status-overdue mt-0.5">
                            {fieldErr.message}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2">
                    {hasErrors ? (
                      <Chip size="sm" variant="soft" color="danger">
                        {r.errors.length} error{r.errors.length === 1 ? '' : 's'}
                      </Chip>
                    ) : r.isDuplicate ? (
                      <Chip size="sm" variant="soft" color="warning">
                        Duplicate
                      </Chip>
                    ) : (
                      <Chip size="sm" variant="soft" color="success">
                        OK
                      </Chip>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
      </table>
      {validated.length > limit && (
        <p className="px-3 py-2 text-caption text-text-muted bg-surface-elevated border-t border-border-default">
          Showing first {limit} of {validated.length} rows.
        </p>
      )}
    </div>
  )
}

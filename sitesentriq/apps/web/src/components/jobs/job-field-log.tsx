import { AppCard } from '@haumea/ui'
import { StickyNote, Package } from 'lucide-react'
import { formatCurrency } from '@haumea/utils'
import { useJobNotes, useJobParts } from '@/hooks/use-job-field-log'

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Read-only "field log" surfaced on the web job detail: the notes + parts the
 * engineer captured in the mobile app, so office staff can see/cost the visit.
 */
export function JobFieldLog({ jobId }: { jobId: string }) {
  const { data: notes, isLoading: notesLoading } = useJobNotes(jobId)
  const { data: parts, isLoading: partsLoading } = useJobParts(jobId)

  const hasNotes = (notes?.length ?? 0) > 0
  const hasParts = (parts?.length ?? 0) > 0
  const partsSubtotal = (parts ?? []).reduce(
    (sum, p) => sum + (p.quantity || 0) * (p.unit_cost || 0),
    0,
  )

  // Hide the whole block while loading or when the engineer logged nothing —
  // it's purely a mirror of mobile field work.
  if (notesLoading || partsLoading) return null
  if (!hasNotes && !hasParts) return null

  return (
    <div className="space-y-6">
      {hasNotes && (
        <AppCard>
          <div className="flex items-center gap-2 mb-3">
            <StickyNote size={16} className="text-text-muted" />
            <h3 className="text-label font-semibold text-text-primary">Engineer notes</h3>
            <span className="text-micro text-text-muted">({notes!.length})</span>
          </div>
          <ul className="space-y-3">
            {notes!.map((n) => (
              <li key={n.id} className="border-l-2 border-border-default pl-3">
                <p className="text-label text-text-secondary whitespace-pre-wrap">{n.content}</p>
                <p className="text-micro text-text-muted mt-1">
                  {n.user_name || 'Engineer'} · {formatWhen(n.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </AppCard>
      )}

      {hasParts && (
        <AppCard>
          <div className="flex items-center gap-2 mb-3">
            <Package size={16} className="text-text-muted" />
            <h3 className="text-label font-semibold text-text-primary">Parts &amp; materials</h3>
            <span className="text-micro text-text-muted">({parts!.length})</span>
          </div>
          <table aria-label="Parts and materials" className="w-full">
            <thead>
              <tr>
                <th className="text-left py-2 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Description</th>
                <th className="text-right py-2 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Qty</th>
                <th className="text-right py-2 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Unit cost</th>
                <th className="text-right py-2 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Line total</th>
              </tr>
            </thead>
            <tbody>
              {parts!.map((p) => (
                <tr key={p.id} className="border-t border-border-subtle">
                  <td className="py-2 text-label text-text-secondary">{p.description}</td>
                  <td className="py-2 text-label text-text-secondary text-right">{p.quantity}</td>
                  <td className="py-2 text-label text-text-secondary text-right">
                    {p.unit_cost == null ? '—' : formatCurrency(p.unit_cost)}
                  </td>
                  <td className="py-2 text-label text-text-secondary text-right">
                    {p.unit_cost == null ? '—' : formatCurrency((p.quantity || 0) * (p.unit_cost || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-default">
                <td colSpan={3} className="py-2 text-label font-medium text-text-primary text-right">Parts subtotal</td>
                <td className="py-2 text-label font-semibold text-text-primary text-right">{formatCurrency(partsSubtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </AppCard>
      )}
    </div>
  )
}

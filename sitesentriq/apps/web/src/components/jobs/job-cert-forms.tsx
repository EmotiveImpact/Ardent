import { useQuery } from '@tanstack/react-query'
import { AppCard, Chip } from '@haumea/ui'
import { ClipboardCheck } from 'lucide-react'
import { CERT_TEMPLATE_BY_KEY, type CertCompletion } from '@haumea/types'
import { formatDate } from '@haumea/utils'
import { supabase } from '@/lib/supabase'

const OUTCOME_COLOR: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  pass: 'success',
  fail: 'danger',
  remedial: 'warning',
  n_a: 'default',
}

/**
 * Completed compliance certificate forms for a job (V1 #9). Read-only — the
 * engineer captures these on the mobile app; the office reviews them here.
 */
export function JobCertForms({ jobId }: { jobId: string }) {
  const { data: certs } = useQuery({
    queryKey: ['cert-completions', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cert_completions')
        .select('*')
        .eq('job_id', jobId)
        .order('completed_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as CertCompletion[]
    },
  })

  if (!certs || certs.length === 0) return null

  return (
    <AppCard padding="md">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardCheck size={16} className="text-text-muted" />
        <h2 className="text-body font-semibold text-text-primary">Compliance Certificates</h2>
      </div>
      <div className="space-y-4">
        {certs.map((cert) => {
          const tmpl = CERT_TEMPLATE_BY_KEY[cert.cert_type]
          return (
            <div key={cert.id} className="rounded-lg border border-border-default p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-label font-semibold text-text-primary">{tmpl?.label ?? cert.cert_type}</span>
                {cert.outcome && (
                  <Chip variant="soft" color={OUTCOME_COLOR[cert.outcome] ?? 'default'} size="sm">
                    {cert.outcome.replace(/_/g, ' ')}
                  </Chip>
                )}
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {(tmpl?.fields ?? []).map((f) => {
                  const val = cert.answers?.[f.key]
                  if (val == null || val === '') return null
                  return (
                    <div key={f.key} className="flex items-start justify-between gap-2 text-caption">
                      <dt className="text-text-muted">{f.label}</dt>
                      <dd className="text-text-secondary font-medium text-right">{val}</dd>
                    </div>
                  )
                })}
              </dl>
              {cert.notes && <p className="mt-2 text-caption text-text-secondary whitespace-pre-wrap">{cert.notes}</p>}
              <p className="mt-2 text-micro text-text-muted">Completed {formatDate(cert.completed_at)}</p>
            </div>
          )
        })}
      </div>
    </AppCard>
  )
}

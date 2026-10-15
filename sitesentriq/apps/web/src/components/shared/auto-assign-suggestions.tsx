import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Chip, Spinner } from '@haumea/ui'
import { Sparkles, ChevronDown, ChevronUp, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  invokeAutoAssign,
  previewSuggest,
  DEFAULT_WEIGHTS,
  type ScoredCandidate,
  type AutoAssignRule,
} from '@/lib/auto-assign'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

const WEIGHT_LABELS: Record<keyof typeof DEFAULT_WEIGHTS, string> = {
  skill: 'Skill',
  location: 'Location',
  availability: 'Availability',
  workload: 'Workload',
  familiarity: 'Familiarity',
  parts: 'Van stock',
}

interface CandidateSeed {
  property_id?: string | null
  category?: string | null
  scheduled_date?: string | null
  time_start?: string | null
  time_end?: string | null
}

interface Props {
  jobId: string | null
  mode: 'suggest' | 'apply'
  candidate?: CandidateSeed
  rule?: AutoAssignRule
  onApplied?: (engineerId: string) => void
  onSelect?: (engineerId: string) => void
}

function ScoreBars({ candidate }: { candidate: ScoredCandidate }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
      {(Object.keys(WEIGHT_LABELS) as (keyof typeof WEIGHT_LABELS)[]).map((k) => {
        const v = Math.round(candidate.breakdown[k] ?? 0)
        return (
          <div key={k}>
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.04em] text-text-muted mb-1">
              <span>{WEIGHT_LABELS[k]}</span>
              <span className="font-medium text-text-secondary">{v}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-page overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-brand-500"
                initial={{ width: 0 }}
                animate={{ width: `${v}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function AutoAssignSuggestions({
  jobId,
  mode,
  candidate,
  rule,
  onApplied,
  onSelect,
}: Props) {
  const { organisation } = useAuth()
  const queryClient = useQueryClient()
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const queryKey = useMemo(
    () => ['auto-assign', jobId ?? 'preview', candidate ?? null, rule ?? null],
    [jobId, candidate, rule],
  )

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    enabled: !!(jobId || (candidate && organisation?.id)),
    queryFn: async (): Promise<ScoredCandidate[]> => {
      if (jobId) {
        const result = await invokeAutoAssign(jobId, 'suggest')
        return result.candidates
      }
      if (!organisation?.id) return []
      return previewSuggest(organisation.id, candidate ?? {}, rule)
    },
  })

  // Assign the SPECIFIC engineer the user clicked. Previously every row's button
  // called invokeAutoAssign(...,'apply') which always assigns the #1-ranked
  // engineer server-side — so picking the 2nd/3rd candidate wrongly assigned the
  // top one. A direct engineer_assignments insert honours the row's choice.
  const assignMutation = useMutation({
    mutationFn: async ({ targetJobId, engineerId }: { targetJobId: string; engineerId: string }) => {
      // `engineerId` is the engineers-table id (from the suggestion), but
      // engineer_assignments.engineer_id is a profiles.id FK — inserting the
      // engineers id was an FK violation. Resolve the linked profile first.
      const { data: eng } = await supabase
        .from('engineers')
        .select('profile_id')
        .eq('id', engineerId)
        .maybeSingle()
      const profileId = (eng as { profile_id?: string | null } | null)?.profile_id
      if (!profileId) throw new Error('This engineer has no linked user account, so they can’t be assigned.')
      const { error } = await supabase
        .from('engineer_assignments')
        .insert({ job_id: targetJobId, engineer_id: profileId })
      if (error) throw error
      return engineerId
    },
    onSuccess: (engineerId) => {
      toast.success('Engineer assigned')
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      onApplied?.(engineerId)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to assign engineer')
    },
  })

  if (isLoading) {
    return (
      <Card className="!gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default !p-5 space-y-3">
        <div className="flex items-center gap-2 text-text-secondary">
          <Sparkles size={14} className="text-brand-500" />
          <span className="text-label font-medium">Calculating suggestions…</span>
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-surface-page animate-pulse" />
        ))}
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="!gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default !p-5">
        <p className="text-label text-status-overdue">
          Auto-assign failed: {(error as Error).message}
        </p>
        <Button variant="secondary" size="sm" onPress={() => refetch()} className="mt-3">
          Retry
        </Button>
      </Card>
    )
  }

  const candidates = data ?? []

  if (candidates.length === 0) {
    return (
      <Card className="!gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default !p-6 text-center">
        <Sparkles size={20} className="mx-auto mb-2 text-text-muted" />
        <p className="text-label font-medium text-text-primary">No good matches</p>
        <p className="text-caption text-text-muted mt-1">
          Current rules eliminated all candidates.
        </p>
        <Link
          to="/dashboard/auto-assign"
          className="inline-block mt-3 text-caption font-medium text-brand-500 hover:underline"
        >
          Adjust rules →
        </Link>
      </Card>
    )
  }

  return (
    <Card className="!p-0 !gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-brand-500" />
          <h3 className="text-body font-semibold text-text-primary">
            Auto-assign suggestions
          </h3>
        </div>
        <Chip variant="soft" color="default" size="sm">
          Top {candidates.length}
        </Chip>
      </div>
      <ul className="divide-y divide-border-subtle">
        {candidates.map((c, idx) => {
          const expanded = expandedIdx === idx
          const scoreColor =
            c.score >= 70 ? 'success' : c.score >= 40 ? 'warning' : 'danger'
          return (
            <li key={c.engineer.id} className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-accent-soft text-accent-soft-foreground flex items-center justify-center text-label font-semibold flex-shrink-0">
                    {c.engineer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-label font-medium text-text-primary truncate">
                      {c.engineer.name}
                    </p>
                    <p className="text-micro text-text-muted truncate">
                      {c.engineer.accreditations.join(' · ') || 'No accreditations'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Chip variant="soft" color={scoreColor} size="sm">
                    {c.score}
                  </Chip>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => setExpandedIdx(expanded ? null : idx)}
                    aria-label={expanded ? 'Hide breakdown' : 'Show breakdown'}
                  >
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    Why?
                  </Button>
                  {mode === 'apply' && jobId ? (
                    <Button
                      variant="primary"
                      size="sm"
                      isDisabled={assignMutation.isPending}
                      onPress={() => assignMutation.mutate({ targetJobId: jobId, engineerId: c.engineer.id })}
                    >
                      {assignMutation.isPending ? (
                        <Spinner size="sm" />
                      ) : (
                        <>
                          <UserCheck size={14} />
                          Assign
                        </>
                      )}
                    </Button>
                  ) : null}
                  {mode === 'suggest' && onSelect ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onPress={() => onSelect(c.engineer.id)}
                    >
                      Pick
                    </Button>
                  ) : null}
                </div>
              </div>
              {expanded && (
                <div className="mt-3 space-y-3">
                  <ScoreBars candidate={c} />
                  <ul className="text-caption text-text-secondary space-y-0.5 list-disc pl-5">
                    {c.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export default AutoAssignSuggestions

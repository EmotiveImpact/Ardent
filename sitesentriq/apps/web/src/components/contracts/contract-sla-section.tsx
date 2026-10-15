// Contract SLA section (00117, W2-T6): per-priority response/fix targets +
// credit-per-breach editor, and the period summary with service-credit maths.
// Targets stamp onto NEW jobs at creation; editing here never rewrites
// history (stamped targets are immutable evidence).

import { useState } from 'react'
import { AppCard, Button, Chip, Heading } from '@haumea/ui'
import { Timer } from 'lucide-react'
import {
  useContractSlaPolicies,
  useSaveContractSlaPolicy,
  useDeleteContractSlaPolicy,
  useSlaSummary,
} from '@/hooks/use-sla'
import type { ContractSlaPolicy } from '@haumea/types'

const PRIORITIES: ContractSlaPolicy['priority'][] = ['urgent', 'high', 'medium', 'low']

const inputClass =
  'w-24 px-2 py-1.5 border border-border-default rounded-lg text-label text-text-secondary bg-surface-card focus:outline-none focus:ring-2 focus:ring-border-default'

function quarterRange(): { from: string; to: string } {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const from = new Date(now.getFullYear(), q * 3, 1)
  const to = new Date(now.getFullYear(), q * 3 + 3, 0)
  return { from: from.toLocaleDateString('en-CA'), to: to.toLocaleDateString('en-CA') }
}

export function ContractSlaSection({ contractId }: { contractId: string }) {
  const { data: policies = [] } = useContractSlaPolicies(contractId)
  const savePolicy = useSaveContractSlaPolicy()
  const deletePolicy = useDeleteContractSlaPolicy()

  const [{ from, to }, setRange] = useState(quarterRange)
  const { data: summary, isLoading: summaryLoading } = useSlaSummary(contractId, from, to)

  // Draft edits keyed by priority; absent = use the saved policy values.
  const [drafts, setDrafts] = useState<
    Record<string, { response: string; fix: string; credit: string }>
  >({})

  const draftFor = (priority: string) => {
    const saved = policies.find((p) => p.priority === priority)
    return (
      drafts[priority] ?? {
        response: saved ? String(saved.response_minutes) : '',
        fix: saved ? String(saved.fix_minutes) : '',
        credit: saved ? String(saved.credit_per_breach) : '0',
      }
    )
  }

  const setDraft = (priority: string, field: 'response' | 'fix' | 'credit', value: string) =>
    setDrafts((prev) => ({ ...prev, [priority]: { ...draftFor(priority), [field]: value } }))

  const save = (priority: ContractSlaPolicy['priority']) => {
    const d = draftFor(priority)
    const response = parseInt(d.response, 10)
    const fix = parseInt(d.fix, 10)
    const credit = parseFloat(d.credit || '0')
    if (!Number.isFinite(response) || response <= 0 || !Number.isFinite(fix) || fix <= 0) return
    savePolicy.mutate({
      contract_id: contractId,
      priority,
      response_minutes: response,
      fix_minutes: fix,
      credit_per_breach: Number.isFinite(credit) ? credit : 0,
    })
  }

  return (
    <AppCard padding="md">
      <div className="mb-4 flex items-center gap-2">
        <Timer size={16} className="text-brand-600" aria-hidden />
        <Heading level={2} scale="body">Service levels (SLA)</Heading>
      </div>

      {/* Policy editor */}
      <div className="overflow-x-auto">
        <table aria-label="SLA policies" className="w-full">
          <thead>
            <tr>
              <th className="py-2 pr-4 text-left text-micro font-medium uppercase tracking-[0.04em] text-text-muted">Priority</th>
              <th className="py-2 pr-4 text-left text-micro font-medium uppercase tracking-[0.04em] text-text-muted">Respond (min)</th>
              <th className="py-2 pr-4 text-left text-micro font-medium uppercase tracking-[0.04em] text-text-muted">Fix (min)</th>
              <th className="py-2 pr-4 text-left text-micro font-medium uppercase tracking-[0.04em] text-text-muted">Credit / breach (£)</th>
              <th className="py-2 text-left text-micro font-medium uppercase tracking-[0.04em] text-text-muted" />
            </tr>
          </thead>
          <tbody>
            {PRIORITIES.map((priority) => {
              const saved = policies.find((p) => p.priority === priority)
              const d = draftFor(priority)
              return (
                <tr key={priority} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 pr-4">
                    <Chip variant="soft" size="sm" className="capitalize">{priority}</Chip>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={1}
                      value={d.response}
                      onChange={(e) => setDraft(priority, 'response', e.target.value)}
                      className={inputClass}
                      aria-label={`${priority} response minutes`}
                      placeholder="—"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={1}
                      value={d.fix}
                      onChange={(e) => setDraft(priority, 'fix', e.target.value)}
                      className={inputClass}
                      aria-label={`${priority} fix minutes`}
                      placeholder="—"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={d.credit}
                      onChange={(e) => setDraft(priority, 'credit', e.target.value)}
                      className={inputClass}
                      aria-label={`${priority} credit per breach`}
                    />
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        isDisabled={savePolicy.isPending || !d.response || !d.fix}
                        onPress={() => save(priority)}
                      >
                        {saved ? 'Update' : 'Set'}
                      </Button>
                      {saved && (
                        <Button
                          variant="ghost"
                          size="sm"
                          isDisabled={deletePolicy.isPending}
                          onPress={() => deletePolicy.mutate(saved.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-caption text-text-muted">
        Targets are stamped onto jobs when they are created — changing a policy never rewrites
        existing jobs.
      </p>

      {/* Period summary */}
      <div className="mt-5 border-t border-border-subtle pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Heading level={3} scale="caption">Period performance</Heading>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="px-2 py-1 border border-border-default rounded-lg text-caption text-text-secondary bg-surface-card"
              aria-label="Period from"
            />
            <span className="text-caption text-text-muted">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="px-2 py-1 border border-border-default rounded-lg text-caption text-text-secondary bg-surface-card"
              aria-label="Period to"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {summaryLoading && !summary ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="h-7 w-12 animate-pulse rounded bg-surface-page" />
                <div className="mt-1 h-3 w-20 animate-pulse rounded bg-surface-page" />
              </div>
            ))
          ) : (
          <>
          <div>
            <p className="text-headline font-semibold text-text-primary">{summary?.jobs_total ?? 0}</p>
            <p className="text-caption text-text-muted">SLA jobs in period</p>
          </div>
          <div>
            <p className="text-headline font-semibold text-text-primary">{summary?.response_breaches ?? 0}</p>
            <p className="text-caption text-text-muted">Response breaches</p>
          </div>
          <div>
            <p className="text-headline font-semibold text-text-primary">{summary?.fix_breaches ?? 0}</p>
            <p className="text-caption text-text-muted">Fix breaches</p>
          </div>
          <div>
            <p className={`text-headline font-semibold ${(summary?.credits ?? 0) > 0 ? 'text-status-overdue' : 'text-text-primary'}`}>
              £{Number(summary?.credits ?? 0).toFixed(2)}
            </p>
            <p className="text-caption text-text-muted">Service credits accrued</p>
          </div>
          </>
          )}
        </div>
      </div>
    </AppCard>
  )
}

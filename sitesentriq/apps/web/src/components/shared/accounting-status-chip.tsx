// Status chip for invoice <-> accounting provider sync state.
// Shown next to invoice number on detail page and as a column on the list.

import { Chip } from '@haumea/ui'
import { CheckCircle, AlertTriangle, XCircle, Circle, Loader2 } from 'lucide-react'
import type { AccountingProvider, AccountingStatus } from '@/lib/integrations/accounting/types'

export interface AccountingStatusChipProps {
  status: AccountingStatus | null | undefined
  provider?: AccountingProvider | null
  size?: 'sm' | 'md'
  /** Shown as a native tooltip on the error chip so the failure reason is
   *  visible without opening the detail page. */
  errorMessage?: string | null
}

const PROVIDER_LABEL: Record<AccountingProvider, string> = {
  xero: 'Xero',
  quickbooks: 'QuickBooks',
}

export function AccountingStatusChip({ status, provider, size = 'sm', errorMessage }: AccountingStatusChipProps) {
  const effectiveStatus: AccountingStatus = status ?? 'none'

  if (effectiveStatus === 'none') {
    return (
      <Chip variant="soft" color="default" size={size}>
        <span className="inline-flex items-center gap-1">
          <Circle size={11} aria-hidden />
          Not synced
        </span>
      </Chip>
    )
  }

  if (effectiveStatus === 'pushing') {
    const label = provider ? `Pushing to ${PROVIDER_LABEL[provider]}…` : 'Pushing…'
    return (
      <Chip variant="soft" color="warning" size={size}>
        <span className="inline-flex items-center gap-1">
          <Loader2 size={11} aria-hidden className="animate-spin" />
          {label}
        </span>
      </Chip>
    )
  }

  if (effectiveStatus === 'pushed') {
    const label = provider ? `Pushed to ${PROVIDER_LABEL[provider]}` : 'Pushed'
    return (
      <Chip variant="soft" color="success" size={size}>
        <span className="inline-flex items-center gap-1">
          <CheckCircle size={11} aria-hidden />
          {label}
        </span>
      </Chip>
    )
  }

  if (effectiveStatus === 'error') {
    return (
      <Chip variant="soft" color="danger" size={size}>
        <span className="inline-flex items-center gap-1" title={errorMessage ?? undefined}>
          <XCircle size={11} aria-hidden />
          Sync error
        </span>
      </Chip>
    )
  }

  // disconnected
  return (
    <Chip variant="soft" color="default" size={size}>
      <span className="inline-flex items-center gap-1">
        <AlertTriangle size={11} aria-hidden />
        Disconnected
      </span>
    </Chip>
  )
}

export default AccountingStatusChip

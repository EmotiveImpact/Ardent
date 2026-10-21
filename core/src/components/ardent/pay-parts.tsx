import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { pounds } from '@kit'
import { greyButton } from '@/components/ardent/money-lib'
import { FormDialog } from '@/components/ardent/people-parts'
import { solidButton } from '@/components/ardent/people-kit'
import { penceOf, poundsBox } from '@/components/ardent/price-parts'
import { QrCode } from '@/components/ardent/qr'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { fieldClass } from '@/components/ui/field'
import { useArdent, useQuery } from '@/data/ardent'
import type { Charge, PaymentMethod, PaymentsOverview, Refund } from '@/data/model'
import { act, problem } from '@/lib/act'
import { cn } from '@/lib/utils'

/*
 * Pieces the payment screens share: Settings, Payments, an invoice, a quote's
 * deposit, Money's payments, and the demo's Stripe stand-ins. Test mode
 * things are violet, so they never take the screen's one ember.
 */

export const methodWord: Record<PaymentMethod, string> = { bank_transfer: 'Bank transfer', cash: 'Cash', card: 'Card', tap: 'Tap to Pay', pay_by_bank: 'Pay by bank', direct_debit: 'Direct Debit' }

/** How it was paid, in the middle of a sentence: "by card", "by Direct Debit". */
export const methodPhrase = (m: PaymentMethod) => (m === 'direct_debit' || m === 'tap' ? methodWord[m] : methodWord[m].toLowerCase())

/** Paid through Stripe, so it carries Ardent's fee and can be refunded. */
export const throughStripe = (m: PaymentMethod) => m === 'card' || m === 'tap' || m === 'pay_by_bank' || m === 'direct_debit'

/** 62 -> "62p", 500 -> "£5". */
export const feeWord = (pence: number) => (pence < 100 ? `${pence}p` : pounds(pence))

/** The firm's payments, and whether the demo can stand in for Stripe here. */
export function usePayments() {
  const { mode } = useArdent()
  const q = useQuery((c) => c.payments.get())
  const account = q.data?.account
  return { ...q, account, on: account?.status === 'active', demo: mode === 'demo' && !!account?.test }
}

/** What's left to give back on a payment, after refunds done and refunds waiting. */
export const refundable = (c: Charge, refunds: Refund[]) => c.amount - c.refunded - refunds.filter((r) => r.chargeId === c.id && r.status === 'waiting').reduce((t, r) => t + r.amount, 0)

/** "Test mode": everything goes through Stripe's test mode until Ardent's own Stripe account is live. */
export function TestMark({ className }: { className?: string }) {
  return (
    <span className={cn('cap inline-flex h-7 shrink-0 items-center gap-2 rounded-full bg-violet/15 px-3 text-[11px] text-[#c9b8ff]', className)} title="Nothing real moves: payments run in Stripe's test mode until Ardent's own Stripe account is live">
      <span aria-hidden className="size-[6px] rounded-full bg-violet" />
      Test mode
    </span>
  )
}

/** A demo-only control that tells the engine what Stripe would have said. */
export function TestButton({ children, onClick, disabled, className }: { children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Test mode only: pretends Stripe said so"
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-violet/12 px-3 text-[12.5px] text-[#d6caff] outline-none transition-colors hover:bg-violet/22 focus-visible:ring-2 focus-visible:ring-violet/60 disabled:opacity-40',
        className,
      )}
    >
      <span aria-hidden className="size-[5px] rounded-full bg-violet" />
      {children}
    </button>
  )
}

/** A link the customer opens, as a full address: the demo's links are inside this page. */
export const fullUrl = (url: string) => (url.startsWith('#') ? new URL(url, window.location.href).href : url)
/** The app's own route for a demo link, "#/pay/inv_2208" -> "/pay/inv_2208". */
export const demoRoute = (url: string) => (url.startsWith('#') ? url.slice(1) : undefined)

export async function copyText(text: string, said = 'Link copied') {
  try {
    await navigator.clipboard.writeText(text)
    toast(said)
  } catch {
    toast.error("Couldn't copy it. Select the link and copy it by hand.")
  }
}

/**
 * A link for the customer: the address with Copy, a QR code to scan from the
 * screen, and in the demo the page the customer would see.
 */
export function LinkBox({ url, scanLabel = 'Scan to pay', customerLabel = 'Open as the customer', demo, className }: { url: string; scanLabel?: string; customerLabel?: string; demo?: boolean; className?: string }) {
  const [qr, setQr] = useState(false)
  const full = fullUrl(url)
  const route = demo ? demoRoute(url) : undefined
  return (
    <div className={cn('flex min-w-0 flex-col gap-2.5', className)}>
      <div className="flex h-[42px] min-w-0 items-center gap-2 rounded-[10px] bg-inset pr-1 pl-3.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted" title={full}>
          {full.replace(/^https?:\/\//, '')}
        </span>
        <button
          type="button"
          onClick={() => void copyText(full)}
          className="h-[34px] shrink-0 rounded-[8px] bg-raised px-3 text-[12.5px] text-foreground outline-none transition-colors hover:bg-[#262626] focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Copy
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={greyButton} aria-expanded={qr} onClick={() => setQr(!qr)}>
          {qr ? 'Hide the code' : scanLabel}
        </button>
        {route && (
          <Link to={route} className={greyButton}>
            {customerLabel}
          </Link>
        )}
      </div>
      {qr && (
        <div className="flex items-center gap-4 rounded-[12px] bg-inset p-3">
          <QrCode value={full} label={`${scanLabel}: ${full}`} className="w-[148px] shrink-0" />
          <p className="text-[12.5px] leading-[1.45] text-muted">Hold the screen up to the customer. Their phone camera opens the page.</p>
        </div>
      )}
    </div>
  )
}

/** Ask to give money back on a payment. It waits in Approvals for a yes. */
export function RefundDialog({ charge, overview, children }: { charge: Charge; overview: PaymentsOverview; children: ReactNode }) {
  const { client } = useArdent()
  const left = refundable(charge, overview.refunds)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const pence = amount.trim() ? penceOf(amount) : left
  const ok = pence !== undefined && pence > 0 && pence <= left && !!reason.trim()
  const reopen = (on: boolean) => {
    if (on) {
      setAmount('')
      setReason('')
      setError(undefined)
    }
    setOpen(on)
  }
  const ask = async () => {
    if (!ok) return
    setBusy(true)
    setError(undefined)
    try {
      await client.payments.refund(charge.id, pence, reason.trim())
      toast(`Refund of ${pounds(pence, { always: true })} is waiting in Approvals. Nothing goes back until someone says yes.`)
      setOpen(false)
    } catch (e) {
      setError(problem(e))
    }
    setBusy(false)
  }
  return (
    <Dialog open={open} onOpenChange={reopen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <FormDialog eyebrow={`Refund on ${charge.label}`} title="Give money back" line={`They paid ${pounds(charge.amount, { always: true })} by ${methodPhrase(charge.method)}. Up to ${pounds(left, { always: true })} can go back. It waits in Approvals for a yes before anything moves.`}>
        <div className="flex flex-col gap-2">
          <label htmlFor={`refund-amount-${charge.id}`} className="cap">
            How much, £
          </label>
          <div className="flex gap-2">
            <input id={`refund-amount-${charge.id}`} inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder={poundsBox(left)} className={cn(fieldClass, 'font-mono')} />
            <button type="button" className={cn(greyButton, 'h-[42px] shrink-0')} onClick={() => setAmount(poundsBox(left))}>
              All of it
            </button>
          </div>
          <p className="text-[12.5px] text-muted">Leave it empty to give back the full {pounds(left, { always: true })}.</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`refund-why-${charge.id}`} className="cap">
            Why
          </label>
          <textarea id={`refund-why-${charge.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Two fittings weren't replaced" className={cn(fieldClass, 'h-20 py-2.5')} />
          <p className="text-[12.5px] text-muted">Whoever says yes in Approvals sees this.</p>
        </div>
        {pence !== undefined && pence > left && <p className="text-[12.5px] text-warn">That's more than the {pounds(left, { always: true })} left on this payment.</p>}
        {error && (
          <p role="alert" className="text-[12.5px] text-danger">
            {error}
          </p>
        )}
        <button type="button" className={solidButton} disabled={!ok || busy} onClick={() => void ask()}>
          {pence !== undefined && pence > 0 && pence <= left ? `Ask to refund ${pounds(pence, { always: true })}` : 'Ask to refund'}
        </button>
      </FormDialog>
    </Dialog>
  )
}

/** Tell the engine what Stripe would have said, in the demo, with a toast. */
export function usePretend() {
  const { client } = useArdent()
  return (event: Parameters<typeof client.payments.simulate>[0], said: string) => act(client.payments.simulate(event), said)
}

/** The Settings, Payments link, for when payments aren't on yet. */
export function TurnOnLine({ children }: { children?: ReactNode }) {
  return (
    <p className="text-[12.5px] leading-[1.45] text-muted">
      {children ?? 'Customers can pay from a link on the invoice once payments are on.'}{' '}
      <Link to="/settings/payments" className="rounded-sm text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">
        Settings, Payments
      </Link>
    </p>
  )
}

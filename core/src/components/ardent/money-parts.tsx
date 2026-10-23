import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { pounds, totals } from '@kit'
import type { LineItem } from '@/data/model'
import { dotBg, greyButton, type Dot } from './money-lib'
import { pressAgain, useHold } from '@/lib/use-hold'
import { cn } from '@/lib/utils'

/*
 * The pieces the money screens (Money, a quote, an invoice, new invoice) and
 * Certs and Settings share: state marks, line tables, the big ember button.
 */

/** A state in words with its dot. */
export function StateMark({ dot, children, className }: { dot: Dot; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span aria-hidden className={cn('size-[7px] shrink-0 rounded-full', dotBg[dot])} />
      {children}
    </span>
  )
}

/** The one ember thing on a screen: a wide Michroma button. */
export function EmberButton({ children, onClick, disabled, className }: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-[52px] w-full items-center justify-center rounded-xl bg-ember px-4 font-display text-[12px] tracking-[.22em] text-[#070707] uppercase outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function GreyButton({ children, onClick, to, href, disabled, className }: { children: ReactNode; onClick?: () => void; to?: string; href?: string; disabled?: boolean; className?: string }) {
  if (to)
    return (
      <Link to={to} className={cn(greyButton, className)}>
        {children}
      </Link>
    )
  if (href)
    return (
      <a href={href} className={cn(greyButton, className)}>
        {children}
      </a>
    )
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(greyButton, className)}>
      {children}
    </button>
  )
}

/**
 * Press and hold to commit, in ember. A dark bar fills along the bottom;
 * let go early and it drains. Space and Enter hold too, and pressing twice works for anyone who can't hold.
 */
export function HoldEmber({ label, onCommit, ms = 1200 }: { label: string; onCommit: () => void; ms?: number }) {
  const { progress, armed, props } = useHold({ ms, onCommit, label })
  return (
    <button
      {...props}
      className="relative flex h-14 w-full touch-none items-center justify-center overflow-hidden rounded-[14px] bg-ember font-display text-[11px] tracking-[.22em] text-[#070707] uppercase outline-none select-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {armed ? pressAgain : label}
      <span aria-hidden className="absolute bottom-0 left-0 h-1 bg-[#070707]/45" style={{ width: `${progress * 100}%` }} />
    </button>
  )
}

const kindWord: Record<LineItem['kind'], string> = { labour: 'Labour', material: 'Material', callout: 'Callout', other: 'Other' }

/** Work line by line, then subtotal, VAT and the total, right-aligned like a printed invoice. */
export function LineTable({ lines, vatRate = 2000, totalLabel, showKind, after }: { lines: LineItem[]; vatRate?: number; totalLabel: string; showKind?: boolean; after?: ReactNode }) {
  const sums = totals({ lines, vatRate })
  const cols = showKind ? 'grid-cols-[minmax(0,1fr)_36px_88px] sm:grid-cols-[80px_minmax(0,1fr)_48px_90px_100px]' : 'grid-cols-[minmax(0,1fr)_36px_88px] sm:grid-cols-[minmax(0,1fr)_48px_100px_110px]'
  return (
    <div className="flex flex-col">
      <div className={cn('cap grid gap-3.5 py-2.5', cols)}>
        {showKind && <span className="hidden sm:block">Kind</span>}
        <span>{showKind ? 'Description' : 'Work'}</span>
        <span className="text-right">Qty</span>
        <span className="hidden text-right sm:block">Each</span>
        <span className="text-right">Total</span>
      </div>
      <div className="rows shadow-[inset_0_1px_0_var(--line)]">
        {lines.map((l) => (
          <div key={l.id} className={cn('grid items-baseline gap-3.5 py-3.5', cols)}>
            {showKind && <span className="hidden font-mono text-[11px] text-muted uppercase sm:block">{kindWord[l.kind]}</span>}
            <span className="min-w-0 text-[14px]">{l.description}</span>
            <span className="text-right font-mono text-[13px] tabular">{l.quantity}</span>
            <span className="hidden text-right font-mono text-[13px] text-muted tabular sm:block">{pounds(l.unitPrice, { always: true })}</span>
            <span className="text-right font-mono text-[13px] tabular">{pounds(Math.round(l.quantity * l.unitPrice), { always: true })}</span>
          </div>
        ))}
      </div>
      {!lines.length && <p className="py-4 text-[14px] text-muted shadow-[inset_0_1px_0_var(--line)]">No lines yet.</p>}
      <dl className="flex flex-col items-end gap-2 pt-3.5 font-mono text-[13px] text-muted uppercase shadow-[inset_0_1px_0_var(--line)]">
        <div className="flex gap-6 sm:gap-10">
          <dt>Subtotal</dt>
          <dd className="w-[110px] text-right text-foreground tabular">{pounds(sums.net, { always: true })}</dd>
        </div>
        <div className="flex gap-6 sm:gap-10">
          <dt>VAT {vatRate / 100}%</dt>
          <dd className="w-[110px] text-right text-foreground tabular">{pounds(sums.vat, { always: true })}</dd>
        </div>
        <div className="flex items-baseline gap-6 sm:gap-10">
          <dt>{totalLabel}</dt>
          <dd className="w-[140px] text-right text-[22px] text-foreground tabular">{pounds(sums.total, { always: true })}</dd>
        </div>
        {after}
      </dl>
    </div>
  )
}

/** A label and a value on one hairline row. */
export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[11px] text-[13.5px]">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 truncate text-right text-muted">{children}</span>
    </div>
  )
}

/** Skeleton while the book loads. */
export function MoneyLoading() {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="h-[360px] animate-pulse rounded-[14px] bg-surface/60 xl:col-span-2" />
      <div className="h-[360px] animate-pulse rounded-[14px] bg-surface/60" />
    </div>
  )
}

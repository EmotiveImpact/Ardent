import { useState } from 'react'
import { clock, dayDate, longDate, pounds, relative, ukDay } from '@kit'
import { Card, Initials, RowButton, SectionHead } from '@/components/ardent/parts'
import { useArdent, useQuery } from '@/data/ardent'
import type { ActionEntry, Approval, MorningBrief } from '@/data/model'
import { act } from '@/lib/act'
import { cn } from '@/lib/utils'

/*
 * The office manager's side of Core: the morning brief on Today, what Ardent
 * has drafted and waits for a yes, and the log of who did what. Ardent only
 * drafts from the records; a person says yes before anything goes.
 */

const KIND: Record<Approval['kind'], { label: string; yes: string; open: (a: Approval) => string | undefined }> = {
  send_invoice: { label: 'Invoice to send', yes: 'Yes, send it', open: (a) => a.invoiceId && `/invoices/${a.invoiceId}` },
  chase_invoice: { label: 'Reminder', yes: 'Yes, remind them', open: (a) => a.invoiceId && `/invoices/${a.invoiceId}` },
  send_quote: { label: 'Quote to send', yes: 'Yes, send it', open: (a) => a.quoteId && `/quotes/${a.quoteId}` },
  refund: { label: 'Refund', yes: 'Yes, refund it', open: (a) => a.invoiceId && `/invoices/${a.invoiceId}` },
}

/** The owner's morning brief: yesterday, what's late, what's on, what waits. */
export function MorningBriefCard() {
  const { data: brief } = useQuery((c) => c.brief.get())
  if (!brief) return <div className="h-[168px] animate-pulse rounded-[14px] bg-surface/60" />
  return (
    <Card aria-label="Morning brief" className="flex flex-col gap-5 p-[22px]">
      <SectionHead title={<>Morning brief <span className="text-faint">·</span> <span className="text-muted">{dayDate(`${brief.day}T12:00:00Z`)}</span></>} aside="Worked out from your records, nothing guessed" className="pb-0" />
      <p className="max-w-[860px] text-[19px] leading-[28px] text-pretty">{brief.headline}</p>
      <BriefNumbers brief={brief} />
      {brief.waiting > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-background/60 px-4 py-3">
          <span className="text-[14px]">
            Ardent has {brief.waiting} {brief.waiting === 1 ? 'draft' : 'drafts'} ready. Nothing goes until you say yes.
          </span>
          <RowButton to="/approvals">Look at {brief.waiting === 1 ? 'it' : 'them'}</RowButton>
        </div>
      )}
    </Card>
  )
}

function BriefNumbers({ brief }: { brief: MorningBrief }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-5">
      {brief.numbers.map((n) => (
        <div key={n.key} className="flex flex-col gap-1.5">
          <dt className="cap text-[11px] text-muted">{n.label}</dt>
          <dd className={cn('font-mono text-[20px] tabular', n.key === 'overdue' && n.value > 0 && 'text-warn')}>
            {n.money ? pounds(n.value) : n.value}
            {n.note && <span className="ml-2 text-[12px] text-muted">{n.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Ardent's drafts, each with the message as the customer would read it. */
export function WaitingForYes() {
  const { data } = useQuery((c) => c.approvals.list())
  if (!data) return <div className="h-40 animate-pulse rounded-[14px] bg-surface/60" />
  if (!data.length) return <Card className="py-12 text-center text-[14px] text-muted">Nothing waiting. Ardent drafts the next one when a job finishes or an invoice runs late.</Card>
  return (
    <ol className="flex flex-col gap-3">
      {data.map((a) => (
        <ApprovalCard key={a.id} a={a} />
      ))}
    </ol>
  )
}

function ApprovalCard({ a }: { a: Approval }) {
  const { client } = useArdent()
  const [busy, setBusy] = useState(false)
  const [saying, setSaying] = useState<string>()
  const k = KIND[a.kind]
  const go = async (work: Promise<unknown>, done: string) => {
    setBusy(true)
    await act(work, done)
    setBusy(false)
  }
  const open = k.open(a)
  return (
    <li>
      <Card className="flex flex-col gap-4 p-[22px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="cap text-[11px] text-muted">{k.label}</span>
            <h3 className="text-[17px]">{a.title}</h3>
            <p className="text-[13px] leading-[19px] text-muted">{a.why}</p>
          </div>
          <span className="font-mono text-[11px] text-faint">Drafted {relative(a.createdAt)}</span>
        </div>
        <figure className="rounded-[12px] bg-background/60 px-4 py-3.5">
          <figcaption className="cap pb-2 text-[11px] text-faint">What they'd get</figcaption>
          <blockquote className="text-[14px] leading-[21px] text-pretty">{a.preview}</blockquote>
        </figure>
        {saying !== undefined ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void go(client.approvals.reject(a.id, saying), 'Said no')
            }}
          >
            <label className="sr-only" htmlFor={`why-${a.id}`}>Why not (optional)</label>
            <input
              id={`why-${a.id}`}
              autoFocus
              value={saying}
              onChange={(e) => setSaying(e.target.value)}
              placeholder="Why not, so Ardent learns (optional)"
              className="h-10 min-w-0 flex-1 rounded-lg bg-background px-3 text-[14px] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring/60"
            />
            <button type="submit" disabled={busy} className="h-10 rounded-lg bg-raised px-4 text-[13px] outline-none hover:bg-[#262626] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50">
              Say no
            </button>
            <button type="button" onClick={() => setSaying(undefined)} className="h-10 rounded-lg px-3 text-[13px] text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
              Back
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void go(client.approvals.approve(a.id, a.version), a.kind === 'chase_invoice' ? 'Reminder logged' : 'Marked as sent')}
              className="inline-flex h-10 items-center rounded-lg bg-foreground px-4 text-[13px] font-medium text-background outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            >
              {k.yes}
            </button>
            <RowButton onClick={() => setSaying('')} className="h-10">Not this one</RowButton>
            {open && <RowButton to={open} className="h-10 bg-transparent text-muted hover:bg-raised">Open it first</RowButton>}
          </div>
        )}
      </Card>
    </li>
  )
}

const DECIDED: Record<Exclude<Approval['status'], 'waiting'>, { text: string; cls: string }> = {
  approved: { text: 'Yes', cls: 'text-ok' },
  rejected: { text: 'No', cls: 'text-muted' },
  stale: { text: 'Not needed', cls: 'text-faint' },
}

/** What was said yes or no to lately, and what stopped being needed. */
export function DecidedLately() {
  const { data } = useQuery((c) => c.approvals.list({ status: ['approved', 'rejected', 'stale'] }))
  const rows = (data ?? []).sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '')).slice(0, 8)
  if (!rows.length) return null
  return (
    <Card>
      <SectionHead title="Decided lately" />
      <ol className="rows">
        {rows.map((a) => {
          const d = DECIDED[a.status as keyof typeof DECIDED]
          return (
            <li key={a.id} className="flex items-center gap-4 py-3">
              <span className={cn('w-20 shrink-0 font-mono text-[11px] tracking-[.08em] uppercase', d.cls)}>{d.text}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">{a.title}</span>
                <span className="mt-1 block truncate text-[12px] text-muted">{[a.decidedBy, a.decidedAt && relative(a.decidedAt)].filter(Boolean).join(', ')}{a.note && `: "${a.note}"`}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

/** Who did what: a person by initials, Ardent by its mark. */
function By({ e }: { e: ActionEntry }) {
  if (e.by.kind === 'ardent') return <Initials className="size-8 shrink-0 rounded-[9px] bg-raised font-display text-[9px] tracking-[.14em] text-foreground">AR</Initials>
  return <Initials className="size-8 shrink-0 rounded-[9px] bg-background font-display text-[9px] tracking-[.14em]">{e.by.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</Initials>
}

/** The log, newest first, grouped by day. On a job page it shows that job only. */
export function ActivityLog({ jobId, limit = 40, title = 'What happened' }: { jobId?: string; limit?: number; title?: string }) {
  const { data } = useQuery((c) => c.log.list({ jobId, limit }), [jobId, limit])
  if (!data) return <div className="h-40 animate-pulse rounded-[14px] bg-surface/60" />
  const days = new Map<string, ActionEntry[]>()
  for (const e of data) days.set(ukDay(e.at), [...(days.get(ukDay(e.at)) ?? []), e])
  return (
    <Card aria-label="Log">
      <SectionHead title={title} aside={jobId ? 'Everything done on this job, by whom' : 'Everything done in Ardent, by whom'} />
      {!data.length && <p className="py-6 text-[14px] text-muted">Nothing logged yet. Changes show here as they happen.</p>}
      <div className="flex flex-col gap-4">
        {[...days].map(([day, rows]) => (
          <section key={day}>
            <h3 className="cap pb-1 text-[11px] text-faint">{day === ukDay(new Date().toISOString()) ? 'Today' : longDate(`${day}T12:00:00Z`)}</h3>
            <ol className="rows">
              {rows.map((e) => (
                <li key={e.id} className="flex items-center gap-3.5 py-2.5">
                  <span className="w-11 shrink-0 font-mono text-[12px] text-muted">{clock(e.at)}</span>
                  <By e={e} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] leading-[20px]">{e.summary}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">{e.by.kind === 'ardent' ? 'Ardent' : e.by.name}{e.level === 'approve' ? ', said yes' : e.level === 'draft' ? ', drafted for a yes' : ''}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </Card>
  )
}

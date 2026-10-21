import { useRef, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { pounds, type Tone } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Icon } from '@/components/layout/icons'
import { Card, PageHead, RowButton, SectionHead } from '@/components/ardent/parts'
import { selectClass } from '@/components/ui/field'
import { Tooltip } from '@/components/ui/tooltip'
import type { HqPayments } from '@/data/hq'
import { cn } from '@/lib/utils'
import { useHqQuery } from './data'
import { Chip, Dot, Failed, Loading, State } from './parts'

/*
 * Payments across every firm. Each firm has its own Stripe account and its
 * customers pay into it; Ardent takes 0.2% of each payment, up to £5, and
 * never holds a firm's money. Shows one month: what came through, by method,
 * Ardent's fee, this month's income against the £1m a month goal, each firm's
 * Stripe state and the problems open now.
 */

type PayFirm = HqPayments['firms'][number]
type Problem = HqPayments['problems'][number]
type Method = keyof HqPayments['totals']['byMethod']

export const payState: Record<PayFirm['status'], { label: string; tone: Tone }> = {
  not_started: { label: 'Not started', tone: 'faint' },
  onboarding: { label: 'Signing up', tone: 'warn' },
  needs_info: { label: 'Stripe needs details', tone: 'warn' },
  active: { label: 'Taking payments', tone: 'ok' },
  paused: { label: 'Paused by Stripe', tone: 'danger' },
}

/** Why a firm is not taking payments yet, in words. */
export const payWhy = (f: PayFirm) => f.stuck ?? (f.status === 'not_started' ? 'Has not started the Stripe sign-up' : undefined)

export const problemTone: Record<Problem['kind'], Tone> = { dispute: 'danger', dd_failed: 'warn', payouts_paused: 'danger' }

const METHODS: { key: Method; label: string; note: string }[] = [
  { key: 'card', label: 'Card', note: 'Pay links and invoices' },
  { key: 'tap', label: 'Tap to Pay', note: "On the engineer's phone" },
  { key: 'pay_by_bank', label: 'Pay by bank', note: "Straight from the customer's bank" },
  { key: 'direct_debit', label: 'Direct Debit', note: 'Service plans, each month' },
]

const LONDON = { timeZone: 'Europe/London' } as const
export const thisMonth = () => new Date().toLocaleDateString('en-CA', LONDON).slice(0, 7)
const shift = (m: string, n: number) => {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7)
}
const monthLong = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', ...LONDON })

/** A share as a percentage, with more places the smaller it is. */
const pct = (part: number, whole: number) => {
  if (!whole || !part) return '0%'
  const p = (part / whole) * 100
  if (p < 0.01) return 'under 0.01%'
  return `${p.toLocaleString('en-GB', { maximumFractionDigits: p >= 10 ? 0 : p >= 1 ? 1 : 2 })}%`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`
export const depositWord = (p: number) => (p ? `${p}% deposit` : 'No deposits')

/** Everything is in Stripe's test mode for now. */
export function TestMode({ className }: { className?: string }) {
  return (
    <Tooltip content="Every firm's Stripe account is in test mode. No real money moves yet." side="bottom">
      <span tabIndex={0} className={cn('inline-flex h-[26px] shrink-0 items-center rounded-full bg-surface px-2.5 font-mono text-[11px] tracking-[.06em] text-faint uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring/60', className)}>
        Test mode
      </span>
    </Tooltip>
  )
}

export function Payments() {
  const [params, setParams] = useSearchParams()
  const now = thisMonth()
  const asked = params.get('month') ?? ''
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) && asked <= now ? asked : now
  const pick = (m: string) => {
    const next = new URLSearchParams(params)
    if (m === now) next.delete('month')
    else next.set('month', m)
    setParams(next, { replace: true })
  }
  const { data, error, loading } = useHqQuery((hq) => hq.payments(month), [month])
  // Keep the last month up while the next one loads, so the page does not jump.
  const last = useRef<HqPayments>(undefined)
  if (data) last.current = data
  const p = data ?? last.current

  const months = Array.from({ length: 24 }, (_, i) => shift(now, -i))
  if (!months.includes(month)) months.push(month)

  return (
    <div className="flex flex-col gap-8 pb-6">
      <PageBar crumbs={[{ label: 'Payments' }]} />
      <PageHead
        title="Payments"
        eyebrow={
          <>
            <span>{monthLong(month)}</span>
            <span className="text-faint">·</span>
            <span>Every firm</span>
          </>
        }
        sub="Customers pay each firm into the firm's own Stripe account. Ardent takes 0.2% of each payment, up to £5, and never holds a firm's money."
        figures={
          p && [
            { label: 'Through Ardent', value: pounds(p.totals.volume), unit: plural(p.totals.count, 'payment') },
            { label: "Ardent's fee", value: pounds(p.totals.fee) },
            { label: 'Taking payments', value: p.firms.filter((f) => f.status === 'active').length, unit: `of ${p.firms.length} firms` },
          ]
        }
        className="pb-0"
      />

      <MonthPicker month={month} now={now} months={months} onPick={pick} />

      {error && !p && <Failed error={error} />}
      {!p && !error && <Loading />}

      {p && (
        <div className={cn('flex flex-col gap-8 transition-opacity', loading && !data && 'opacity-60')}>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Forecast p={p} current={month === now} />
            <ByMethod p={p} />
          </div>

          <Card className="p-4 sm:p-5">
            <SectionHead title={<>To act on <span className="text-faint">·</span> <span className="text-foreground">{p.problems.length}</span></>} aside="Open now, whichever month you look at" className="pb-1" />
            {p.problems.length === 0 ? <p className="py-4 text-[13px] text-muted">Nothing to act on. No open disputes, failed Direct Debits or paused payouts.</p> : <ProblemRows problems={p.problems} link />}
          </Card>

          <FirmPayments firms={p.firms} month={month} />
        </div>
      )}
    </div>
  )
}

function MonthPicker({ month, now, months, onPick }: { month: string; now: string; months: string[]; onPick: (m: string) => void }) {
  const btn = 'flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface text-foreground outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/60 disabled:bg-transparent disabled:text-faint'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn} aria-label="Month before" onClick={() => onPick(shift(month, -1))}>
        <Icon name="back" className="size-4" />
      </button>
      <select aria-label="Month" className={cn(selectClass, 'h-10 w-[190px] bg-surface hover:bg-raised')} value={month} onChange={(e) => onPick(e.target.value)}>
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLong(m)}
          </option>
        ))}
      </select>
      <button type="button" className={btn} aria-label="Month after" disabled={month >= now} onClick={() => onPick(shift(month, 1))}>
        <Icon name="forward" className="size-4" />
      </button>
      {month !== now && (
        <Chip on={false} onClick={() => onPick(now)}>
          This month
        </Chip>
      )}
      <span className="ml-auto">
        <TestMode />
      </span>
    </div>
  )
}

/** This month's income against the goal: the one ember thing on the page. */
function Forecast({ p, current }: { p: HqPayments; current: boolean }) {
  const f = p.forecast
  const share = f.goal ? Math.min(100, (f.total / f.goal) * 100) : 0
  return (
    <Card className="flex flex-col gap-5 p-5">
      <SectionHead title={current ? "Ardent's income this month, at today's pace" : `Ardent's income in ${monthLong(p.month)}`} className="pb-0" />
      <div>
        <p className="op-number text-[34px] sm:text-[44px]">{pounds(f.total)}</p>
        <p className="mt-2 font-mono text-[12px] text-muted">
          {pct(f.total, f.goal)} of the {pounds(f.goal)} a month goal · {pounds(Math.max(0, f.goal - f.total))} to go
        </p>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-raised" role="img" aria-label={`${pct(f.total, f.goal)} of the goal`}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-ember" style={{ width: `max(6px, ${share}%)` }} />
      </div>
      <dl className="mt-auto grid grid-cols-2 gap-2 rounded-[12px] bg-inset px-4 py-3.5">
        <div className="min-w-0">
          <dt className="cap text-[10px]">Payments fee</dt>
          <dd className="op-number mt-2 text-[20px]">{pounds(f.payments)}</dd>
          <dd className="mt-1.5 text-[12px] text-muted">{current ? `${pounds(p.totals.fee)} so far, 0.2% of each payment` : '0.2% of each payment, less refunds'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="cap text-[10px]">Subscriptions</dt>
          <dd className="op-number mt-2 text-[20px]">{pounds(f.subscriptions)}</dd>
          <dd className="mt-1.5 text-[12px] text-muted">Live firms' plans, a month</dd>
        </div>
      </dl>
    </Card>
  )
}

function ByMethod({ p }: { p: HqPayments }) {
  const t = p.totals
  return (
    <Card className="flex flex-col gap-1 p-5">
      <SectionHead title="Through Ardent, by how customers paid" aside="Payments · share of the money" />
      {t.count === 0 && <p className="pb-2 text-[13px] text-muted">No payments in {monthLong(p.month)}.</p>}
      <ul className="flex flex-col gap-5">
        {METHODS.map((m) => {
          const x = t.byMethod[m.key]
          const share = t.volume > 0 ? Math.max(0, (x.amount / t.volume) * 100) : 0
          return (
            <li key={m.key} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="text-[14px]">{m.label}</span>
                  <span className="ml-2 hidden text-[12px] text-muted sm:inline">{m.note}</span>
                </span>
                <span className="shrink-0 font-mono text-[12px] text-muted">
                  {x.count} · {pct(x.amount, t.volume)}
                  <span className="ml-3 text-[13.5px] text-foreground">{pounds(x.amount)}</span>
                </span>
              </div>
              <div className="relative h-[5px] w-full overflow-hidden rounded-full bg-raised" aria-hidden>
                {x.amount > 0 && <span className="absolute inset-y-0 left-0 rounded-full bg-foreground" style={{ width: `max(3px, ${share}%)` }} />}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** Disputes, failed Direct Debits and paused payouts. With `link`, each opens its firm's money. */
export function ProblemRows({ problems, link, firm = true }: { problems: Problem[]; link?: boolean; firm?: boolean }) {
  return (
    <ol className="rows">
      {problems.map((x, i) => {
        const body = (
          <>
            <Dot tone={problemTone[x.kind]} className="mt-[7px]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] leading-[20px]">{x.title}</span>
              <span className="mt-0.5 block text-[12.5px] text-muted">
                {firm && <span className="text-foreground/80">{x.firmName} · </span>}
                {x.detail}
              </span>
            </span>
            {link && <span className="hidden shrink-0 self-center text-[12.5px] text-muted sm:block">Open firm</span>}
          </>
        )
        return (
          <li key={`${x.kind}-${x.firmId}-${i}`}>
            {link ? (
              <Link to={`/firms/${x.firmId}?tab=money`} className="-mx-2 flex items-start gap-3 rounded-[10px] px-2 py-3 outline-none transition-colors hover:bg-raised focus-visible:bg-raised">
                {body}
              </Link>
            ) : (
              <div className="flex items-start gap-3 py-3">{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

const order: PayFirm['status'][] = ['paused', 'needs_info', 'onboarding', 'active', 'not_started']

function FirmPayments({ firms, month }: { firms: PayFirm[]; month: string }) {
  const navigate = useNavigate()
  const list = [...firms].sort((a, b) => b.volume - a.volume || order.indexOf(a.status) - order.indexOf(b.status))
  const open = (f: PayFirm) => navigate(`/firms/${f.firmId}?tab=money`)
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={<>Each firm <span className="text-faint">·</span> <span className="text-foreground">{firms.length}</span></>} aside={`Payments in ${monthLong(month)}`} className="pb-0" />

      {/* Wide screens: one table. */}
      <Card className="hidden p-2 lg:block">
        <table className="w-full text-left text-[13.5px]">
          <thead>
            <tr className="cap [&>th]:px-3 [&>th]:py-3 [&>th]:font-normal">
              <th>Firm</th>
              <th>Stripe</th>
              <th className="text-right">Payments</th>
              <th className="text-right">Through Ardent</th>
              <th className="text-right">Ardent's fee</th>
              <th>Deposits</th>
              <th className="text-right">Service plans</th>
            </tr>
          </thead>
          <tbody className="rows">
            {list.map((f) => {
              const why = payWhy(f)
              return (
                <tr key={f.firmId} tabIndex={0} onClick={() => open(f)} onKeyDown={(e) => e.key === 'Enter' && open(f)} className="cursor-pointer outline-none transition-colors hover:bg-raised/60 focus-visible:bg-raised/60 [&>td]:px-3 [&>td]:py-3.5">
                  <td className="rounded-l-[10px] text-[14px]">{f.firmName}</td>
                  <td className="max-w-[300px]">
                    <State tone={payState[f.status].tone}>{payState[f.status].label}</State>
                    {why && <span className="mt-0.5 block text-[12px] text-muted">{why}</span>}
                  </td>
                  <td className="text-right font-mono">{f.count}</td>
                  <td className="text-right font-mono">{pounds(f.volume)}</td>
                  <td className="text-right font-mono">{pounds(f.fee)}</td>
                  <td className="text-muted">{depositWord(f.depositPercent)}</td>
                  <td className="rounded-r-[10px] text-right font-mono">{f.plans}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* Phones and tablets: a card each. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
        {list.map((f) => {
          const why = payWhy(f)
          return (
            <button key={f.firmId} type="button" onClick={() => open(f)} className="flex flex-col gap-3 rounded-[14px] bg-surface p-4 text-left outline-none transition-colors hover:bg-[#161616] focus-visible:ring-2 focus-visible:ring-ring/60">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[15px]">{f.firmName}</span>
                  <State tone={payState[f.status].tone} className="mt-1.5 text-[12.5px]">
                    {payState[f.status].label}
                  </State>
                </span>
                <span className="shrink-0 text-right font-mono text-[13px]">
                  {pounds(f.volume)}
                  <span className="block text-[11px] text-muted">{plural(f.count, 'payment')}</span>
                </span>
              </span>
              {why && <span className="rounded-[10px] bg-inset px-3 py-2 text-[12.5px] text-muted">{why}</span>}
              <span className="grid grid-cols-3 gap-2 font-mono text-[12px] text-muted">
                <span>
                  <span className="text-foreground">{pounds(f.fee)}</span> fee
                </span>
                <span>{depositWord(f.depositPercent)}</span>
                <span>
                  <span className="text-foreground">{f.plans}</span> {f.plans === 1 ? 'plan' : 'plans'}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** One firm's payments, for its account page: its row and its problems. */
export function FirmPaymentsSection({ firmId }: { firmId: string }) {
  const { data, error } = useHqQuery((hq) => hq.payments(), [])
  if (!data) return error ? <Failed error={error} /> : <Loading className="h-40" />
  const f = data.firms.find((x) => x.firmId === firmId)
  if (!f) return null
  const problems = data.problems.filter((x) => x.firmId === firmId)
  const why = payWhy(f)
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="cap">Payments · {monthLong(data.month)}</h2>
          <State tone={payState[f.status].tone} className="mt-3 text-[14px]">
            {payState[f.status].label}
          </State>
          {why && <p className="mt-1.5 text-[13px] text-muted">{why}</p>}
        </div>
        <TestMode className="bg-raised" />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-[12px] bg-inset px-4 py-3.5 sm:grid-cols-4">
        <PayFigure label="Through Ardent" value={pounds(f.volume)} note={plural(f.count, 'payment')} />
        <PayFigure label="Ardent's fee" value={pounds(f.fee)} note="0.2% of each, up to £5" />
        <PayFigure label="Deposits" value={f.depositPercent ? `${f.depositPercent}%` : 'None'} note={f.depositPercent ? 'Asked for up front' : 'Not asking for deposits'} />
        <PayFigure label="Service plans" value={f.plans} note="On Direct Debit" />
      </dl>
      {problems.length > 0 && (
        <div>
          <p className="cap pb-1">To act on · {problems.length}</p>
          <ProblemRows problems={problems} firm={false} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <RowButton to="/payments">Every firm's payments</RowButton>
        <span className="text-[12.5px] text-muted">Customers pay into the firm's own Stripe account. Ardent never holds the money.</span>
      </div>
    </Card>
  )
}

function PayFigure({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <div className="min-w-0">
      <dt className="cap truncate text-[10px]">{label}</dt>
      <dd className="op-number mt-2 text-[20px]">{value}</dd>
      <dd className="mt-1.5 truncate text-[12px] text-muted">{note}</dd>
    </div>
  )
}

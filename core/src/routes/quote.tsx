import { Link, useParams } from 'react-router'
import { pounds, shortDate, totals } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, SectionHead } from '@/components/ardent/parts'
import { EmberButton, Fact, GreyButton, LineTable, MoneyLoading } from '@/components/ardent/money-parts'
import { capDate, quoteState } from '@/components/ardent/money-lib'
import { useArdent, useBook, type Book } from '@/data/ardent'
import type { Quote } from '@/data/model'
import { act } from '@/lib/act'
import { find, today } from '@/lib/jobs'
import { cn } from '@/lib/utils'

export function QuoteDetail() {
  const { id } = useParams()
  const { data: book } = useBook()
  const q = find(book?.quotes, id)

  if (!book)
    return (
      <div className="flex flex-col gap-10 pb-6">
        <PageBar crumbs={[{ label: 'Money', to: '/money' }, { label: 'Quote' }]} />
        <PageHead title="Quote" eyebrow=" " className="pb-0" />
        <MoneyLoading />
      </div>
    )
  if (!q)
    return (
      <div className="flex flex-col gap-10 pb-6">
        <PageBar crumbs={[{ label: 'Money', to: '/money' }, { label: 'Not found' }]} />
        <PageHead title="Quote" eyebrow="Not found" sub="There's no quote here. It may belong to another firm, or the link is wrong." />
        <div>
          <GreyButton to="/money?tab=quotes">Back to quotes</GreyButton>
        </div>
      </div>
    )
  return <QuotePage key={q.id} q={q} book={book} />
}

function QuotePage({ q, book }: { q: Quote; book: Book }) {
  const job = find(book.jobs, q.jobId)
  const c = find(book.customers, q.customerId)
  const site = find(book.sites, job?.siteId)
  const sums = totals(q)
  const st = quoteState(q, today())
  const till = capDate(`${q.validUntil}T12:00:00Z`)

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Money', to: '/money' }, { label: q.ref }]} />
      <PageHead
        title="Quote"
        eyebrow={
          <span className="font-mono text-[12px] tracking-normal uppercase">
            {q.ref}
            <span className="px-2 text-faint">·</span>
            {job ? (
              <Link to={`/jobs/${job.id}`} className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
                {job.ref}
              </Link>
            ) : (
              'No job'
            )}
            <span className="px-2 text-faint">·</span>
            <span className={cn(st.dot === 'warn' && 'text-warn')}>{st.label}</span>
          </span>
        }
        sub={
          <span className="text-muted">
            {job?.title ?? 'Work'}
            {site ? ` at ${site.line1}` : ''}
            {c ? `, for ${c.name}` : ''}.
          </span>
        }
        figures={[
          { label: 'Total', value: pounds(sums.total) },
          { label: 'Before VAT', value: pounds(sums.net) },
          { label: 'Good till', value: till, tone: st.dot === 'warn' ? 'warn' : undefined },
        ]}
        className="pb-0"
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <Card className="min-w-0 px-4 py-5 sm:px-[22px] xl:col-span-2">
          <SectionHead title="Line by line" className="pb-1.5" />
          <LineTable lines={q.lines} totalLabel="Total" showKind />
          <p className="pt-4 text-[12.5px] text-faint">Options A, B and C aren't in Ardent yet. A quote has one set of lines.</p>
          {!q.lines.length && q.status === 'draft' && (
            <p className="pt-4 text-[13px] text-muted">
              Nothing priced on this quote. Add the work on the{' '}
              <Link to={`/jobs/${q.jobId}`} className="rounded-sm text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">
                job page
              </Link>{' '}
              and write a new quote from there.
            </p>
          )}
        </Card>
        <SendCard q={q} book={book} />
      </div>
    </div>
  )
}

/** What the customer gets, and the one thing to do next. */
function SendCard({ q, book }: { q: Quote; book: Book }) {
  const { client } = useArdent()
  const job = find(book.jobs, q.jobId)
  const c = find(book.customers, q.customerId)
  const who = c?.name.split(' ')[0] ?? 'the customer'
  const name = c?.kind === 'business' || c?.kind === 'letting_agent' ? c.name.replace(/^The /, '') : who

  return (
    <Card className="flex min-w-0 flex-col gap-3.5 px-[22px] py-5">
      <span className="cap">What {name} gets</span>
      <div className="rows">
        <Fact label="To">{c?.email ? c.email : c?.phone ? `${c.phone}, no email on file` : 'No contact on file'}</Fact>
        <Fact label="Sent">{q.sentAt ? <span className="font-mono">{capDate(q.sentAt)}</span> : 'Not yet'}</Fact>
        <Fact label="Good till">
          <span className="font-mono">{capDate(`${q.validUntil}T12:00:00Z`)}</span>
        </Fact>
        <Fact label="Job">
          {job ? (
            <Link to={`/jobs/${job.id}`} className="rounded-sm font-mono outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60">
              {job.ref}
            </Link>
          ) : (
            'None'
          )}
        </Fact>
      </div>

      {q.status === 'draft' && (
        <>
          <p className="text-[13.5px] leading-[1.45] text-muted">
            Ardent doesn't email quotes yet. Send it your usual way, then mark it as sent here. If there's no answer after three days it shows up in Needs you. When they say yes, {job?.ref ?? 'the job'} moves to Booked with these lines.
          </p>
          <EmberButton disabled={!q.lines.length} onClick={() => void act(client.quotes.send(q.id, 'email'), `${q.ref} marked as sent to ${c?.name ?? 'the customer'}`)}>
            Mark as sent
          </EmberButton>
        </>
      )}

      {q.status === 'sent' && (
        <>
          <p className="text-[13.5px] leading-[1.45] text-muted">What did {who} say? A yes moves {job?.ref ?? 'the job'} to Booked with these lines.</p>
          <EmberButton onClick={() => void act(client.quotes.respond(q.id, 'accepted'), `${q.ref} accepted. ${job?.ref ?? 'The job'} is booked with the quoted price.`)}>They said yes</EmberButton>
          <GreyButton onClick={() => void act(client.quotes.respond(q.id, 'declined'), `${q.ref} marked declined`)} className="w-full">
            They said no
          </GreyButton>
        </>
      )}

      {q.status === 'accepted' && (
        <p className="text-[13.5px] leading-[1.45] text-muted">
          Accepted. {job ? <Link to={`/jobs/${job.id}`} className="rounded-sm text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60">{job.ref}</Link> : 'The job'} is booked with these lines.
        </p>
      )}
      {q.status === 'declined' && <p className="text-[13.5px] text-muted">{who} said no to this one.</p>}
      {q.status === 'expired' && <p className="text-[13.5px] text-muted">This quote ran out on {shortDate(`${q.validUntil}T12:00:00Z`)} without an answer.</p>}
    </Card>
  )
}

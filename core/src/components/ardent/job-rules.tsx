import { dayDate } from '@kit'
import type { Book } from '@/data/ardent'
import type { ComplianceCheck, Job, Trade } from '@/data/model'
import { isDone } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import { Card } from './parts'

/*
 * Rules on this job: the paperwork the trade and the work call for, worked out
 * from the job itself, each shown with where it stands. Gates come from the
 * job's own checks; reminders fall due 30 days after the booked finish, the
 * window UK schemes give for notifying and registering. These show and remind;
 * they don't stop an invoice going out.
 */

type State = 'met' | 'waiting' | 'failed' | 'later' | 'due'

interface Item {
  name: string
  state: State
  note?: string
}

interface Rule {
  when: string[]
  rows: { label: string; items: Item[] }[]
}

const tradeWords: Partial<Record<Trade, string>> = { gas: 'Gas', heating: 'Heating', electrical: 'Electrical', fire: 'Fire' }

/** One of the job's own checks, as a rule item. Left out when the job doesn't carry that check. */
function fromCheck(job: Job, key: ComplianceCheck['key'], name: string): Item | undefined {
  const c = job.checks.find((x) => x.key === key)
  if (!c || c.state === 'n/a') return undefined
  return { name, state: c.state === 'pass' ? 'met' : c.state === 'fail' ? 'failed' : 'waiting', note: c.detail }
}

/** Something to do within 30 days of the work, due once the job is done. */
function within30(job: Job, name: string): Item {
  const by = new Date(Date.parse(job.end) + 30 * 86_400_000).toISOString()
  return isDone(job) ? { name, state: 'due', note: `By ${dayDate(by).replace(',', '')}` } : { name, state: 'later', note: 'Once the job is done' }
}

const some = (xs: (Item | undefined)[]) => xs.filter((x): x is Item => !!x)

export function jobRules(job: Job, book: Book): Rule[] {
  const rules: Rule[] = []
  const t = job.title.toLowerCase()
  const certFor = (kind: string) => book.certificates.find((c) => c.jobId === job.id && c.kind === kind)

  if (job.trade === 'gas' || job.trade === 'heating') {
    rules.push({
      when: ['Trade', 'is', tradeWords[job.trade]!],
      rows: [
        { label: 'Require', items: some([fromCheck(job, 'registration', 'Gas Safe number'), fromCheck(job, 'rams', 'RAMS signed')]) },
        { label: 'Before the invoice', items: some([fromCheck(job, 'gas_tightness', 'Tightness test passed')]) },
      ],
    })
    if (/boiler|combi/.test(t) && /swap|install|fit|replace|new/.test(t)) {
      rules.push({
        when: ['Work', 'is', 'Boiler install'],
        rows: [{ label: 'Remind', items: [within30(job, 'Notify Building Control through Gas Safe'), within30(job, "Register the maker's warranty")] }],
      })
    }
    if (/cp12|landlord|gas safety|annual/.test(t)) {
      const cert = certFor('CP12')
      rules.push({
        when: ['Work', 'is', 'Landlord safety check'],
        rows: [{ label: 'Before the invoice', items: [{ name: 'CP12 record raised', state: cert && cert.state !== 'draft' ? 'met' : 'waiting', note: cert?.state === 'draft' ? 'Draft' : undefined }] }],
      })
    }
  }

  if (job.trade === 'electrical') {
    rules.push({
      when: ['Trade', 'is', 'Electrical'],
      rows: [
        { label: 'Require', items: some([fromCheck(job, 'registration', 'Scheme number'), fromCheck(job, 'rams', 'RAMS signed')]) },
        { label: 'Before the invoice', items: some([fromCheck(job, 'eicr', 'Electrical certificate')]) },
      ],
    })
    if (/consumer unit|rewire|new circuit|fuse board/.test(t)) {
      rules.push({ when: ['Work', 'is', 'Notifiable electrical work'], rows: [{ label: 'Remind', items: [within30(job, 'Notify Building Control through the scheme')] }] })
    }
  }

  if (job.trade === 'fire') {
    const cert = certFor('BS5839')
    rules.push({ when: ['Trade', 'is', 'Fire'], rows: [{ label: 'Before the invoice', items: [{ name: 'BS 5839 certificate', state: cert && cert.state !== 'draft' ? 'met' : 'waiting' }] }] })
  }

  const signOff = some([fromCheck(job, 'photos', 'Photos from site'), fromCheck(job, 'signature', 'Customer sign-off')])
  if (signOff.length) rules.push({ when: ['Every job'], rows: [{ label: 'Before the invoice', items: signOff }] })

  return rules.map((r) => ({ ...r, rows: r.rows.filter((row) => row.items.length) })).filter((r) => r.rows.length)
}

const stateWord: Record<State, string> = { met: 'Done', waiting: 'Waiting', failed: 'Failed', later: 'Later', due: 'Due' }

function Mark({ state }: { state: State }) {
  return (
    <span
      aria-label={stateWord[state]}
      className={cn(
        'size-[9px] shrink-0 rounded-full',
        state === 'met' && 'bg-ok',
        state === 'failed' && 'bg-danger',
        state === 'waiting' && 'shadow-[inset_0_0_0_1.5px_var(--warn)]',
        state === 'due' && 'bg-warn',
        state === 'later' && 'bg-line-strong',
      )}
    />
  )
}

/** The rules above, one card each, numbered in the order they apply. */
export function JobRules({ job, book }: { job: Job; book: Book }) {
  const rules = jobRules(job, book)
  if (!rules.length) return null
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {rules.map((r, i) => (
        <Card key={i} className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-muted">
            <span className="text-foreground">Rule</span>
            <span className="rounded-[6px] bg-raised px-1.5 py-0.5 text-foreground">{String(i + 1).padStart(2, '0')}</span>
            <span className="text-faint">·</span>
            {r.when.length === 1 ? (
              <span className="uppercase">{r.when[0]}</span>
            ) : (
              <>
                <span>IF</span>
                <span className="rounded-[6px] bg-inset px-1.5 py-0.5">{r.when[0]}</span>
                <span>{r.when[1]}</span>
                <span className="rounded-[6px] bg-inset px-1.5 py-0.5 text-foreground">{r.when[2]}</span>
              </>
            )}
          </div>
          <dl className="flex flex-col gap-2.5 rounded-[10px] bg-inset px-3.5 py-3">
            {r.rows.map((row) => (
              <div key={row.label} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[130px_1fr] sm:gap-3">
                <dt className="cap pt-[3px] text-[11px]">{row.label}</dt>
                <dd className="flex flex-col gap-1.5">
                  {row.items.map((it) => (
                    <span key={it.name} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate">{it.name}</span>
                      <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted uppercase">
                        {it.note ?? stateWord[it.state]}
                        <Mark state={it.state} />
                      </span>
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  )
}

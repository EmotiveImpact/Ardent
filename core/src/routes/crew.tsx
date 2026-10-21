import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { clock, initials, trade as tradeName, window as timeWindow } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { barButton } from '@/components/layout/topbar'
import { Icon } from '@/components/layout/icons'
import { Card, PageHead, StateDot } from '@/components/ardent/parts'
import { FormDialog, Monogram } from '@/components/ardent/people-parts'
import { daysTo, expiryWord, hoursBetween, hoursWord, softButton, solidButton } from '@/components/ardent/people-kit'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { selectClass } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useArdent, useBook, useQuery, type Book } from '@/data/ardent'
import type { Operator, OperatorState, Trade } from '@/data/model'
import { act } from '@/lib/act'
import { addDays, find, isDone, onDay, today, weekStart } from '@/lib/jobs'
import { cn } from '@/lib/utils'

export type Member = { userId: string; role: 'owner' | 'office' | 'field'; name: string; email: string; operatorId?: string }

/** Everyone with a sign-in to this firm. */
export function useMembers() {
  const { admin } = useArdent()
  return useQuery(() => admin<Member[]>('members'))
}

const trades: Trade[] = ['gas', 'heating', 'plumbing', 'electrical', 'fire', 'hvac', 'lifts', 'roofing', 'carpentry', 'general']

/** A registration this close to running out needs booking in. */
const SOON = 30

function Labelled({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={htmlFor} className="cap">
        {label}
      </label>
      {children}
    </div>
  )
}

function AddCrewDialog({ children }: { children: ReactNode }) {
  const { admin } = useArdent()
  const [open, setOpen] = useState(false)
  const blank = { name: '', role: 'operator' as Operator['role'], van: '', trades: ['gas'] as Trade[], body: '', number: '', expires: '' }
  const [f, setF] = useState(blank)
  const ready = f.name.trim() && (!f.body.trim() || (f.number.trim() && f.expires))
  const save = async () => {
    if (!ready) return
    const op = await act(
      admin<Operator>('addOperator', {
        name: f.name.trim(),
        initials: initials(f.name),
        role: f.role,
        van: f.van.trim().toUpperCase(),
        trades: f.trades,
        registrations: f.body.trim() ? [{ body: f.body.trim(), number: f.number.trim(), expires: f.expires }] : [],
      }),
      (o) => `${o.name} added to the crew`,
    )
    if (op) {
      setOpen(false)
      setF(blank)
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <FormDialog wide eyebrow="Crew" title="Add to the crew" line="They can be given a sign-in for Ardent Field afterwards.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
          <Labelled label="Name" htmlFor="ac-name">
            <Input id="ac-name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Sam Okafor" />
          </Labelled>
          <Labelled label="Works as" htmlFor="ac-role">
            <select id="ac-role" className={selectClass} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Operator['role'] })}>
              <option value="operator">Employee</option>
              <option value="subcontractor">Subcontractor</option>
              <option value="owner">Owner</option>
            </select>
          </Labelled>
          <Labelled label="Van" htmlFor="ac-van">
            <Input id="ac-van" className="font-mono uppercase" value={f.van} onChange={(e) => setF({ ...f, van: e.target.value })} placeholder="MA24 KTX" />
          </Labelled>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="cap pb-2">Trades</legend>
          <div className="flex flex-wrap gap-1.5">
            {trades.map((t) => {
              const on = f.trades.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setF({ ...f, trades: on ? f.trades.filter((x) => x !== t) : [...f.trades, t] })}
                  className={cn('h-8 rounded-lg bg-raised px-3 text-[12px] text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60', on && 'bg-foreground text-background hover:text-background')}
                >
                  {tradeName[t]}
                </button>
              )
            })}
          </div>
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Labelled label="Registered with" htmlFor="ac-body">
            <Input id="ac-body" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Gas Safe" />
          </Labelled>
          <Labelled label="Number" htmlFor="ac-num">
            <Input id="ac-num" className="font-mono" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
          </Labelled>
          <Labelled label="Expires" htmlFor="ac-exp">
            <Input id="ac-exp" type="date" className="font-mono" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} />
          </Labelled>
        </div>
        <button type="button" className={solidButton} disabled={!ready} onClick={() => void save()}>
          Add to the crew
        </button>
      </FormDialog>
    </Dialog>
  )
}

/** Give a crew member a sign-in for Ardent Field. Owners only. */
function SignInDialog({ op, children }: { op: Operator; children: ReactNode }) {
  const { admin } = useArdent()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const ready = /.+@.+\..+/.test(email) && password.length >= 8
  const save = async () => {
    if (!ready) return
    const done = await act(admin('invite', { email: email.trim(), name: op.name, role: 'field', password, operatorId: op.id }), `${op.name} can sign in to Ardent Field`)
    if (done) {
      setOpen(false)
      setEmail('')
      setPassword('')
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <FormDialog eyebrow="Ardent Field" title={`Sign-in for ${op.name.split(' ')[0]}`} line="They sign in to Ardent Field with this email and password. Ardent doesn't send it, so pass it on to them yourself.">
        <Labelled label="Email" htmlFor="si-email">
          <Input id="si-email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </Labelled>
        <Labelled label="Temporary password, 8 or more characters" htmlFor="si-pass">
          <Input id="si-pass" className="font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Labelled>
        <button type="button" className={solidButton} disabled={!ready} onClick={() => void save()}>
          Give them a sign-in
        </button>
      </FormDialog>
    </Dialog>
  )
}

/* ---------- The screen ---------- */

const stateWord: Record<OperatorState, [string, 'ok' | 'info' | 'warn' | 'faint']> = {
  on_site: ['On site', 'ok'],
  en_route: ['On the road', 'info'],
  delayed: ['Held up', 'warn'],
  on_call: ['In the yard', 'faint'],
  workshop: ['Workshop', 'faint'],
  off_shift: ['Off today', 'faint'],
}

const todaysJobs = (book: Book, opId: string) =>
  book.jobs.filter((j) => j.operatorIds.includes(opId) && onDay(j.start, today()) && j.status !== 'cancelled').sort((a, b) => a.start.localeCompare(b.start))

export function Crew() {
  const { me } = useArdent()
  const { data: book } = useBook()
  const { data: members } = useMembers()
  const ops = book?.operators ?? []
  const outToday = book ? ops.filter((o) => todaysJobs(book, o.id).length > 0 || ['en_route', 'on_site', 'delayed'].includes(o.state)).length : 0
  const regs = ops.flatMap((o) => o.registrations)
  const lapsed = regs.filter((r) => daysTo(r.expires) < 0).length
  const running = regs.filter((r) => daysTo(r.expires) <= SOON).length
  const jobsToday = book?.jobs.filter((j) => onDay(j.start, today()) && j.status !== 'cancelled').length ?? 0

  const add = (
    <AddCrewDialog>
      <button type="button" className={barButton}>
        <Icon name="plus" className="size-4" /> Add to the crew
      </button>
    </AddCrewDialog>
  )

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Crew' }]} actions={add} />
      <PageHead
        title="Crew"
        book={book}
        className="pb-0"
        sub="Who's out, what they're on, and what they're cleared to do."
        figures={
          book && [
            { label: 'Out today', value: outToday, unit: `of ${ops.length}` },
            { label: 'Jobs today', value: jobsToday },
            { label: 'Cards running out', value: running, tone: lapsed ? 'danger' : running ? 'warn' : undefined },
          ]
        }
      />
      <div className="-mt-4 sm:hidden">{add}</div>

      {!book ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[480px] animate-pulse rounded-[14px] bg-surface/60" />
          ))}
        </div>
      ) : ops.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fill,minmax(270px,1fr))]">
          {ops.map((o, i) => (
            <CrewCard key={o.id} book={book} op={o} index={i} member={members?.find((m) => m.operatorId === o.id)} owner={me?.role === 'owner'} membersKnown={!!members} />
          ))}
        </div>
      ) : (
        <Card className="py-16 text-center text-[14px] text-muted">No one on the crew yet. Add the first person from the top bar.</Card>
      )}
    </div>
  )
}

/** "Owner, gas and heating", "Electrician", "Subcontractor, carpentry". */
function roleLine(o: Operator) {
  const t = o.trades.map((x) => tradeName[x].toLowerCase())
  const list = t.length > 1 ? `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}` : (t[0] ?? '')
  if (o.role === 'owner') return list ? `Owner, ${list}` : 'Owner'
  if (o.role === 'subcontractor') return list ? `Subcontractor, ${list}` : 'Subcontractor'
  if (o.trades.length === 1 && o.trades[0] === 'electrical') return 'Electrician'
  return list ? list.charAt(0).toUpperCase() + list.slice(1) : 'Employee'
}

/** What they're doing now, in a title and a mono detail line. */
function nowLine(book: Book, o: Operator) {
  const job = find(book.jobs, o.currentJobId)
  const nowIso = new Date().toISOString()
  const next = todaysJobs(book, o.id).find((j) => j.id !== job?.id && !isDone(j) && j.end > nowIso)
  const nextWord = next ? `NEXT ${next.ref}  ${clock(next.start)}` : 'NOTHING ELSE TODAY'
  if (job && o.state === 'on_site') return { job, title: job.title, detail: `${job.ref}  ${timeWindow(job.start, job.end).toUpperCase()}` }
  if (job && o.state === 'en_route') return { job, title: job.title, detail: o.etaMinutes ? `${job.ref}  THERE ${clock(new Date(Date.now() + o.etaMinutes * 60_000).toISOString())}` : `${job.ref}  ON THE WAY` }
  if (job && o.state === 'delayed') return { job, title: job.title, detail: o.etaMinutes ? `${job.ref}  ${o.etaMinutes} MIN LATE` : `${job.ref}  RUNNING LATE` }
  if (o.state === 'workshop') return { job: next, title: 'In the workshop', detail: nextWord }
  if (o.state === 'off_shift') return { job: next, title: 'Off shift', detail: next ? nextWord : 'NOTHING BOOKED TODAY' }
  return { job: next, title: o.state === 'on_call' ? 'In the yard' : stateWord[o.state][0], detail: nextWord }
}

function CrewCard({ book, op, index, member, owner, membersKnown }: { book: Book; op: Operator; index: number; member?: Member; owner: boolean; membersKnown: boolean }) {
  const [word, tone] = stateWord[op.state]
  const now = nowLine(book, op)
  const day = today()
  const month = day.slice(0, 7)
  const mine = book.jobs.filter((j) => j.operatorIds.includes(op.id) && j.status !== 'cancelled')
  const monthJobs = mine.filter((j) => j.start.slice(0, 7) === month).length
  const mon = weekStart(day)
  const week = Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  const weekHours = mine.filter((j) => week.some((d) => onDay(j.start, d))).reduce((s, j) => s + hoursBetween(j.start, j.end), 0)
  const monthName = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
  const regs = [...op.registrations].sort((a, b) => a.expires.localeCompare(b.expires))

  const nowBody = (
    <>
      <span className="cap">Now</span>
      <span className="truncate text-[14px]">{now.title}</span>
      <span className="truncate font-mono text-[11px] whitespace-pre text-muted">{now.detail}</span>
    </>
  )

  return (
    <Card aria-label={op.name} className="flex flex-col gap-[22px] p-6" style={{ '--i': index } as CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <Monogram size="lg">{op.initials}</Monogram>
        <span className="cap flex h-7 items-center gap-2 rounded-full bg-raised px-[11px] text-foreground">
          <StateDot tone={tone} />
          {word}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 className="op-title truncate text-[15px] tracking-[.16em]">{op.name}</h2>
        <span className="text-[13px] text-muted">{roleLine(op)}</span>
      </div>

      {now.job ? (
        <Link to={`/jobs/${now.job.id}`} className="flex min-w-0 flex-col gap-1 rounded-[10px] bg-inset px-3.5 py-3 outline-none transition-colors hover:bg-[#101010] focus-visible:ring-2 focus-visible:ring-ring/60">
          {nowBody}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-col gap-1 rounded-[10px] bg-inset px-3.5 py-3">{nowBody}</div>
      )}

      <dl className="grid grid-cols-3 gap-2.5">
        <Stat label={`Jobs, ${monthName}`}>{monthJobs}</Stat>
        <Stat label="Today">{todaysJobs(book, op.id).length}</Stat>
        <Stat label="Week">{hoursWord(weekHours)}</Stat>
      </dl>

      <ul className="rows text-[13px]">
        {regs.map((r) => {
          const d = daysTo(r.expires)
          return (
            <li key={`${r.body}${r.number}`} className="flex items-center justify-between gap-2.5 py-2.5">
              <span className="truncate">{r.body}</span>
              <span className={cn('shrink-0 font-mono text-[12px] whitespace-pre', d < 0 ? 'text-danger' : d <= SOON ? 'text-warn' : 'text-muted')}>
                {r.number}
                {'  '}
                {d < 0 ? `LAPSED ${expiryWord(r.expires)}` : expiryWord(r.expires)}
              </span>
            </li>
          )
        })}
        {!regs.length && (
          <li className="flex items-center justify-between gap-2.5 py-2.5">
            <span>Registration</span>
            <span className="font-mono text-[12px] text-muted">NONE ON FILE</span>
          </li>
        )}
        <li className="flex items-center justify-between gap-2.5 py-2.5">
          <span>Van</span>
          <span className="font-mono text-[12px] text-muted">{op.van || 'NO VAN'}</span>
        </li>
        <li className="flex min-h-[46px] items-center justify-between gap-2.5 py-2">
          <span>Ardent Field</span>
          {member ? (
            <span className="truncate font-mono text-[12px] text-muted" title={member.email}>
              HAS A SIGN-IN
            </span>
          ) : !membersKnown ? (
            <span className="font-mono text-[12px] text-faint">...</span>
          ) : owner ? (
            <SignInDialog op={op}>
              <button type="button" className={cn(softButton, 'h-[30px] px-3 text-[12px]')}>
                Give a sign-in
              </button>
            </SignInDialog>
          ) : (
            <span className="font-mono text-[12px] text-muted">NO SIGN-IN</span>
          )}
        </li>
      </ul>
    </Card>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="cap truncate text-[11px]">{label}</dt>
      <dd className="op-number text-[20px]">{children}</dd>
    </div>
  )
}

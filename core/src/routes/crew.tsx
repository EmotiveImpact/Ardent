import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { BadgeCheck, KeyRound, Plus, Truck, UserPlus } from 'lucide-react'
import { initials, jobStatus, operatorState, shortDate, trade as tradeName, window as timeWindow } from '@kit'
import { Panel, PanelHeader, Row, SectionLabel, Well, PageHeader } from '@/components/ui/panel'
import { Avatar } from '@/components/ui/avatar'
import { Badge, Chip } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, selectClass } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useArdent, useBook, useQuery } from '@/data/ardent'
import type { Operator, Trade } from '@/data/model'
import { act } from '@/lib/act'
import { find, onDay, today } from '@/lib/jobs'
import { cn } from '@/lib/utils'

export type Member = { userId: string; role: 'owner' | 'office' | 'field'; name: string; email: string; operatorId?: string }

/** Everyone with a sign-in to this firm. */
export function useMembers() {
  const { admin } = useArdent()
  return useQuery(() => admin<Member[]>('members'))
}

const trades: Trade[] = ['gas', 'heating', 'plumbing', 'electrical', 'fire', 'hvac', 'lifts', 'roofing', 'carpentry', 'general']
const daysTo = (day: string) => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today()}T12:00:00Z`)) / 86_400_000)

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
      <DialogContent className="max-w-xl">
        <div className="px-3 pt-3 pb-3">
          <DialogTitle>Add to the crew</DialogTitle>
          <DialogDescription>They can be given a sign-in for Ardent Field afterwards.</DialogDescription>
        </div>
        <Well className="space-y-4 p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
            <Field label="Name" htmlFor="ac-name">
              <Input id="ac-name" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Sam Okafor" />
            </Field>
            <Field label="Works as" htmlFor="ac-role">
              <select id="ac-role" className={selectClass} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Operator['role'] })}>
                <option value="operator">Employee</option>
                <option value="subcontractor">Subcontractor</option>
                <option value="owner">Owner</option>
              </select>
            </Field>
            <Field label="Van" htmlFor="ac-van">
              <Input id="ac-van" className="font-mono uppercase" value={f.van} onChange={(e) => setF({ ...f, van: e.target.value })} placeholder="MA24 KTX" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {trades.map((t) => {
              const on = f.trades.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setF({ ...f, trades: on ? f.trades.filter((x) => x !== t) : [...f.trades, t] })}
                  className={cn('h-8 rounded-md bg-surface px-3 text-[12px] text-muted transition-colors hover:text-foreground', on && 'bg-foreground text-black hover:text-black')}
                >
                  {tradeName[t]}
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-lg bg-surface p-3 sm:grid-cols-3">
            <Field label="Registered with" htmlFor="ac-body">
              <Input id="ac-body" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Gas Safe" />
            </Field>
            <Field label="Number" htmlFor="ac-num">
              <Input id="ac-num" className="font-mono" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
            </Field>
            <Field label="Expires" htmlFor="ac-exp">
              <Input id="ac-exp" type="date" className="font-mono" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} />
            </Field>
          </div>
          <Button variant="ember" className="h-11 w-full" disabled={!ready} onClick={() => void save()}>
            Add to the crew
          </Button>
        </Well>
      </DialogContent>
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
      <DialogContent>
        <div className="px-3 pt-3 pb-3">
          <DialogTitle>Sign-in for {op.name}</DialogTitle>
          <DialogDescription>They sign in to Ardent Field with this email and password. Pass it on to them yourself.</DialogDescription>
        </div>
        <Well className="space-y-3 p-3">
          <Field label="Email" htmlFor="si-email">
            <Input id="si-email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Temporary password, 8 or more characters" htmlFor="si-pass">
            <Input id="si-pass" className="font-mono" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button variant="ember" className="h-11 w-full" disabled={!ready} onClick={() => void save()}>
            Give them a sign-in
          </Button>
        </Well>
      </DialogContent>
    </Dialog>
  )
}

export function Crew() {
  const { me } = useArdent()
  const { data: book } = useBook()
  const { data: members } = useMembers()
  const [picked, setPicked] = useState<string>()
  const day = today()
  const ops = book?.operators ?? []
  const op = find(ops, picked) ?? ops[0]
  const out = ops.filter((o) => ['en_route', 'on_site', 'delayed'].includes(o.state)).length
  const lapsing = ops.flatMap((o) => o.registrations.filter((r) => daysTo(r.expires) <= 30)).length

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader
        eyebrow={`${ops.length} on the books, ${out} out now${lapsing ? `, ${lapsing} ${lapsing === 1 ? 'registration' : 'registrations'} to renew` : ''}`}
        title="Crew"
        aside={
          <AddCrewDialog>
            <Button variant="ember" size="sm">
              <Plus /> Add to the crew
            </Button>
          </AddCrewDialog>
        }
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-2">
          {ops.map((o, i) => {
            const st = operatorState[o.state]
            const todays = book!.jobs.filter((j) => j.operatorIds.includes(o.id) && onDay(j.start, day) && j.status !== 'cancelled')
            const current = find(book!.jobs, o.currentJobId)
            const soonest = [...o.registrations].sort((a, b) => a.expires.localeCompare(b.expires))[0]
            const d = soonest && daysTo(soonest.expires)
            return (
              <button
                key={o.id}
                onClick={() => setPicked(o.id)}
                style={{ '--i': i } as CSSProperties}
                className={cn('animate-rise flex flex-col rounded-xl bg-surface/90 p-1.5 text-left transition-colors hover:bg-[#141414]', op?.id === o.id && 'bg-raised hover:bg-raised')}
              >
                <div className="flex items-center gap-3 px-2.5 py-2.5">
                  <Avatar initials={o.initials} className="size-10 text-[12px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px]">{o.name}</p>
                    <p className="truncate text-[12px] text-muted">{o.trades.map((t) => tradeName[t]).join(', ')}</p>
                  </div>
                  <Badge tone={st.tone} dot>
                    {st.label}
                  </Badge>
                </div>
                <div className="rounded-lg bg-inset px-3 py-2.5 text-[12px]">
                  <p className="truncate text-muted">
                    {current ? (
                      <>
                        <span className="font-mono text-foreground">{current.ref}</span> {current.title}
                      </>
                    ) : todays.length ? (
                      `${todays.length} ${todays.length === 1 ? 'job' : 'jobs'} today`
                    ) : (
                      'Nothing booked today'
                    )}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px] text-faint">
                    <span className="flex items-center gap-1.5">
                      <Truck className="size-3.5" /> {o.van || 'No van'}
                    </span>
                    {soonest && (
                      <span className={cn(d < 0 ? 'text-danger' : d <= 30 ? 'text-warn' : 'text-faint')}>
                        {soonest.body} {d < 0 ? 'lapsed' : `to ${shortDate(`${soonest.expires}T12:00:00Z`)}`}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {op && book && (
          <Panel className="xl:sticky xl:top-0 xl:self-start">
            <PanelHeader icon={<BadgeCheck />} title={op.name} />
            <Well className="px-2 pb-2">
              <SectionLabel>Today</SectionLabel>
              <div className="divide-y divide-line rounded-lg bg-surface">
                {book.jobs
                  .filter((j) => j.operatorIds.includes(op.id) && onDay(j.start, day) && j.status !== 'cancelled')
                  .sort((a, b) => a.start.localeCompare(b.start))
                  .map((j) => (
                    <Link key={j.id} to={`/jobs/${j.id}`} className="flex min-h-11 items-center gap-3 px-3 py-2 text-[13px] hover:bg-white/[0.02]">
                      <span className="font-mono text-[12px] text-muted">{timeWindow(j.start, j.end)}</span>
                      <span className="min-w-0 flex-1 truncate">{j.title}</span>
                      <Badge tone={jobStatus[j.status].tone} dot>
                        {jobStatus[j.status].label}
                      </Badge>
                    </Link>
                  ))}
                {!book.jobs.some((j) => j.operatorIds.includes(op.id) && onDay(j.start, day)) && <p className="px-3 py-3 text-[13px] text-faint">Nothing booked.</p>}
              </div>

              <SectionLabel>Registrations</SectionLabel>
              <div className="divide-y divide-line rounded-lg bg-surface">
                {op.registrations.map((r) => {
                  const d = daysTo(r.expires)
                  return (
                    <Row key={r.number} label={r.body}>
                      <Chip>{r.number}</Chip>
                      <span className={cn('font-mono text-[12px]', d < 0 ? 'text-danger' : d <= 30 ? 'text-warn' : 'text-muted')}>
                        {d < 0 ? `lapsed ${shortDate(`${r.expires}T12:00:00Z`)}` : `to ${shortDate(`${r.expires}T12:00:00Z`)}`}
                      </span>
                    </Row>
                  )
                })}
                {!op.registrations.length && <p className="px-3 py-3 text-[13px] text-faint">None on file.</p>}
              </div>

              <SectionLabel>Ardent Field</SectionLabel>
              <div className="divide-y divide-line rounded-lg bg-surface">
                {(() => {
                  const m = members?.find((x) => x.operatorId === op.id)
                  if (m)
                    return (
                      <Row label="Signs in as">
                        <span className="truncate">{m.email}</span>
                      </Row>
                    )
                  return (
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                      <span className="text-muted">No sign-in yet</span>
                      {me?.role === 'owner' ? (
                        <SignInDialog op={op}>
                          <Button variant="outline" size="xs">
                            <KeyRound /> Give them a sign-in
                          </Button>
                        </SignInDialog>
                      ) : (
                        <span className="text-[12px] text-faint">The owner can add one</span>
                      )}
                    </div>
                  )
                })()}
                <Row label="Works as">{op.role === 'subcontractor' ? 'Subcontractor' : op.role === 'owner' ? 'Owner' : 'Employee'}</Row>
                <Row label="Van">
                  <Chip>{op.van || '·'}</Chip>
                </Row>
              </div>
            </Well>
          </Panel>
        )}
        {book && !ops.length && (
          <Panel>
            <Well className="flex flex-col items-center gap-3 px-3 py-14 text-center text-[13px] text-faint">
              <UserPlus className="size-5" />
              No one on the crew yet.
            </Well>
          </Panel>
        )}
      </div>
    </div>
  )
}

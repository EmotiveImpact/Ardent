import { useState, type ReactNode } from 'react'
import { pounds } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, SectionHead } from '@/components/ardent/parts'
import { Pill } from '@/components/ardent/book-parts'
import { useArdent, useQuery } from '@/data/ardent'
import type { Automation, AutomationArea, AutomationJob, Level, UsageLine } from '@/data/model'
import { act } from '@/lib/act'
import { cn } from '@/lib/utils'

/*
 * Ardent's rules: how far Ardent goes on its own with each back office job,
 * an off switch for each area, chase timings and tone, office hours and
 * limits, and what this month has used against the plan. The owner changes
 * them; the office can read them.
 */

const LEVELS: { level: Level; name: string; means: string }[] = [
  { level: 0, name: 'Read', means: 'Looks, adds up and tells you' },
  { level: 1, name: 'Draft', means: 'Prepares it for a person to check' },
  { level: 2, name: 'Approve', means: 'Ready to go, waits for one tap' },
  { level: 3, name: 'Auto', means: 'Runs alone inside your rules' },
  { level: 4, name: 'Never', means: 'Off limits to the AI' },
]
const levelName = (l: Level) => LEVELS[l].name

const AREAS: { key: AutomationArea; name: string; what: string }[] = [
  { key: 'paperwork', name: 'Paperwork from the van', what: 'Job reports, materials, certificates and the invoice when a job is finished.' },
  { key: 'money', name: 'Money', what: 'Quotes, chasing what is owed, accounts and job profit.' },
  { key: 'dispatch', name: 'Dispatch', what: "Tomorrow's plan, arrival windows, running late and emergencies." },
  { key: 'compliance', name: 'Compliance', what: 'Renewals, quiet weeks, landlord packs and engineer cards.' },
  { key: 'calls', name: 'Calls and enquiries', what: "Answering the firm's phone, triage and booking." },
  { key: 'brief', name: 'Morning brief', what: "Yesterday's numbers and what waits for a yes." },
]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Patch = Parameters<ReturnType<typeof useArdent>['client']['automation']['set']>[0]

export function Rules() {
  const { client, me } = useArdent()
  const { data } = useQuery((c) => c.automation.get())
  const owner = me?.role === 'owner'
  const save = (patch: Patch, said: string) => void act(client.automation.set(patch), said)

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Approvals', to: '/approvals' }, { label: "Ardent's rules" }]} />
      <PageHead
        title="Ardent's rules"
        sub={owner ? 'How far Ardent goes on its own with each back office job. Ardent drafts, people approve, and everything is logged.' : 'How far Ardent goes on its own with each job. Only the owner changes these.'}
        className="pb-0"
      />

      <Levels />

      {!data ? (
        <div className="h-80 animate-pulse rounded-[14px] bg-surface/60" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {AREAS.map((a) => (
              <AreaCard key={a.key} area={a} on={data.settings.areas[a.key]} jobs={data.jobs.filter((j) => j.area === a.key)} owner={owner} save={save} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Messages settings={data.settings} owner={owner} save={save} />
            <HoursAndLimits settings={data.settings} owner={owner} save={save} />
          </div>
          <UsageCard voice={data.settings.voice} owner={owner} save={save} />
        </>
      )}
    </div>
  )
}

function Levels() {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
      {LEVELS.map((l) => (
        <li key={l.level} className="flex flex-col gap-1.5 rounded-[12px] bg-surface px-4 py-3.5">
          <span className="font-mono text-[11px] text-muted">L{l.level}</span>
          <span className="text-[15px]">{l.name}</span>
          <span className="text-[12.5px] leading-[18px] text-muted">{l.means}</span>
        </li>
      ))}
    </ol>
  )
}

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn('relative h-6 w-10 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50', on ? 'bg-foreground' : 'bg-raised')}
    >
      <span className={cn('absolute top-1 size-4 rounded-full transition-[left]', on ? 'left-5 bg-background' : 'left-1 bg-muted')} />
    </button>
  )
}

function AreaCard({ area, on, jobs, owner, save }: { area: (typeof AREAS)[number]; on: boolean; jobs: AutomationJob[]; owner: boolean; save: (p: Patch, said: string) => void }) {
  return (
    <Card className="flex flex-col gap-3 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[17px]">{area.name}</h2>
          <p className="text-[13px] text-muted">{area.what}</p>
        </div>
        <Switch on={on} label={`${area.name} on`} disabled={!owner} onChange={(v) => save({ areas: { [area.key]: v } }, `${area.name} switched ${v ? 'on' : 'off'}`)} />
      </div>
      <ul className={cn('rows', !on && 'opacity-45')}>
        {jobs.map((j) => (
          <JobRow key={j.key} job={j} owner={owner && on} save={save} />
        ))}
      </ul>
      {!on && <p className="text-[12.5px] text-faint">Switched off: Ardent does nothing here, not even drafts.</p>}
    </Card>
  )
}

function JobRow({ job: j, owner, save }: { job: AutomationJob; owner: boolean; save: (p: Patch, said: string) => void }) {
  const fixed = j.allowed.length === 1
  const autoWaits = j.live && j.level === 3 && j.key === 'invoice_chasing'
  return (
    <li className="flex flex-col gap-2.5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-[14.5px]">
            {j.name}
            <span className={cn('font-mono text-[10.5px] tracking-[.08em] uppercase', j.live ? 'text-ok' : 'text-faint')}>{j.live ? 'Running' : j.waitsFor}</span>
          </span>
          <span className="text-[12.5px] leading-[18px] text-muted">{j.does}</span>
        </div>
        {fixed ? (
          <span className="cap shrink-0 rounded-full bg-raised px-3 py-1.5 text-[11px] text-muted">
            Fixed at L{j.level} {levelName(j.level)}
          </span>
        ) : (
          <div role="group" aria-label={`Level for ${j.name}`} className="flex shrink-0 gap-1">
            {j.allowed.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={j.level === l}
                disabled={!owner}
                title={`L${l} ${levelName(l)}: ${LEVELS[l].means}`}
                onClick={() => j.level !== l && save({ levels: { [j.key]: l } }, `${j.name}: L${l} ${levelName(l)}`)}
                className={cn(
                  'h-8 rounded-lg px-2.5 font-mono text-[11.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default',
                  j.level === l ? 'bg-foreground text-background' : 'bg-raised text-muted enabled:hover:text-foreground',
                )}
              >
                L{l}
                {j.level === l && <span className="ml-1.5 font-sans text-[12px]">{levelName(l)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="text-[12px] text-faint">
        Who says yes: {j.approves}
        {autoWaits && '. Runs alone once email is connected; until then each reminder waits for a yes.'}
      </span>
    </li>
  )
}

function Field({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="cap text-[11px] text-muted">{label}</span>
      {children}
      {note && <span className="text-[12px] text-faint">{note}</span>}
    </label>
  )
}

const input = 'h-10 w-full rounded-lg bg-background px-3 text-[14px] tabular outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring/60 disabled:text-muted'

/** A number that saves when you leave the box. */
function NumberBox({ value, onSave, disabled, min, max }: { value: number; onSave: (n: number) => void; disabled?: boolean; min: number; max: number }) {
  const [draft, setDraft] = useState<string>()
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      disabled={disabled}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== undefined && Number(draft) !== value && draft !== '') onSave(Number(draft))
        setDraft(undefined)
      }}
      className={input}
    />
  )
}

function Messages({ settings: s, owner, save }: { settings: Automation; owner: boolean; save: (p: Patch, said: string) => void }) {
  const [signOff, setSignOff] = useState<string>()
  return (
    <Card className="flex flex-col gap-5 p-6">
      <SectionHead title="Chasing and messages" aside="Applies to every message Ardent drafts" className="pb-0" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="First reminder" note="days after due">
          <NumberBox value={s.chase.first} min={0} max={60} disabled={!owner} onSave={(n) => save({ chase: { first: n } }, 'Reminder timing saved')} />
        </Field>
        <Field label="Firmer" note="days after due">
          <NumberBox value={s.chase.firmer} min={1} max={90} disabled={!owner} onSave={(n) => save({ chase: { firmer: n } }, 'Reminder timing saved')} />
        </Field>
        <Field label="Statement" note="days after due">
          <NumberBox value={s.chase.statement} min={2} max={120} disabled={!owner} onSave={(n) => save({ chase: { statement: n } }, 'Reminder timing saved')} />
        </Field>
        <Field label="Gap" note="days between">
          <NumberBox value={s.chase.gap} min={1} max={30} disabled={!owner} onSave={(n) => save({ chase: { gap: n } }, 'Reminder timing saved')} />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <span className="cap text-[11px] text-muted">Tone</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tone">
          {(['friendly', 'plain', 'formal'] as const).map((t) => (
            <Pill key={t} on={s.tone === t} disabled={!owner} onClick={() => save({ tone: t }, `Tone: ${t}`)}>
              {t === 'friendly' ? 'Friendly, "Hi Grace"' : t === 'plain' ? 'Plain, "Hello Grace"' : 'Formal, "Dear Grace Okafor"'}
            </Pill>
          ))}
        </div>
      </div>
      <Field label="Sign off as" note="Your firm's name when left empty">
        <input
          className={input}
          disabled={!owner}
          placeholder="Your firm's name"
          value={signOff ?? s.signOff ?? ''}
          onChange={(e) => setSignOff(e.target.value)}
          onBlur={() => {
            if (signOff !== undefined && signOff !== (s.signOff ?? '')) save({ signOff }, 'Sign-off saved')
            setSignOff(undefined)
          }}
        />
      </Field>
    </Card>
  )
}

function HoursAndLimits({ settings: s, owner, save }: { settings: Automation; owner: boolean; save: (p: Patch, said: string) => void }) {
  const time = (k: 'from' | 'to') => (
    <input type="time" disabled={!owner} defaultValue={s.officeHours[k]} key={s.officeHours[k]} onBlur={(e) => e.target.value !== s.officeHours[k] && save({ officeHours: { [k]: e.target.value } }, 'Office hours saved')} className={input} />
  )
  return (
    <Card className="flex flex-col gap-5 p-6">
      <SectionHead title="Office hours and limits" aside="Calls outside these hours are after hours" className="pb-0" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Opens">{time('from')}</Field>
        <Field label="Closes">{time('to')}</Field>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Office days">
        {DAYS.map((d, i) => {
          const on = s.officeHours.days.includes(i + 1)
          return (
            <Pill key={d} small on={on} disabled={!owner} onClick={() => save({ officeHours: { days: on ? s.officeHours.days.filter((x) => x !== i + 1) : [...s.officeHours.days, i + 1] } }, 'Office days saved')}>
              {d}
            </Pill>
          )
        })}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="AI spend cap, £ a month" note="When it's reached, Ardent carries on without AI and tells you">
          <NumberBox value={s.limits.aiPence / 100} min={0} max={1000} disabled={!owner} onSave={(n) => save({ limits: { aiPence: Math.round(n * 100) } }, 'AI cap saved')} />
        </Field>
        <Field label="Messages to one customer" note="most reminders and notices a week">
          <NumberBox value={s.limits.messagesPerCustomerWeek} min={1} max={7} disabled={!owner} onSave={(n) => save({ limits: { messagesPerCustomerWeek: n } }, 'Limit saved')} />
        </Field>
      </div>
    </Card>
  )
}

const amount = (l: UsageLine, n: number) => (l.unit === 'pence' ? pounds(n, { always: true }) : `${n.toLocaleString('en-GB')} ${l.unit === 'minutes' ? 'min' : ''}`.trim())

function UsageCard({ voice, owner, save }: { voice: boolean; owner: boolean; save: (p: Patch, said: string) => void }) {
  const { data: u } = useQuery((c) => c.usage.get())
  const month = u && new Date(`${u.month}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Europe/London' })
  return (
    <Card className="flex flex-col gap-5 p-6">
      <SectionHead title={`What Ardent has used${month ? `, ${month}` : ''}`} aside={u && (u.extraCost ? `${pounds(u.extraCost, { always: true })} over the plan so far` : 'Nothing over the plan')} className="pb-0" />
      {!u ? (
        <div className="h-40 animate-pulse rounded-[10px] bg-inset" />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {u.lines.map((l) => {
            const top = l.cap ?? l.included ?? 0
            const pct = top ? Math.min(100, (l.used / top) * 100) : 0
            const full = top > 0 && l.used >= top
            return (
              <li key={l.key} className="flex flex-col gap-3 rounded-[12px] bg-background/55 px-4 py-4">
                <span className="cap text-[11px] text-muted">{l.label}</span>
                <span className="font-mono text-[22px] leading-none tabular">
                  {amount(l, l.used)}
                  {top > 0 && <span className="text-[13px] text-muted"> / {amount(l, top)}</span>}
                </span>
                <span aria-hidden className="h-1 overflow-hidden rounded-full bg-raised">
                  <span className={cn('block h-full rounded-full', full ? 'bg-warn' : 'bg-foreground')} style={{ width: `${pct}%` }} />
                </span>
                <span className={cn('text-[12.5px] leading-[18px]', full ? 'text-warn' : 'text-muted')}>{l.note}</span>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] bg-background/55 px-4 py-3.5">
        <span className="flex flex-col gap-1">
          <span className="text-[14.5px]">Ardent Voice</span>
          <span className="text-[12.5px] text-muted">All-day answering when the office is busy. £99 a month with 250 minutes, then 35p a minute. Phone answering isn't live yet.</span>
        </span>
        <Switch on={voice} label="Ardent Voice" disabled={!owner} onChange={(v) => save({ voice: v }, v ? 'Ardent Voice added' : 'Ardent Voice removed')} />
      </div>
      <p className="text-[12px] text-faint">The plan includes 150 after-hours call minutes and 1,500 texts a month. Texts past that are charged at cost. Nothing is counted yet because texts, calls and the AI aren't connected.</p>
    </Card>
  )
}

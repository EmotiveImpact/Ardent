import { useMemo, useState } from 'react'
import { trade as TRADE_NAME } from '@kit'
import { describeCheck, describeReply, explain, ruleProblem, topicName } from '@kit/questions.ts'
import { buildReport, TICKS, withTicks } from '@kit/report.ts'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, SectionHead } from '@/components/ardent/parts'
import { Pill } from '@/components/ardent/book-parts'
import { greyButton } from '@/components/ardent/money-lib'
import { Button } from '@/components/ui/button'
import { Field, fieldClass, selectClass } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { useArdent, useQuery } from '@/data/ardent'
import type { FirmFollowUp, FollowUp, FollowUpCheck, FollowUpReply, ReportTick, ReportTopic, Trade } from '@/data/model'
import { act } from '@/lib/act'
import { cn } from '@/lib/utils'

/*
 * Report questions: the quick follow-ups an engineer's job report asks when
 * an answer is missing something. Ardent's playbook comes with Ardent; the
 * firm adds its own here and switches any of them off. Engineers' phones
 * pick up changes the next time they have signal.
 */

const TRADES: Trade[] = ['gas', 'heating', 'plumbing', 'electrical', 'fire', 'hvac', 'lifts', 'roofing', 'carpentry', 'general']
const tradeName = (t: Trade) => TRADE_NAME[t] ?? t
const TOPICS: ReportTopic[] = ['work', 'parts', 'tests', 'left', 'next']
/** Switches here are many, so they stay white: the page's one ember is Add a question. */
const quietSwitch = 'data-[state=checked]:bg-foreground'
const words = (v: string) => v.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)

export function Questions() {
  const { client, me } = useArdent()
  const { data } = useQuery((c) => c.followUps.get())
  const [trade, setTrade] = useState<Trade | 'all'>('all')
  const [editing, setEditing] = useState<FirmFollowUp | 'new'>()
  const office = me?.role !== 'field'
  if (!data) return <div className="h-80 animate-pulse rounded-[14px] bg-surface/60" />

  const fits = (r: FollowUp) => trade === 'all' || !r.trades || r.trades.includes(trade)
  const on = (r: FollowUp) => !data.off.includes(r.id)
  const flip = (r: FollowUp, v: boolean) => void act(client.followUps.switch(r.id, v), `“${r.name}” switched ${v ? 'on' : 'off'}`)
  const playbook = data.playbook.filter(fits)
  const own = data.own.filter(fits)
  const offCount = data.playbook.filter((r) => !on(r)).length

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Report questions' }]} />
      <PageHead
        title="Report questions"
        sub="After each answer in an engineer's job report, Ardent checks these and asks a quick follow-up when something is missing. Changes reach every engineer's phone the next time it has signal."
        className="pb-0"
        aside={office && !editing && <Button variant="ember" onClick={() => setEditing('new')}>Add a question</Button>}
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Show questions for">
        <Pill on={trade === 'all'} onClick={() => setTrade('all')} small>
          Every trade
        </Pill>
        {TRADES.slice(0, 6).map((t) => (
          <Pill key={t} on={trade === t} onClick={() => setTrade(t)} small>
            {tradeName(t)}
          </Pill>
        ))}
      </div>

      {editing && <Editor key={editing === 'new' ? 'new' : editing.id} rule={editing === 'new' ? undefined : editing} onDone={() => setEditing(undefined)} />}

      <section>
        <SectionHead title={`Your own · ${data.own.length}`} aside="Checked after Ardent's playbook. Only your engineers get these." />
        {own.length === 0 ? (
          <Card className="p-6 text-[14px] text-muted">
            {data.own.length === 0 ? 'None yet. Add a question for anything your firm always needs to know, such as a meter left off or a loft hatch closed.' : 'None for this trade.'}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {own.map((r) => (
              <RuleCard key={r.id} rule={r} on={on(r)} office={office} onSwitch={(v) => flip(r, v)} onEdit={() => setEditing(r)} onRemove={() => void act(client.followUps.remove(r.id), `“${r.name}” removed`)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHead title={`Ardent's playbook · ${data.playbook.length}`} aside={offCount ? `${offCount} switched off for your firm` : 'Comes with Ardent and gets better with each update'} />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {playbook.map((r) => (
            <RuleCard key={r.id} rule={r} on={on(r)} office={office} onSwitch={(v) => flip(r, v)} />
          ))}
        </div>
      </section>
    </div>
  )
}

function RuleCard({ rule, on, office, onSwitch, onEdit, onRemove }: { rule: FollowUp | FirmFollowUp; on: boolean; office: boolean; onSwitch: (on: boolean) => void; onEdit?: () => void; onRemove?: () => void }) {
  const [open, setOpen] = useState(false)
  const own = 'by' in rule
  return (
    <Card className={cn('flex flex-col gap-3 p-5', !on && 'opacity-55')}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[15px]">{rule.name}</h3>
          <p className="font-mono text-[11px] tracking-[.06em] text-muted uppercase">
            {rule.trades ? rule.trades.map(tradeName).join(', ') : 'Every trade'} · after {rule.after === 'any' ? 'any answer' : rule.after.map(topicName).join(', ')}
          </p>
        </div>
        <Switch checked={on} onCheckedChange={onSwitch} disabled={!office} aria-label={`${rule.name} on`} className={quietSwitch} />
      </div>
      <p className="text-[15px] leading-[22px] text-foreground">“{rule.ask.replace('{said}', '…what they said…')}”</p>
      {open && (
        <dl className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          <dt className="cap pt-0.5">When</dt>
          <dd className="flex flex-col gap-0.5 text-muted">{rule.when.map((c, i) => <span key={i}>{describeCheck(c)}</span>)}</dd>
          <dt className="cap pt-0.5">Buttons</dt>
          <dd className="flex flex-col gap-0.5 text-muted">
            {rule.replies.map((b) => (
              <span key={b.label}>
                <span className="text-foreground">{b.label}</span> {describeReply(b)}
              </span>
            ))}
          </dd>
          <dt className="cap pt-0.5">Why</dt>
          <dd className="text-muted">{rule.why}</dd>
          {own && (
            <>
              <dt className="cap pt-0.5">Changed</dt>
              <dd className="text-muted">
                by {rule.by}
                {rule.shared ? ', offered to Ardent' : ''}
              </dd>
            </>
          )}
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={greyButton} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Less' : 'How it decides'}
        </button>
        {office && onEdit && (
          <button type="button" className={greyButton} onClick={onEdit}>
            Change
          </button>
        )}
        {office && onRemove && (
          <button type="button" className={cn(greyButton, 'text-muted')} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </Card>
  )
}

/** A button on the follow-up, as the form holds it. */
interface ReplyDraft {
  label: string
  does: FollowUpReply['does']
  topic: ReportTopic
  note: string
  tick: ReportTick
}
const replyDraft = (b?: FollowUpReply): ReplyDraft => ({
  label: b?.label ?? '',
  does: b?.does ?? 'note',
  topic: b && 'topic' in b ? b.topic : 'work',
  note: b?.does === 'note' ? b.note : '',
  tick: b?.does === 'tick' ? b.tick : 'left',
})
const DOES: { key: FollowUpReply['does']; label: string }[] = [
  { key: 'note', label: 'Writes a line' },
  { key: 'talk', label: 'Opens the mic' },
  { key: 'tick', label: 'Ticks it, moves the sentence' },
  { key: 'skip', label: 'Adds nothing' },
]

function Editor({ rule, onDone }: { rule?: FirmFollowUp; onDone: () => void }) {
  const { client } = useArdent()
  const { data: priceList } = useQuery((c) => c.priceList.list())
  const pick = <T,>(test: (c: FollowUpCheck) => c is FollowUpCheck & T) => rule?.when.find(test) as T | undefined
  const [name, setName] = useState(rule?.name ?? '')
  const [trades, setTrades] = useState<Trade[]>(rule?.trades ?? [])
  const [after, setAfter] = useState<ReportTopic[] | 'any'>(rule?.after ?? 'any')
  const [says, setSays] = useState(pick((c): c is { says: string[] } => 'says' in c)?.says.join(', ') ?? '')
  const [unless, setUnless] = useState(pick((c): c is { unless: string[] } => 'unless' in c)?.unless.join(', ') ?? '')
  const [nowhere, setNowhere] = useState(pick((c): c is { nowhere: string[] } => 'nowhere' in c)?.nowhere.join(', ') ?? '')
  const [notTicked, setNotTicked] = useState<ReportTick | ''>(pick((c): c is { notTicked: ReportTick } => 'notTicked' in c)?.notTicked ?? '')
  const [none, setNone] = useState<'' | 'readings' | 'parts'>(rule?.when.some((c) => 'noReadings' in c) ? 'readings' : rule?.when.some((c) => 'noParts' in c) ? 'parts' : '')
  const [quote, setQuote] = useState(rule ? rule.ask.includes('{said}') : true)
  const [ask, setAsk] = useState((rule?.ask ?? '').replace(/^You said “\{said\}”\s*/, ''))
  const [hint, setHint] = useState(rule?.hint ?? '')
  const [why, setWhy] = useState(rule?.why ?? '')
  const [replies, setReplies] = useState<ReplyDraft[]>(rule ? rule.replies.map(replyDraft) : [{ ...replyDraft(), label: 'Yes' }, { ...replyDraft(), label: 'No', does: 'skip' }])
  const [shared, setShared] = useState(!!rule?.shared)
  const [said, setSaid] = useState('')
  const [busy, setBusy] = useState(false)

  const draft = useMemo((): Omit<FollowUp, 'id'> => {
    const when: FollowUpCheck[] = []
    if (words(says).length) when.push({ says: words(says) })
    if (words(unless).length) when.push({ unless: words(unless) })
    if (words(nowhere).length) when.push({ nowhere: words(nowhere) })
    if (notTicked) when.push({ notTicked })
    if (none === 'readings') when.push({ noReadings: true })
    if (none === 'parts') when.push({ noParts: true })
    const listens = words(says).length > 0
    return {
      name: name.trim(),
      why: why.trim(),
      ...(hint.trim() ? { hint: hint.trim() } : {}),
      ...(trades.length ? { trades } : {}),
      after,
      when,
      ask: `${quote && listens ? 'You said “{said}” ' : ''}${ask.trim()}`,
      replies: replies
        .filter((b) => b.label.trim())
        .map((b): FollowUpReply => {
          const label = b.label.trim()
          if (b.does === 'note') return { label, does: 'note', topic: b.topic, note: b.note.trim() }
          if (b.does === 'talk') return { label, does: 'talk', topic: b.topic }
          if (b.does === 'tick') return { label, does: 'tick', tick: b.tick, move: true }
          return { label, does: 'skip' }
        }),
    }
  }, [name, why, hint, trades, after, says, unless, nowhere, notTicked, none, quote, ask, replies])
  const problem = ruleProblem({ ...draft, id: 'draft' })

  // Try it: what an engineer might say, checked against this rule alone.
  const trial = useMemo(() => {
    if (problem || !said.trim()) return undefined
    const t = trades[0] ?? 'gas'
    const answering = after === 'any' ? 'work' : after[0]
    const segments = [{ text: said.trim(), at: new Date().toISOString(), topic: answering }]
    const built = buildReport({ segments, trade: t, priceList: priceList ?? [], van: [] })
    const ticked = TICKS.map((x) => x.tick).filter((x) => x !== notTicked)
    return explain({ ...draft, id: 'draft' }, { trade: t, answering, segments, report: withTicks(built, built.parts, notTicked ? ticked : []) })
  }, [draft, problem, said, trades, after, notTicked, priceList])

  const save = async () => {
    if (problem) return
    setBusy(true)
    const done = await act(client.followUps.save({ ...draft, ...(rule ? { id: rule.id } : {}), shared }), rule ? `“${draft.name}” changed` : `“${draft.name}” added. Engineers get it next time their phone has signal`)
    setBusy(false)
    if (done) onDone()
  }
  const setReply = (i: number, p: Partial<ReplyDraft>) => setReplies(replies.map((b, j) => (j === i ? { ...b, ...p } : b)))
  const toggleTopic = (t: ReportTopic) => {
    const list = after === 'any' ? [] : after
    const next = list.includes(t) ? list.filter((x) => x !== t) : TOPICS.filter((x) => x === t || list.includes(x))
    setAfter(next.length ? next : 'any')
  }

  return (
    <Card className="flex flex-col gap-6 p-6">
      <SectionHead title={rule ? `Change “${rule.name}”` : 'Add a question'} className="pb-0" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Field label="Name" htmlFor="q-name">
          <input id="q-name" className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Gas meter left off" />
        </Field>
        <Field label="Why Ardent asks" htmlFor="q-why">
          <input id="q-why" className={fieldClass} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="For example: A customer left without gas rings the office first" />
        </Field>
        <Field label="For which trades">
          <div className="flex flex-wrap gap-2">
            <Pill small on={trades.length === 0} onClick={() => setTrades([])}>
              Every trade
            </Pill>
            {TRADES.slice(0, 6).map((t) => (
              <Pill key={t} small on={trades.includes(t)} onClick={() => setTrades(trades.includes(t) ? trades.filter((x) => x !== t) : [...trades, t])}>
                {tradeName(t)}
              </Pill>
            ))}
          </div>
        </Field>
        <Field label="Listens after">
          <div className="flex flex-wrap gap-2">
            <Pill small on={after === 'any'} onClick={() => setAfter('any')}>
              Any answer
            </Pill>
            {TOPICS.map((t) => (
              <Pill key={t} small on={after !== 'any' && after.includes(t)} onClick={() => toggleTopic(t)}>
                {topicName(t)}
              </Pill>
            ))}
          </div>
        </Field>
        <Field label="When the answer says any of" htmlFor="q-says">
          <input id="q-says" className={fieldClass} value={says} onChange={(e) => setSays(e.target.value)} placeholder="Commas between: meter off, off at the meter" />
        </Field>
        <Field label="Unless that sentence also says" htmlFor="q-unless">
          <input id="q-unless" className={fieldClass} value={unless} onChange={(e) => setUnless(e.target.value)} placeholder="Optional" disabled={!words(says).length} />
        </Field>
        <Field label="Unless the report already says" htmlFor="q-nowhere">
          <input id="q-nowhere" className={fieldClass} value={nowhere} onChange={(e) => setNowhere(e.target.value)} placeholder="Optional: back on, turned back on" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Only if not ticked" htmlFor="q-tick">
            <select id="q-tick" className={selectClass} value={notTicked} onChange={(e) => setNotTicked(e.target.value as ReportTick | '')}>
              <option value="">Any ticks</option>
              {TICKS.map((t) => (
                <option key={t.tick} value={t.tick}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Only if the report has no" htmlFor="q-none">
            <select id="q-none" className={selectClass} value={none} onChange={(e) => setNone(e.target.value as typeof none)}>
              <option value="">No condition</option>
              <option value="readings">Readings</option>
              <option value="parts">Parts</option>
            </select>
          </Field>
        </div>
        <Field label="Question" htmlFor="q-ask" className="lg:col-span-2">
          <input id="q-ask" className={fieldClass} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="For example: Did you turn the gas back on at the meter?" />
          {words(says).length > 0 && (
            <label className="mt-1 flex items-center gap-2 text-[13px] text-muted">
              <input type="checkbox" checked={quote} onChange={(e) => setQuote(e.target.checked)} className="accent-[var(--color-foreground)]" />
              Start by quoting what they said: You said “…”
            </label>
          )}
        </Field>
        <Field label="Hint under the question" htmlFor="q-hint" className="lg:col-span-2">
          <input id="q-hint" className={fieldClass} value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Optional" />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <span className="cap">Buttons the engineer sees</span>
        {replies.map((b, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-[12px] bg-inset/60 p-2 sm:grid-cols-[1fr_220px_minmax(0,1.4fr)_auto]">
            <input className={fieldClass} value={b.label} onChange={(e) => setReply(i, { label: e.target.value })} placeholder={`Button ${i + 1}`} aria-label={`Button ${i + 1} label`} />
            <select className={selectClass} value={b.does} onChange={(e) => setReply(i, { does: e.target.value as ReplyDraft['does'] })} aria-label={`What button ${i + 1} does`}>
              {DOES.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
            <div className="flex min-w-0 gap-2">
              {b.does === 'note' && <input className={fieldClass} value={b.note} onChange={(e) => setReply(i, { note: e.target.value })} placeholder="The line it writes" aria-label={`Line button ${i + 1} writes`} />}
              {(b.does === 'note' || b.does === 'talk') && (
                <select className={cn(selectClass, b.does === 'note' && 'max-w-[170px]')} value={b.topic} onChange={(e) => setReply(i, { topic: e.target.value as ReportTopic })} aria-label={`Where button ${i + 1} puts it`}>
                  {TOPICS.map((t) => (
                    <option key={t} value={t}>
                      Under {topicName(t)}
                    </option>
                  ))}
                </select>
              )}
              {b.does === 'tick' && (
                <select className={selectClass} value={b.tick} onChange={(e) => setReply(i, { tick: e.target.value as ReportTick })} aria-label={`What button ${i + 1} ticks`}>
                  {TICKS.map((t) => (
                    <option key={t.tick} value={t.tick}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <button type="button" className={cn(greyButton, 'text-muted')} onClick={() => setReplies(replies.filter((_, j) => j !== i))} disabled={replies.length <= 2}>
              Remove
            </button>
          </div>
        ))}
        {replies.length < 4 && (
          <button type="button" className={cn(greyButton, 'self-start')} onClick={() => setReplies([...replies, replyDraft()])}>
            Add a button
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-[12px] bg-inset/60 p-4">
        <span className="cap">Try it</span>
        <textarea className={cn(fieldClass, 'h-20 py-2.5')} value={said} onChange={(e) => setSaid(e.target.value)} placeholder="Type what an engineer might say" aria-label="What an engineer might say" />
        {trial && (
          <div className="flex flex-col gap-1 text-[13px]">
            <span className={trial.asks ? 'text-foreground' : 'text-muted'}>{trial.asks ? `Ardent asks: “${trial.question}”` : 'Ardent would not ask this.'}</span>
            {trial.checks
              .filter((c) => !/^For |^After /.test(c.text))
              .map((c, i) => (
                <span key={i} className={c.ok ? 'text-muted' : 'text-warn'}>
                  {c.ok ? '✓' : '✗'} {c.text}
                </span>
              ))}
          </div>
        )}
      </div>

      <label className="flex items-start gap-3 text-[14px]">
        <Switch checked={shared} onCheckedChange={setShared} aria-label="Offer it to Ardent" className={cn(quietSwitch, 'mt-0.5')} />
        <span>
          Offer it to Ardent
          <span className="block text-[13px] text-muted">Ardent's team can see it and may add it to the playbook for every firm. Your firm's name stays private.</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={cn(greyButton, 'bg-foreground text-background hover:bg-white')} onClick={() => void save()} disabled={!!problem || busy}>
          {busy ? 'Saving' : rule ? 'Save the change' : 'Add the question'}
        </button>
        <button type="button" className={greyButton} onClick={onDone}>
          Cancel
        </button>
        {problem && <span className="text-[13px] text-muted">{problem}</span>}
      </div>
    </Card>
  )
}

import { useMemo, useState } from 'react'
import { trade as TRADE_NAME } from '@kit'
import { describeCheck, describeReply, explain, ruleProblem, topicName } from '@kit/questions.ts'
import { buildReport, TICKS, withTicks } from '@kit/report.ts'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, SectionHead } from '@/components/ardent/parts'
import { Pill } from '@/components/ardent/book-parts'
import { greyButton } from '@/components/ardent/money-lib'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Field, fieldClass, selectClass } from '@/components/ui/field'
import type { HqPlaybook, PlaybookRule } from '@/data/hq'
import type { FollowUp, FollowUpCheck, FollowUpReply, ReportTick, ReportTopic, Trade } from '@/data/model'
import { act } from '@/lib/act'
import { cn } from '@/lib/utils'
import { useHq, useHqQuery } from './data'
import { Failed, Loading, Tag, when } from './parts'

/*
 * Ardent's playbook: the follow-up questions every firm's engineers get in
 * their job reports. Changes wait in a draft until someone publishes them to
 * every firm; phones pick them up next time they have signal, no app update.
 */

const TRADES: Trade[] = ['gas', 'heating', 'plumbing', 'electrical', 'fire', 'hvac']
const tradeName = (t: Trade) => TRADE_NAME[t] ?? t
const TOPICS: ReportTopic[] = ['work', 'parts', 'tests', 'left', 'next']
const words = (v: string) => v.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)
const white = 'bg-foreground text-background hover:bg-white'

export function Playbook() {
  const { hq, me } = useHq()
  const { data, error } = useHqQuery((c) => c.playbook.get())
  const [trade, setTrade] = useState<Trade | 'all'>('all')
  const [editing, setEditing] = useState<PlaybookRule | 'new'>()
  const [publishing, setPublishing] = useState(false)
  const admin = me?.role === 'admin'

  if (!data) return error ? <Failed error={error} /> : <Loading className="mt-8" />
  const fits = (r: FollowUp) => trade === 'all' || !r.trades || r.trades.includes(trade)
  const rules = data.rules.filter(fits)
  const flip = (r: PlaybookRule, on: boolean) => void act(hq.playbook.switch(r.id, on), `“${r.name}” ${on ? 'back on' : 'off'} for everyone, in the draft`)

  return (
    <div className="flex flex-col gap-8 pb-6">
      <PageBar crumbs={[{ label: 'Playbook' }]} />
      <PageHead
        title="Playbook"
        eyebrow={
          <>
            <span>Version {data.version}</span>
            {data.publishedAt && (
              <>
                <span className="text-faint">·</span>
                <span>
                  Published {when(data.publishedAt)} by {data.by}
                </span>
              </>
            )}
            <span className="text-faint">·</span>
            <span>Reaches {data.firms} firms</span>
          </>
        }
        sub="The follow-up questions every firm's engineers get after each answer in a job report. Change them here; nothing reaches a firm until you publish."
        className="pb-0"
        aside={admin && !editing && <Button variant="outline" onClick={() => setEditing('new')}>Add a question</Button>}
      />

      {data.draft && <DraftBar data={data} admin={admin} onPublish={() => setPublishing(true)} />}
      {!admin && <p className="text-[13px] text-muted">Only Ardent admins change the playbook. You can look at everything.</p>}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Show questions for">
        <Pill on={trade === 'all'} onClick={() => setTrade('all')} small>
          Every trade
        </Pill>
        {TRADES.map((t) => (
          <Pill key={t} on={trade === t} onClick={() => setTrade(t)} small>
            {tradeName(t)}
          </Pill>
        ))}
      </div>

      {editing && <Editor key={editing === 'new' ? 'new' : editing.id} rule={editing === 'new' ? undefined : editing} taken={data.rules.map((r) => r.id)} onDone={() => setEditing(undefined)} />}

      <section>
        <SectionHead title={`Questions · ${rules.length}`} aside="Checked top to bottom after each answer, at most 3 for one answer" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rules.map((r) => (
            <RuleCard key={r.id} rule={r} firms={data.firms} admin={admin} onEdit={() => setEditing(r)} onSwitch={(on) => flip(r, on)} />
          ))}
        </div>
      </section>

      <section>
        <SectionHead title="Versions" />
        <Card className="p-4">
          {data.history.length === 0 ? (
            <p className="py-2 text-[14px] text-muted">Version {data.version} is the one Ardent started with. Nothing published since.</p>
          ) : (
            <ol className="rows">
              {[...data.history]
                .sort((a, b) => b.version - a.version)
                .map((v) => (
                  <li key={v.version} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                    <span className="w-[90px] shrink-0 font-mono text-[13px]">Version {v.version}</span>
                    <span className="min-w-0 flex-1 text-[14px]">{v.note || 'No note'}</span>
                    <span className="shrink-0 font-mono text-[12px] text-muted">
                      {when(v.publishedAt)} · {v.by}
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </Card>
      </section>

      <PublishDialog data={data} open={publishing} onClose={() => setPublishing(false)} />
    </div>
  )
}

/** The draft waiting to go out: the one ember thing on the page. */
function DraftBar({ data, admin, onPublish }: { data: HqPlaybook; admin: boolean; onPublish: () => void }) {
  const { hq } = useHq()
  const draft = data.draft!
  const [open, setOpen] = useState(true)
  return (
    <Card className="flex flex-col gap-3 bg-raised p-5 shadow-[0_20px_60px_rgba(0,0,0,.45)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px]">
            {draft.changes.length} {draft.changes.length === 1 ? 'change' : 'changes'} waiting
          </p>
          <p className="text-[13px] text-muted">
            Firms still have version {data.version}. Last change by {draft.by}, {when(draft.updatedAt)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={cn(greyButton, 'bg-[#262626] hover:bg-[#2e2e2e]')} onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Hide changes' : 'Show changes'}
          </button>
          {admin && (
            <>
              <button type="button" className={cn(greyButton, 'bg-[#262626] hover:bg-[#2e2e2e]')} onClick={() => void act(hq.playbook.discard(), 'Draft thrown away. Firms keep the published playbook')}>
                Discard
              </button>
              <Button variant="ember" className="h-10 rounded-[10px] px-4" onClick={onPublish}>
                Publish to every firm
              </Button>
            </>
          )}
        </div>
      </div>
      {open && (
        <ul className="flex flex-col gap-1 text-[13.5px]">
          {draft.changes.map((c, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="font-mono text-[12px] text-muted">{i + 1}</span>
              {c}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function PublishDialog({ data, open, onClose }: { data: HqPlaybook; open: boolean; onClose: () => void }) {
  const { hq } = useHq()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = data.draft?.changes.length ?? 0
  const go = async () => {
    setBusy(true)
    const done = await act(hq.playbook.publish(note.trim()), `Version ${data.version + 1} published to ${data.firms} firms`)
    setBusy(false)
    if (done) {
      setNote('')
      onClose()
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px] p-6">
        <DialogTitle className="text-[18px] font-normal">Publish version {data.version + 1} to every firm?</DialogTitle>
        <DialogDescription asChild>
          <div className="mt-3 flex flex-col gap-2 text-[14px] text-muted">
            <p>
              {n} {n === 1 ? 'change goes' : 'changes go'} to all {data.firms} firms at once. Engineers' phones pick it up the next time they have signal. Nobody needs an app update.
            </p>
            <p>A question a firm switched off for itself stays off for that firm.</p>
          </div>
        </DialogDescription>
        <Field label="What changed, for the history" htmlFor="pub-note" className="mt-5">
          <input id="pub-note" className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: Loft hatch question from Ashby" />
        </Field>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className={greyButton} onClick={onClose}>
            Not yet
          </button>
          <Button variant="ember" className="h-10 rounded-[10px] px-4" disabled={busy || !n} onClick={() => void go()}>
            {busy ? 'Publishing' : `Publish to ${data.firms} firms`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const stateTag: Record<Exclude<PlaybookRule['state'], 'published'>, string> = { changed: 'Changed', new: 'New', off: 'Off' }

function RuleCard({ rule, firms, admin, onEdit, onSwitch }: { rule: PlaybookRule; firms: number; admin: boolean; onEdit: () => void; onSwitch: (on: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const on = !rule.off
  const rate = rule.stats.asked ? Math.round((rule.stats.answered / rule.stats.asked) * 100) : undefined
  return (
    <Card className={cn('flex flex-col gap-3 p-5', !on && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[15px]">{rule.name}</h3>
          <p className="font-mono text-[11px] tracking-[.06em] text-muted uppercase">
            {rule.trades ? rule.trades.map(tradeName).join(', ') : 'Every trade'} · after {rule.after === 'any' ? 'any answer' : rule.after.map(topicName).join(', ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {rule.state !== 'published' && <Tag tone="info">{stateTag[rule.state]}, not sent</Tag>}
          {rule.state === 'published' && rule.off && <Tag>Off for everyone</Tag>}
          {rule.from && <Tag tone="violet">From {rule.from.firmName.split(' ')[0]}</Tag>}
        </div>
      </div>
      <p className="text-[15px] leading-[22px] text-foreground">“{rule.ask.replace('{said}', '…what they said…')}”</p>
      <div className="flex flex-wrap gap-1.5">
        {rule.replies.map((b) => (
          <span key={b.label} className="inline-flex h-7 items-center rounded-full bg-raised px-3 text-[12.5px]">
            {b.label}
          </span>
        ))}
      </div>
      <dl className="grid grid-cols-3 gap-2 rounded-[10px] bg-inset px-3.5 py-3">
        <div>
          <dt className="cap text-[10px]">Asked, 30 days</dt>
          <dd className="op-number mt-1.5 text-[18px]">{rule.stats.asked}</dd>
        </div>
        <div>
          <dt className="cap text-[10px]">Answered</dt>
          <dd className="op-number mt-1.5 text-[18px]">
            {rule.stats.answered}
            {rate !== undefined && <span className="ml-1.5 font-mono text-[11px] text-muted">{rate}%</span>}
          </dd>
        </div>
        <div>
          <dt className="cap text-[10px]">Switched off</dt>
          <dd className={cn('op-number mt-1.5 text-[18px]', rule.stats.switchedOff > 0 && 'text-warn')}>
            {rule.stats.switchedOff}
            <span className="ml-1.5 font-mono text-[11px] text-muted">of {firms}</span>
          </dd>
        </div>
      </dl>
      {open && (
        <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          <dt className="cap pt-0.5">When</dt>
          <dd className="flex flex-col gap-0.5 text-muted">
            {rule.when.map((c, i) => (
              <span key={i}>{describeCheck(c)}</span>
            ))}
          </dd>
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
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={greyButton} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Less' : 'How it decides'}
        </button>
        {admin && (
          <>
            <button type="button" className={greyButton} onClick={onEdit}>
              Change
            </button>
            <button type="button" className={cn(greyButton, 'text-muted')} onClick={() => onSwitch(!on)}>
              {on ? 'Switch off for everyone' : 'Switch back on'}
            </button>
          </>
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

/** Core's question form, writing to the playbook draft instead of one firm. */
function Editor({ rule, taken, onDone }: { rule?: PlaybookRule; taken: string[]; onDone: () => void }) {
  const { hq } = useHq()
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
    const built = buildReport({ segments, trade: t, priceList: [], van: [] })
    const ticked = TICKS.map((x) => x.tick).filter((x) => x !== notTicked)
    return explain({ ...draft, id: 'draft' }, { trade: t, answering, segments, report: withTicks(built, built.parts, notTicked ? ticked : []) })
  }, [draft, problem, said, trades, after, notTicked])

  const save = async () => {
    if (problem) return
    setBusy(true)
    // A new rule gets a short id from its name, kept apart from every id already in the playbook.
    const base = `pb-${draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`
    let id = rule?.id ?? base
    for (let n = 2; !rule && taken.includes(id); n++) id = `${base}-${n}`
    const done = await act(hq.playbook.save({ ...draft, id }), rule ? `“${draft.name}” changed in the draft` : `“${draft.name}” added to the draft`)
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
    <Card className="flex flex-col gap-6 p-5 sm:p-6">
      <SectionHead title={rule ? `Change “${rule.name}”` : 'Add a question to the playbook'} aside="Goes in the draft. Firms get it when you publish." className="pb-0" />
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
            {TRADES.map((t) => (
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <div key={i} className="grid grid-cols-1 gap-2 rounded-[12px] bg-inset/60 p-2 sm:grid-cols-[1fr_200px_minmax(0,1.4fr)_auto]">
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
                <select className={cn(selectClass, b.does === 'note' && 'max-w-[160px]')} value={b.topic} onChange={(e) => setReply(i, { topic: e.target.value as ReportTopic })} aria-label={`Where button ${i + 1} puts it`}>
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

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={cn(greyButton, white)} onClick={() => void save()} disabled={!!problem || busy}>
          {busy ? 'Saving' : rule ? 'Save to the draft' : 'Add to the draft'}
        </button>
        <button type="button" className={greyButton} onClick={onDone}>
          Cancel
        </button>
        {problem && <span className="text-[13px] text-muted">{problem}</span>}
      </div>
    </Card>
  )
}

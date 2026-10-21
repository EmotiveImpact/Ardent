import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { pounds, shortDate, totals } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Icon } from '@/components/layout/icons'
import { Card, PageHead, SectionHead, type Figure } from '@/components/ardent/parts'
import { EmberButton, Fact, GreyButton, LineTable, MoneyLoading, StateMark } from '@/components/ardent/money-parts'
import { capDate, greyButton, quoteState } from '@/components/ardent/money-lib'
import { solidButton } from '@/components/ardent/people-kit'
import { kinds, kindWord, matchItems, penceOf, unitWord, usePriceList } from '@/components/ardent/price-parts'
import { fieldClass } from '@/components/ui/field'
import { LinkBox, usePayments } from '@/components/ardent/pay-parts'
import { useArdent, useBook, type Book } from '@/data/ardent'
import type { LineItem, OptionKey, PriceItem, Quote } from '@/data/model'
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
  // Keyed on the state too, so a draft being edited starts fresh once sent, and an answer shows the option chosen.
  return <QuotePage key={`${q.id}:${q.status}`} q={q} book={book} />
}

const KEYS: OptionKey[] = ['A', 'B', 'C']

/** A line being written on a draft. The quantity stays as typed until it's saved. */
interface DraftLine {
  key: string
  kind: LineItem['kind']
  description: string
  qty: string
  unitPrice: number
  itemId?: string
}

/** One way of doing the work, or the whole quote when it has no options. */
interface Choice {
  key: OptionKey
  label: string
  lines: DraftLine[]
}

let seq = 0
const lineKey = () => `dl${++seq}`
const fromLines = (lines: LineItem[]): DraftLine[] => lines.map((l) => ({ key: lineKey(), kind: l.kind, description: l.description, qty: String(l.quantity), unitPrice: l.unitPrice, itemId: l.itemId }))
const toLines = (lines: DraftLine[]): Omit<LineItem, 'id'>[] => lines.map((l) => ({ kind: l.kind, description: l.description, quantity: Number(l.qty), unitPrice: l.unitPrice, ...(l.itemId ? { itemId: l.itemId } : {}) }))
const choicesOf = (q: Quote): Choice[] => (q.options ? q.options.map((o) => ({ key: o.key, label: o.label, lines: fromLines(o.lines) })) : [{ key: 'A', label: '', lines: fromLines(q.lines) }])
const sumsOf = (lines: DraftLine[]) => totals({ lines: lines.map((l) => ({ quantity: Number(l.qty) || 0, unitPrice: l.unitPrice })) })
/** What a draft says, without the keys, so a saved draft and an edited one can be compared. */
const shape = (options: boolean, choices: Choice[]) => JSON.stringify(options ? choices.map((c) => [c.label.trim(), toLines(c.lines)]) : toLines(choices[0]?.lines ?? []))

/** What still stops a draft being saved, in a few words. */
function gapOf(options: boolean, choices: Choice[]) {
  for (const c of choices) {
    if (options && !c.label.trim()) return `a name for option ${c.key}`
    if (options && !c.lines.length) return `a line on option ${c.key}`
    if (c.lines.some((l) => !(Number(l.qty) > 0))) return 'a quantity on every line'
  }
  return undefined
}

/** The draft being edited: one set of lines, or two or three named options. Saved with quotes.update. */
function useDraft(q: Quote) {
  const { client } = useArdent()
  const [options, setOptions] = useState(!!q.options)
  const [choices, setChoices] = useState(() => choicesOf(q))
  const dirty = shape(options, choices) !== shape(!!q.options, choicesOf(q))
  const missing = gapOf(options, choices)
  const save = async (say = true) => {
    if (missing) return false
    const patch = options ? { options: choices.map((c) => ({ key: c.key, label: c.label.trim(), lines: toLines(c.lines) })) } : { options: null, lines: toLines(choices[0].lines) }
    return !!(await act(client.quotes.update(q.id, patch), say ? `${q.ref} saved` : undefined))
  }
  const undo = () => {
    setOptions(!!q.options)
    setChoices(choicesOf(q))
  }
  return { options, setOptions, choices, setChoices, dirty, missing, save, undo }
}

type Draft = ReturnType<typeof useDraft>

function QuotePage({ q, book }: { q: Quote; book: Book }) {
  const job = find(book.jobs, q.jobId)
  const c = find(book.customers, q.customerId)
  const site = find(book.sites, job?.siteId)
  const ed = useDraft(q)
  const [pick, setPick] = useState<OptionKey>(q.chosen ?? 'A')
  const draft = q.status === 'draft'
  const st = quoteState(q, today())
  const till = capDate(`${q.validUntil}T12:00:00Z`)

  // What's on screen: the draft as it's being edited, or the quote as it was sent.
  const options = draft ? ed.options : !!q.options
  const sets = draft ? ed.choices.map((x) => ({ key: x.key, label: x.label, total: sumsOf(x.lines).total })) : (q.options ?? []).map((o) => ({ key: o.key, label: o.label, total: totals(o).total }))
  const at = sets.find((s) => s.key === pick) ?? sets[0]
  const sums = draft ? sumsOf((ed.choices.find((x) => x.key === at?.key) ?? ed.choices[0]).lines) : totals(q)
  const spread = sets.map((s) => s.total)
  const figures: Figure[] =
    options && !q.chosen
      ? [
          { label: 'From', value: pounds(Math.min(...spread)) },
          { label: 'Up to', value: pounds(Math.max(...spread)) },
        ]
      : [
          { label: 'Total', value: pounds(sums.total) },
          { label: 'Before VAT', value: pounds(sums.net) },
        ]
  figures.push({ label: 'Good till', value: till, tone: st.dot === 'warn' ? 'warn' : undefined })

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
            {c ? `, for ${c.name}` : ''}.{options && !q.chosen && ` ${sets.length === 3 ? 'Three' : 'Two'} ways of doing it, priced on their own.`}
          </span>
        }
        figures={figures}
        className="pb-0"
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <Card className="min-w-0 px-4 py-5 sm:px-[22px] xl:col-span-2">
          <SectionHead
            title={options ? `Options · ${sets.length}` : 'Line by line'}
            aside={options ? (q.chosen ? `They chose ${q.chosen}` : 'They pick one. Each has its own price.') : undefined}
            className="pb-3"
          />
          {options && at && <OptionTiles sets={sets} pick={at.key} setPick={setPick} chosen={q.chosen} onAdd={draft && sets.length < 3 ? () => setPick(addOption(ed)) : undefined} />}
          {draft ? (
            <DraftEditor ed={ed} at={at?.key ?? 'A'} setPick={setPick} />
          ) : (
            <div id="option-lines" role={options ? 'tabpanel' : undefined} aria-label={options && at ? `Option ${at.key}` : undefined}>
              <LineTable lines={q.options?.find((o) => o.key === at?.key)?.lines ?? q.lines} totalLabel={options && at ? `Option ${at.key}` : 'Total'} showKind />
            </div>
          )}
        </Card>
        <SendCard q={q} book={book} ed={ed} />
      </div>
    </div>
  )
}

/** Add the next option, starting as a copy of the last one's lines. Hands back its key. */
function addOption(ed: Draft): OptionKey {
  const last = ed.choices[ed.choices.length - 1]
  const key = KEYS[ed.choices.length]
  ed.setChoices([...ed.choices, { key, label: '', lines: last.lines.map((l) => ({ ...l, key: lineKey() })) }])
  return key
}

/** One tile per option: its name and its price. Picking one shows its lines below. */
function OptionTiles({ sets, pick, setPick, chosen, onAdd }: { sets: { key: OptionKey; label: string; total: number }[]; pick: OptionKey; setPick: (k: OptionKey) => void; chosen?: OptionKey; onAdd?: () => void }) {
  return (
    <div role="tablist" aria-label="Options" className="grid grid-cols-1 gap-2 pb-4 sm:grid-cols-3">
      {sets.map((s) => {
        const on = s.key === pick
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls="option-lines"
            onClick={() => setPick(s.key)}
            className={cn(
              'flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-[10px] px-3.5 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 sm:flex-col sm:items-start',
              on ? 'bg-raised' : 'bg-inset hover:bg-[#101010]',
              chosen && chosen !== s.key && 'opacity-55',
            )}
          >
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="cap flex items-center gap-2.5 text-[11px]">
                Option {s.key}
                {chosen === s.key && (
                  <StateMark dot="ok" className="text-foreground">
                    Chosen
                  </StateMark>
                )}
              </span>
              <span className={cn('truncate text-[14px]', !s.label.trim() && 'text-faint')}>{s.label.trim() || 'Not named yet'}</span>
            </span>
            <span className="op-number shrink-0 text-[18px]">{pounds(s.total, { always: true })}</span>
          </button>
        )
      })}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-inset px-3.5 py-3 text-[13px] text-muted outline-none transition-colors hover:bg-[#101010] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Icon name="plus" className="size-4" /> Add option {KEYS[sets.length]}
        </button>
      )}
    </div>
  )
}

/** A draft's lines, or the picked option's name and lines, with the buttons that save or offer options. */
function DraftEditor({ ed, at, setPick }: { ed: Draft; at: OptionKey; setPick: (k: OptionKey) => void }) {
  const choice = ed.choices.find((x) => x.key === at) ?? ed.choices[0]
  const change = (next: Partial<Choice>) => ed.setChoices(ed.choices.map((x) => (x.key === choice.key ? { ...x, ...next } : x)))

  const offer = () => {
    const first = ed.choices[0]
    ed.setOptions(true)
    ed.setChoices([
      { key: 'A', label: first.label, lines: first.lines },
      { key: 'B', label: '', lines: first.lines.map((l) => ({ ...l, key: lineKey() })) },
    ])
    setPick('A')
  }
  const remove = () => {
    const rest = ed.choices.filter((x) => x.key !== choice.key).map((x, i) => ({ ...x, key: KEYS[i] }))
    if (rest.length === 1) ed.setOptions(false)
    ed.setChoices(rest)
    setPick('A')
  }

  return (
    <div id="option-lines" role={ed.options ? 'tabpanel' : undefined} aria-label={ed.options ? `Option ${choice.key}` : undefined} className="flex flex-col">
      {ed.options && (
        <label className="flex flex-col gap-2 pb-4">
          <span className="cap">Name of option {choice.key}</span>
          <input value={choice.label} onChange={(e) => change({ label: e.target.value })} placeholder={['Repair it', 'Replace it', 'Replace and upgrade'][KEYS.indexOf(choice.key)]} className={fieldClass} />
        </label>
      )}
      <EditLines lines={choice.lines} set={(lines) => change({ lines })} totalLabel={ed.options ? `Option ${choice.key}` : 'Total'} />

      <div className="mt-4 flex flex-wrap items-center gap-2 pt-4 shadow-[inset_0_1px_0_var(--line)]">
        {ed.options ? (
          <GreyButton onClick={remove}>{ed.choices.length === 2 ? `Take off option ${choice.key}, back to one price` : `Take off option ${choice.key}`}</GreyButton>
        ) : (
          <>
            <GreyButton onClick={offer} disabled={!choice.lines.length}>
              Offer options
            </GreyButton>
            <span className="text-[12.5px] text-muted">Two or three ways of doing it, each with its own price. A starts as these lines.</span>
          </>
        )}
        {ed.dirty && (
          <span className="ml-auto flex items-center gap-2">
            <GreyButton onClick={ed.undo}>Undo changes</GreyButton>
            <button type="button" className={cn(solidButton, 'h-10 w-auto px-5 text-[13px]')} disabled={!!ed.missing} onClick={() => void ed.save()}>
              Save changes
            </button>
          </span>
        )}
      </div>
      {ed.dirty && ed.missing && <p className="pt-3 text-right text-[12.5px] text-warn">Still needs {ed.missing}.</p>}
    </div>
  )
}

const editCols = 'grid-cols-[minmax(0,1fr)_64px_44px] sm:grid-cols-[80px_minmax(0,1fr)_64px_90px_100px_44px]'

/** Lines you can change: quantity in place, take one off, add from the price list or typed. Totals like a printed quote. */
function EditLines({ lines, set, totalLabel }: { lines: DraftLine[]; set: (lines: DraftLine[]) => void; totalLabel: string }) {
  const sums = sumsOf(lines)
  return (
    <div className="flex flex-col">
      <div className={cn('cap grid gap-2.5 py-2.5 sm:gap-3.5', editCols)}>
        <span className="hidden sm:block">Kind</span>
        <span>Work</span>
        <span className="text-right">Qty</span>
        <span className="hidden text-right sm:block">Each</span>
        <span className="hidden text-right sm:block">Total</span>
        <span />
      </div>
      <div className="rows shadow-[inset_0_1px_0_var(--line)]">
        {lines.map((l) => {
          const each = pounds(l.unitPrice, { always: true })
          const line = pounds(Math.round((Number(l.qty) || 0) * l.unitPrice), { always: true })
          return (
            <div key={l.key} className={cn('grid items-center gap-2.5 py-1.5 sm:gap-3.5', editCols)}>
              <span className="hidden font-mono text-[11px] text-muted uppercase sm:block">{kindWord[l.kind]}</span>
              <span className="min-w-0">
                <span className="block text-[14px]">{l.description}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-muted sm:hidden">
                  {each} EACH <span className="text-faint">·</span> {line}
                </span>
              </span>
              <input
                aria-label={`Quantity of ${l.description}`}
                inputMode="decimal"
                value={l.qty}
                onChange={(e) => set(lines.map((x) => (x.key === l.key ? { ...x, qty: e.target.value.replace(/[^\d.]/g, '') } : x)))}
                className={cn(fieldClass, 'h-9 px-2.5 text-right font-mono text-[13px]', !(Number(l.qty) > 0) && 'text-warn')}
              />
              <span className="hidden text-right font-mono text-[13px] text-muted tabular sm:block">{each}</span>
              <span className="hidden text-right font-mono text-[13px] tabular sm:block">{line}</span>
              <button
                type="button"
                aria-label={`Take ${l.description} off`}
                title="Take it off"
                onClick={() => set(lines.filter((x) => x.key !== l.key))}
                className="flex size-11 items-center justify-center justify-self-end rounded-lg text-[17px] leading-none text-faint outline-none transition-colors hover:bg-raised hover:text-danger focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
      {!lines.length && <p className="py-4 text-[14px] text-muted shadow-[inset_0_1px_0_var(--line)]">No lines yet. Add the first one below.</p>}
      <AddLine onAdd={(l) => set([...lines, l])} />
      <dl className="mt-3 flex flex-col items-end gap-2 pt-3.5 font-mono text-[13px] text-muted uppercase shadow-[inset_0_1px_0_var(--line)]">
        <div className="flex gap-6 sm:gap-10">
          <dt>Subtotal</dt>
          <dd className="w-[110px] text-right text-foreground tabular">{pounds(sums.net, { always: true })}</dd>
        </div>
        <div className="flex gap-6 sm:gap-10">
          <dt>VAT 20%</dt>
          <dd className="w-[110px] text-right text-foreground tabular">{pounds(sums.vat, { always: true })}</dd>
        </div>
        <div className="flex items-baseline gap-6 sm:gap-10">
          <dt>{totalLabel}</dt>
          <dd className="w-[140px] text-right text-[22px] text-foreground tabular">{pounds(sums.total, { always: true })}</dd>
        </div>
      </dl>
    </div>
  )
}

/** A new line: pick it off the price list as you type, or write it out with a price. */
function AddLine({ onAdd }: { onAdd: (l: DraftLine) => void }) {
  const { data: items } = usePriceList()
  const [text, setText] = useState('')
  const [kind, setKind] = useState<LineItem['kind']>('labour')
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')
  const pence = penceOf(price)
  const matches = matchItems(items, text)
  const ready = !!text.trim() && pence !== undefined && pence > 0 && Number(qty) > 0
  const clear = () => {
    setText('')
    setQty('1')
    setPrice('')
  }
  const pick = (i: PriceItem) => {
    onAdd({ key: lineKey(), kind: i.kind, description: i.name, qty: Number(qty) > 0 ? qty : '1', unitPrice: i.price, itemId: i.id })
    clear()
  }

  return (
    <form
      className="flex flex-col gap-2 pt-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        onAdd({ key: lineKey(), kind, description: text.trim(), qty, unitPrice: pence! })
        clear()
      }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_64px_96px] gap-1.5 sm:grid-cols-[minmax(0,1fr)_120px_64px_96px_auto]">
        <input aria-label="Add a line: find it on the price list, or type it" placeholder="Add a line: type to find it on the price list" value={text} onChange={(e) => setText(e.target.value)} className={cn(fieldClass, 'col-span-3 sm:col-span-1')} autoComplete="off" />
        <select aria-label="Kind" className={fieldClass} value={kind} onChange={(e) => setKind(e.target.value as LineItem['kind'])}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {kindWord[k]}
            </option>
          ))}
        </select>
        <input aria-label="Quantity" inputMode="decimal" className={cn(fieldClass, 'text-right font-mono')} value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))} />
        <input aria-label="Price each in pounds, before VAT" placeholder="£ each" inputMode="decimal" className={cn(fieldClass, 'font-mono')} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
        <button type="submit" disabled={!ready} className={cn(greyButton, 'col-span-3 h-[42px] sm:col-span-1')}>
          Add line
        </button>
      </div>
      {matches.length > 0 && (
        <div className="flex flex-col gap-1 rounded-[10px] bg-inset p-1.5">
          <span className="cap px-2 pt-1.5 pb-1">On the price list</span>
          {matches.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => pick(i)}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left outline-none transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span className="min-w-0 flex-1 truncate text-[14px]">{i.name}</span>
              {i.code && <span className="hidden shrink-0 font-mono text-[11px] text-muted sm:inline">{i.code}</span>}
              <span className="shrink-0 font-mono text-[12px]">
                {pounds(i.price, { always: true })} <span className="text-muted">{unitWord[i.unit]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </form>
  )
}

const link = 'rounded-sm text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60'

/** What the customer gets, and the one thing to do next. */
function SendCard({ q, book, ed }: { q: Quote; book: Book; ed: Draft }) {
  const { client } = useArdent()
  const job = find(book.jobs, q.jobId)
  const c = find(book.customers, q.customerId)
  const who = c?.name.split(' ')[0] ?? 'the customer'
  const name = c?.kind === 'business' || c?.kind === 'letting_agent' ? c.name.replace(/^The /, '') : who
  // Accepting only books the job while it's still waiting on the answer.
  const books = !!job && (job.status === 'enquiry' || job.status === 'quoted')
  const chosen = q.options?.find((o) => o.key === q.chosen)
  const empty = !ed.choices.some((x) => x.lines.length)

  const send = async () => {
    if (ed.dirty && !(await ed.save(false))) return
    void act(client.quotes.send(q.id, 'email'), `${q.ref} ${ed.dirty ? 'saved and ' : ''}marked as sent to ${c?.name ?? 'the customer'}`)
  }
  const choose = (o: NonNullable<Quote['options']>[number]) =>
    void act(client.quotes.respond(q.id, 'accepted', o.key), `${q.ref}: ${who} chose ${o.key}, ${o.label}. ${books ? `${job!.ref} is booked at ${pounds(totals(o).total)}.` : ''}`.trim())

  return (
    <Card className="flex min-w-0 flex-col gap-3.5 px-[22px] py-5">
      <span className="cap">What {name} gets</span>
      <div className="rows">
        <Fact label="To">{c?.email ? c.email : c?.phone ? `${c.phone}, no email on file` : 'No contact on file'}</Fact>
        <Fact label="Sent">{q.sentAt ? <span className="font-mono">{capDate(q.sentAt)}</span> : 'Not yet'}</Fact>
        <Fact label="Good till">
          <span className="font-mono">{capDate(`${q.validUntil}T12:00:00Z`)}</span>
        </Fact>
        {(q.status === 'draft' ? ed.options : q.options) && <Fact label="Options">{q.status === 'draft' ? ed.choices.map((x) => x.key).join(', ') : q.options!.map((o) => o.key).join(', ')}</Fact>}
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
            Ardent doesn't email quotes yet. Send it your usual way, then mark it as sent here. If there's no answer after three days it shows up in Needs you.{' '}
            {ed.options ? `When they answer, pick the option they chose and ${job?.ref ?? 'the job'} moves to Booked with its lines.` : `When they say yes, ${job?.ref ?? 'the job'} moves to Booked with these lines.`}
          </p>
          {ed.dirty && ed.missing && <p className="text-[12.5px] text-warn">Still needs {ed.missing} before it can go.</p>}
          <EmberButton disabled={empty || (ed.dirty && !!ed.missing)} onClick={() => void send()}>
            Mark as sent
          </EmberButton>
        </>
      )}

      {q.status === 'sent' && q.options && (
        <>
          <p className="text-[13.5px] leading-[1.45] text-muted">What did {who} choose? {books ? `${job!.ref} moves to Booked with that option's lines.` : "That option's lines become the quote."}</p>
          <div className="flex flex-col gap-1.5">
            {q.options.map((o) => (
              <button key={o.key} type="button" onClick={() => choose(o)} className={cn(greyButton, 'h-auto min-h-11 w-full justify-between py-2.5 text-left')}>
                <span className="min-w-0">
                  They chose {o.key}, {o.label}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-muted">{pounds(totals(o).total)}</span>
              </button>
            ))}
          </div>
          <GreyButton onClick={() => void act(client.quotes.respond(q.id, 'declined'), `${q.ref} marked declined`)} className="h-11 w-full bg-inset text-muted hover:text-foreground">
            They said no to all of them
          </GreyButton>
        </>
      )}

      {q.status === 'sent' && !q.options && (
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
          Accepted.{chosen && ` They chose ${chosen.key}, ${chosen.label}.`}{' '}
          {job ? (
            <Link to={`/jobs/${job.id}`} className={link}>
              {job.ref}
            </Link>
          ) : (
            'The job'
          )}{' '}
          is booked with {chosen ? 'those' : 'these'} lines.
        </p>
      )}
      {q.status === 'sent' && <DepositNote q={q} />}
      {q.status === 'accepted' && <DepositPart q={q} book={book} />}
      {q.status === 'declined' && <p className="text-[13.5px] text-muted">{who} said no to this one.</p>}
      {q.status === 'expired' && <p className="text-[13.5px] text-muted">This quote ran out on {shortDate(`${q.validUntil}T12:00:00Z`)} without an answer.</p>}
    </Card>
  )
}

/** The deposit asked for when they said yes: its link while it's waiting, then paid, then taken off the invoice. */
function DepositPart({ q, book }: { q: Quote; book: Book }) {
  const { account, demo } = usePayments()
  const d = q.deposit
  if (!d) {
    if (!account || account.status !== 'active' || !account.depositPercent) return null
    return <p className="text-[12.5px] leading-[1.45] text-muted">No deposit on this one{account.depositFrom ? `: deposits start at ${pounds(account.depositFrom)}` : ''}.</p>
  }
  const inv = find(book.invoices, d.invoiceId)
  return (
    <div className="flex flex-col gap-3 pt-3.5 shadow-[inset_0_1px_0_var(--line)]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="cap">Deposit · {d.percent}%</span>
        <span className="font-mono text-[15px] tabular">{pounds(d.amount, { always: true })}</span>
      </div>
      {d.status === 'requested' && (
        <>
          <StateMark dot="warn" className="text-[13.5px]">
            Asked for, not paid yet
          </StateMark>
          {d.link && <LinkBox url={d.link.url} demo={demo} />}
          <p className="text-[12.5px] leading-[1.45] text-muted">Send it with your thanks for the yes. Once paid, it comes off the final invoice.</p>
        </>
      )}
      {d.status === 'paid' && (
        <>
          <StateMark dot="ok" className="text-[13.5px]">
            Paid{d.paidAt ? ` ${shortDate(d.paidAt)}` : ''}
          </StateMark>
          <p className="text-[12.5px] leading-[1.45] text-muted">It comes off the invoice for {find(book.jobs, q.jobId)?.ref ?? 'the job'} when that's drafted.</p>
        </>
      )}
      {d.status === 'deducted' && (
        <StateMark dot="ok" className="text-[13.5px]">
          <span>
            Paid{d.paidAt ? ` ${shortDate(d.paidAt)}` : ''}, taken off{' '}
            {inv ? (
              <Link to={`/invoices/${inv.id}`} className={link}>
                {inv.ref}
              </Link>
            ) : (
              'the invoice'
            )}
          </span>
        </StateMark>
      )}
    </div>
  )
}

/** Before the answer: whether a yes asks for a deposit. */
function DepositNote({ q }: { q: Quote }) {
  const { account } = usePayments()
  if (!account || account.status !== 'active' || !account.depositPercent) return null
  const all = q.options ? q.options.map((o) => totals(o).total) : [totals(q).total]
  const some = all.filter((t) => t >= account.depositFrom)
  if (!some.length) return null
  const what = some.length === all.length ? 'A yes' : `A yes to ${q.options!.filter((o) => totals(o).total >= account.depositFrom).map((o) => o.key).join(' or ')}`
  return <p className="text-[12.5px] leading-[1.45] text-muted">{what} asks them for a {account.depositPercent}% deposit through a pay link. It comes off the final invoice.</p>
}

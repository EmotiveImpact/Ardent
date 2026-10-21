import { useState, type ReactNode } from 'react'
import { initials, pounds, trade as tradeName } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Icon } from '@/components/layout/icons'
import { Card, Initials, PageHead, RowButton, SectionHead } from '@/components/ardent/parts'
import { Fact, GreyButton, HoldEmber } from '@/components/ardent/money-parts'
import { Pill } from '@/components/ardent/book-parts'
import { greyButton } from '@/components/ardent/money-lib'
import { FormDialog } from '@/components/ardent/people-parts'
import { solidButton } from '@/components/ardent/people-kit'
import { kinds, kindWord, marginOf, penceOf, poundsBox, units, unitWord, usePriceList } from '@/components/ardent/price-parts'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { fieldClass, selectClass } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useArdent, useBook, useQuery } from '@/data/ardent'
import type { PriceItem, Trade } from '@/data/model'
import { act } from '@/lib/act'
import { find } from '@/lib/jobs'
import { cn } from '@/lib/utils'

type Role = 'owner' | 'office' | 'field'
type Member = { userId: string; role: Role; name: string; email: string; operatorId?: string }

const roleWord: Record<Role, string> = { owner: 'Owner', office: 'Office', field: 'Field' }
const roleNote: Record<Role, string> = {
  owner: 'everything, including people and roles',
  office: 'jobs, customers, money and crew',
  field: 'their own jobs, on Ardent Field',
}
const roles: Role[] = ['owner', 'office', 'field']

/** Everyone with a sign-in to this firm. */
function useMembers() {
  const { admin } = useArdent()
  return useQuery(() => admin<Member[]>('members'))
}

export function Settings() {
  const { me, mode, admin, signOut, reset } = useArdent()
  const { data: members } = useMembers()
  const { data: book } = useBook()
  if (!me) return null
  const owner = me.role === 'owner'
  const people = [...(members ?? [])].sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role) || a.name.localeCompare(b.name))

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Settings' }]} />
      <PageHead title="Settings" book={book} sub="Your firm, your sign-in, who else can sign in, and your price list." className="pb-0" />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="flex flex-col gap-3 p-6">
            <SectionHead title="Your firm" className="pb-0" />
            <div className="rows">
              <Fact label="Name on invoices">
                <span className="text-foreground">{me.organisation.name}</span>
              </Fact>
              <Fact label="Short name">
                <span className="font-mono">{me.organisation.slug}</span>
              </Fact>
              <Fact label="Set up for">{me.organisation.industry === 'trades' ? 'Ardent for Trades' : me.organisation.industry}</Fact>
              <Fact label="Pay within">
                <span className="font-mono">14 days</span>
              </Fact>
              <Fact label="Crew on the books">
                <span className="font-mono">{book?.operators.length ?? '--'}</span>
              </Fact>
            </div>
            <p className="text-[12.5px] text-faint">Your address, VAT number and bank details aren't in Ardent yet, so invoices go out without them. The firm's name and payment terms can't be changed here yet.</p>
          </Card>

          <Card className="flex flex-col gap-3 p-6">
            <SectionHead title="Your sign-in" className="pb-0" />
            <div className="rows">
              <Fact label="Name">
                <span className="text-foreground">{me.user.name}</span>
              </Fact>
              <Fact label="Email">
                <span className="font-mono text-[12.5px]">{me.user.email}</span>
              </Fact>
              <Fact label="Role">{roleWord[me.role as Role] ?? me.role}</Fact>
              <Fact label="Records">
                {mode === 'demo' ? (
                  'The demo firm, kept in this browser'
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-ok" /> Ardent engine
                  </span>
                )}
              </Fact>
            </div>
            <div>
              <GreyButton onClick={() => void signOut()}>Sign out</GreyButton>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card className="px-6 pt-6 pb-3">
            <SectionHead title={`People with a sign-in · ${members?.length ?? ''}`} aside={owner && <RowButton to="/crew">Give someone a sign-in</RowButton>} className="pb-2" />
            {!members && <div className="h-40 animate-pulse rounded-[10px] bg-inset" />}
            <ul className="rows">
              {people.map((m) => {
                const self = m.userId === me.user.id
                const crew = find(book?.operators, m.operatorId)
                return (
                  <li key={m.userId} className="flex items-center gap-3.5 py-3">
                    <Initials className="font-display text-[11px]">{initials(m.name)}</Initials>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-[14px]">
                        {m.name}
                        {self && <span className="ml-1.5 text-muted">you</span>}
                      </span>
                      <span className="truncate font-mono text-[11px] text-muted">
                        {m.email}
                        {crew && crew.name !== m.name && <span className="ml-2">crew: {crew.name}</span>}
                      </span>
                    </span>
                    {owner && !self ? (
                      <label className="relative shrink-0">
                        <span className="sr-only">Role for {m.name}</span>
                        <select
                          value={m.role}
                          onChange={(e) => void act(admin('setRole', m.userId, e.target.value), `${m.name} is now ${roleWord[e.target.value as Role].toLowerCase()}`)}
                          className="cap h-[30px] cursor-pointer rounded-full bg-raised pl-3.5 [--chevron-inset:12px] text-foreground outline-none hover:bg-[#262626] focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {roleWord[r]}
                            </option>
                          ))}
                        </select>
                        <svg aria-hidden viewBox="0 0 12 12" className="pointer-events-none absolute top-1/2 right-2.5 size-2.5 -translate-y-1/2 text-muted">
                          <path d="M2.5 4.5l3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                      </label>
                    ) : (
                      <span className="cap flex h-[30px] shrink-0 items-center rounded-full bg-raised px-3">{roleWord[m.role]}</span>
                    )}
                  </li>
                )
              })}
            </ul>
            <dl className="mt-1 flex flex-col gap-1 pt-3 pb-1 text-[12.5px] text-muted shadow-[inset_0_1px_0_var(--line)]">
              {roles.map((r) => (
                <div key={r}>
                  <dt className="inline text-foreground/80">{roleWord[r]}:</dt> <dd className="inline">{roleNote[r]}.</dd>
                </div>
              ))}
              <p className={cn('pt-1.5', !owner && 'text-faint')}>{owner ? 'Give crew a sign-in from their card on the Crew screen.' : 'Only the owner changes roles.'}</p>
            </dl>
          </Card>

          {mode === 'demo' && reset && (
            <Card className="flex flex-col gap-3.5 p-6">
              <SectionHead title="Demo firm" className="pb-0" />
              <p className="text-[14px] text-[#c8c8c8]">Puts every job, customer and invoice back to how the demo started, with today's jobs moved to today. Anything you've added goes.</p>
              <HoldEmber label="Hold to start again" onCommit={() => void act(reset(), 'Demo put back as it started')} />
            </Card>
          )}
        </div>
      </div>

      <PriceList />
    </div>
  )
}

/* ---------- Price list ---------- */

const trades: Trade[] = ['gas', 'heating', 'plumbing', 'electrical', 'fire', 'hvac', 'lifts', 'roofing', 'carpentry', 'general']
const priceCols = 'lg:grid-cols-[104px_minmax(0,1fr)_128px_88px_88px_64px_64px]'

/** What the firm charges and what it pays, kept once and picked from on quotes and jobs. */
function PriceList() {
  const { data: items } = usePriceList()
  const [typed, setTyped] = useState('')
  const [archived, setArchived] = useState(false)
  const all = items ?? []
  const gone = all.filter((i) => i.archived).length
  const t = typed.trim().toLowerCase()
  const rows = all.filter((i) => !!i.archived === archived && (!t || `${i.name} ${i.code ?? ''} ${i.trade ?? ''}`.toLowerCase().includes(t)))

  return (
    <Card className="px-4 pt-6 pb-3 sm:px-6">
      <SectionHead title={`Price list · ${all.length - gone}`} aside="Picked from on quotes. Only the office sees what things cost." className="pb-3.5" />
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2.5 rounded-[10px] bg-inset px-3.5 text-muted focus-within:ring-2 focus-within:ring-ring/60">
          <Icon name="search" className="size-4 shrink-0" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Name, code or trade" aria-label="Find on the price list" className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted" />
        </label>
        {(gone > 0 || archived) && (
          <Pill on={archived} onClick={() => setArchived(!archived)}>
            Archived <span className={cn('ml-2 font-mono text-[12px]', archived ? 'text-background/55' : 'text-muted')}>{gone}</span>
          </Pill>
        )}
        <ItemDialog>
          <button type="button" className={greyButton}>
            <Icon name="plus" className="size-4" /> Add an item
          </button>
        </ItemDialog>
      </div>

      <div className={cn('cap hidden gap-3.5 py-2.5 lg:grid', priceCols)}>
        <span>Code</span>
        <span>Item</span>
        <span>Sold</span>
        <span className="text-right">Price</span>
        <span className="text-right">Cost</span>
        <span className="text-right">Margin</span>
        <span className="text-right">Vans</span>
      </div>
      {!items && <div className="h-40 animate-pulse rounded-[10px] bg-inset" />}
      <ul className="rows shadow-[inset_0_1px_0_var(--line)]">
        {rows.map((i) => (
          <li key={i.id}>
            <ItemDialog item={i}>
              <PriceRow item={i} />
            </ItemDialog>
          </li>
        ))}
      </ul>
      {items && !rows.length && (
        <p className="py-8 text-center text-[13px] text-muted shadow-[inset_0_1px_0_var(--line)]">
          {t ? 'Nothing on the list matches that.' : archived ? 'Nothing archived.' : 'Nothing on the price list yet. Add the parts and labour you charge for most.'}
        </p>
      )}
    </Card>
  )
}

/** One item: a row you open to change it. Forwards the dialog trigger's props to the button. */
function PriceRow({ item: i, ...props }: { item: PriceItem } & React.ComponentProps<'button'>) {
  const margin = marginOf(i)
  const sold = `${kindWord[i.kind]}, ${unitWord[i.unit]}`
  return (
    <button
      type="button"
      aria-label={`Change ${i.name}, ${pounds(i.price, { always: true })} ${unitWord[i.unit]}${i.archived ? ', archived' : ''}`}
      {...props}
      className={cn('-mx-2 flex min-h-11 w-[calc(100%+16px)] items-center gap-3.5 rounded-lg px-2 py-3 text-left outline-none transition-colors hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-ring/60 lg:grid lg:py-[11px]', priceCols, i.archived && 'opacity-55')}
    >
      {/* Wide: one grid row. */}
      <span className="hidden truncate font-mono text-[12px] text-muted lg:block">{i.code ?? '--'}</span>
      <span className="hidden min-w-0 truncate text-[14px] lg:block">
        {i.name}
        {i.trade && <span className="ml-2.5 text-[12.5px] text-muted">{tradeName[i.trade]}</span>}
      </span>
      <span className="hidden truncate text-[13px] text-muted lg:block">{sold}</span>
      <span className="hidden text-right font-mono text-[13px] tabular lg:block">{pounds(i.price, { always: true })}</span>
      <span className="hidden text-right font-mono text-[13px] text-muted tabular lg:block">{i.cost === undefined ? '--' : pounds(i.cost, { always: true })}</span>
      <span className="hidden text-right font-mono text-[13px] text-muted tabular lg:block">{margin === undefined ? '--' : `${margin}%`}</span>
      <span className="hidden justify-end lg:flex">{i.stocked ? <span aria-label="On the vans" className="size-[7px] rounded-full bg-foreground" /> : <span className="sr-only">Not on the vans</span>}</span>
      {/* Narrow: two lines. */}
      <span className="min-w-0 flex-1 lg:hidden">
        <span className="block truncate text-[14px]">{i.name}</span>
        <span className="mt-1 block truncate font-mono text-[11px] text-muted uppercase">
          {i.code ?? kindWord[i.kind]} <span className="text-faint">·</span> {i.unit}
          {i.stocked && (
            <>
              {' '}
              <span className="text-faint">·</span> on vans
            </>
          )}
          {i.archived && (
            <>
              {' '}
              <span className="text-faint">·</span> archived
            </>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 lg:hidden">
        <span className="font-mono text-[13px] tabular">{pounds(i.price, { always: true })}</span>
        <span className="font-mono text-[11px] text-muted">{margin === undefined ? 'NO COST' : `${margin}% MARGIN`}</span>
      </span>
    </button>
  )
}

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

/** Add an item, or change one: name, code, how it's sold, price and cost, and whether the vans carry it. */
function ItemDialog({ item, children }: { item?: PriceItem; children: ReactNode }) {
  const { client } = useArdent()
  const [open, setOpen] = useState(false)
  const start = () => ({
    name: item?.name ?? '',
    code: item?.code ?? '',
    kind: item?.kind ?? ('material' as PriceItem['kind']),
    unit: item?.unit ?? ('each' as PriceItem['unit']),
    trade: item?.trade ?? ('' as Trade | ''),
    price: poundsBox(item?.price),
    cost: poundsBox(item?.cost),
    stocked: item?.stocked ?? false,
  })
  const [f, setF] = useState(start)
  const price = penceOf(f.price)
  const cost = f.cost.trim() ? penceOf(f.cost) : undefined
  const costOk = !f.cost.trim() || cost !== undefined
  const missing = !f.name.trim() ? 'a name' : price === undefined ? 'a price' : !costOk ? 'a cost in pounds and pence, or leave it empty' : undefined
  const margin = price !== undefined ? marginOf({ price, cost }) : undefined
  const id = item?.id ?? 'new'

  const reopen = (on: boolean) => {
    if (on) setF(start())
    setOpen(on)
  }
  const save = async () => {
    if (missing || price === undefined) return
    const fields = { name: f.name.trim(), code: f.code.trim() || undefined, kind: f.kind, unit: f.unit, trade: f.trade || undefined, price, cost, stocked: f.stocked }
    // An emptied box is sent as null, so the engine clears it.
    const done = item
      ? await act(client.priceList.update(item.id, { ...fields, code: fields.code ?? null, cost: fields.cost ?? null, trade: fields.trade ?? null }), `${fields.name} saved`)
      : await act(client.priceList.create(fields), (i) => `${i.name} added to the price list`)
    if (done) setOpen(false)
  }
  const archive = async (archived: boolean) => {
    if (!item) return
    const done = await act(client.priceList.update(item.id, { archived }), archived ? `${item.name} archived. Lines already on jobs keep it.` : `${item.name} is back on the price list`)
    if (done) setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={reopen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <FormDialog wide eyebrow="Price list" title={item ? item.name : 'Add an item'} line={item?.archived ? 'Archived, so it is not offered on new quotes. Lines already on jobs keep it.' : 'Prices are before VAT. Only the office sees the cost and margin.'}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.6fr_1fr]">
          <Labelled label="Name" htmlFor={`pi-name-${id}`}>
            <Input id={`pi-name-${id}`} autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="22mm compression elbow" />
          </Labelled>
          <Labelled label="Code" htmlFor={`pi-code-${id}`}>
            <Input id={`pi-code-${id}`} className="font-mono uppercase placeholder:normal-case" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="Yours or the merchant's" />
          </Labelled>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Labelled label="Kind" htmlFor={`pi-kind-${id}`}>
            <select id={`pi-kind-${id}`} className={selectClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PriceItem['kind'] })}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {kindWord[k]}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Charged" htmlFor={`pi-unit-${id}`}>
            <select id={`pi-unit-${id}`} className={selectClass} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as PriceItem['unit'] })}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {unitWord[u].charAt(0).toUpperCase() + unitWord[u].slice(1)}
                </option>
              ))}
            </select>
          </Labelled>
          <Labelled label="Trade" htmlFor={`pi-trade-${id}`}>
            <select id={`pi-trade-${id}`} className={selectClass} value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value as Trade | '' })}>
              <option value="">Any trade</option>
              {trades.map((t) => (
                <option key={t} value={t}>
                  {tradeName[t]}
                </option>
              ))}
            </select>
          </Labelled>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Labelled label="Price, £" htmlFor={`pi-price-${id}`}>
            <input id={`pi-price-${id}`} inputMode="decimal" className={cn(fieldClass, 'font-mono')} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, '') })} placeholder="4.50" />
          </Labelled>
          <Labelled label="Cost to you, £" htmlFor={`pi-cost-${id}`}>
            <input id={`pi-cost-${id}`} inputMode="decimal" className={cn(fieldClass, 'font-mono')} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/[^\d.]/g, '') })} placeholder="1.80" />
          </Labelled>
          <div className="col-span-2 flex flex-col gap-2 sm:col-span-1">
            <span className="cap">Margin</span>
            <span className="flex h-[42px] items-center font-mono text-[14px] text-muted" aria-live="polite">
              {margin === undefined ? '--' : `${margin}%`}
              {margin !== undefined && price !== undefined && cost !== undefined && <span className="ml-2.5 text-[12px] text-faint">{pounds(price - cost, { always: true })} {unitWord[f.unit]}</span>}
            </span>
          </div>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="cap pb-2">Carried on the vans</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill on={f.stocked} onClick={() => setF({ ...f, stocked: true })}>
              Yes, count it in van stock
            </Pill>
            <Pill on={!f.stocked} onClick={() => setF({ ...f, stocked: false })}>
              No
            </Pill>
          </div>
        </fieldset>
        {missing && (f.name || f.price || f.cost) && <p className="text-[12.5px] text-muted">Still needs {missing}.</p>}
        <button type="button" className={solidButton} disabled={!!missing} onClick={() => void save()}>
          {item ? 'Save changes' : 'Add to the price list'}
        </button>
        {item && (
          <GreyButton className="h-11 w-full" onClick={() => void archive(!item.archived)}>
            {item.archived ? 'Put back on the price list' : 'Archive it'}
          </GreyButton>
        )}
      </FormDialog>
    </Dialog>
  )
}

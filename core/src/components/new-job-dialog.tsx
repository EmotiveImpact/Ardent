import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { trade as tradeName, ukToIso } from '@kit'
import { Button } from '@/components/ui/button'
import { HoldButton } from '@/components/ui/hold-button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field, selectClass } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { Well } from '@/components/ui/panel'
import { useArdent, useBook } from '@/data/ardent'
import type { ComplianceCheck, Customer, Trade } from '@/data/model'
import { act } from '@/lib/act'
import { today } from '@/lib/jobs'
import { cn } from '@/lib/utils'

const trades: Trade[] = ['gas', 'heating', 'plumbing', 'electrical', 'fire', 'hvac', 'lifts', 'roofing', 'carpentry', 'general']

/** The gates a job of this trade has to pass before it can be signed off. */
function checksFor(trade: Trade): ComplianceCheck[] {
  const c = (key: ComplianceCheck['key'], label: string): ComplianceCheck => ({ key, label, state: 'pending' })
  const list = [c('rams', 'RAMS')]
  if (trade === 'gas' || trade === 'heating') list.push(c('registration', 'Gas Safe'), c('gas_tightness', 'Tightness test'))
  if (trade === 'electrical') list.push(c('registration', 'NICEIC'), c('eicr', 'Electrical cert'))
  list.push(c('photos', 'Photos'), c('signature', 'Customer sign-off'))
  return list
}

const kinds: Customer['kind'][] = ['homeowner', 'landlord', 'letting_agent', 'business']
const kindWord: Record<Customer['kind'], string> = { homeowner: 'Homeowner', landlord: 'Landlord', letting_agent: 'Letting agent', business: 'Business' }

const nextHour = () => {
  const h = Number(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' }))
  return `${String(Math.min(17, Math.max(8, h + 1))).padStart(2, '0')}:00`
}


export function NewJobDialog({ children, customerId: presetCustomer }: { children: ReactNode; customerId?: string }) {
  const { client } = useArdent()
  const { data: book } = useBook()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [trade, setTrade] = useState<Trade>('gas')
  const [title, setTitle] = useState('')
  const [customerId, setCustomerId] = useState(presetCustomer ?? '')
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', kind: 'homeowner' as Customer['kind'] })
  const [siteId, setSiteId] = useState('')
  const [newSite, setNewSite] = useState({ line1: '', town: '', postcode: '' })
  const [day, setDay] = useState(today())
  const [start, setStart] = useState(nextHour())
  const [hours, setHours] = useState(2)
  const [who, setWho] = useState('')
  const [emergency, setEmergency] = useState(false)
  const [quoteFirst, setQuoteFirst] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]')
      if (e.key.toLowerCase() === 'n' && !typing && !e.metaKey && !e.ctrlKey && !presetCustomer) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [presetCustomer])

  const customerSites = useMemo(() => book?.sites.filter((s) => s.customerId === customerId) ?? [], [book, customerId])
  useEffect(() => setSiteId(customerSites[0]?.id ?? ''), [customerSites])

  const isNewCustomer = customerId === 'new' || !customerId
  const isNewSite = isNewCustomer || siteId === 'new' || !siteId
  const ready =
    title.trim() &&
    (isNewCustomer ? newCustomer.name.trim() && newCustomer.phone.trim() : true) &&
    (isNewSite ? newSite.line1.trim() && newSite.postcode.trim() : true)

  const reset = () => {
    setTitle('')
    setCustomerId(presetCustomer ?? '')
    setNewCustomer({ name: '', phone: '', kind: 'homeowner' })
    setNewSite({ line1: '', town: '', postcode: '' })
    setWho('')
    setEmergency(false)
    setQuoteFirst(false)
  }

  const create = async () => {
    if (!ready || busy) return
    setBusy(true)
    try {
      let cid = customerId
      if (isNewCustomer) {
        const c = await act(client.customers.create({ name: newCustomer.name.trim(), phone: newCustomer.phone.trim(), kind: newCustomer.kind }))
        if (!c) return
        cid = c.id
      }
      let sid = siteId
      if (isNewSite) {
        // Placed at the yard on the crew map until addresses are looked up.
        const s = await act(client.sites.create({ customerId: cid, line1: newSite.line1.trim(), town: newSite.town.trim(), postcode: newSite.postcode.trim().toUpperCase(), lat: 0, lng: 0 }))
        if (!s) return
        sid = s.id
      }
      const from = ukToIso(day, start)
      const job = await act(
        client.jobs.create({
          title: title.trim(),
          trade,
          status: quoteFirst ? 'enquiry' : 'booked',
          priority: emergency ? 'emergency' : 'normal',
          customerId: cid,
          siteId: sid,
          operatorIds: who ? [who] : [],
          start: from,
          end: new Date(Date.parse(from) + hours * 3_600_000).toISOString(),
          lines: [],
          checks: checksFor(trade),
        }),
        (j) => `${j.ref} ${quoteFirst ? 'logged, ready to quote' : who ? 'booked' : 'booked, waiting for someone'}`,
      )
      if (job) {
        setOpen(false)
        reset()
        navigate(`/jobs/${job.id}`)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <div className="px-3 pt-3 pb-3">
          <DialogTitle>New job</DialogTitle>
          <DialogDescription>Log it, book it and give it to someone, all at once.</DialogDescription>
        </div>
        <Well className="space-y-4 p-3">
          <div className="flex flex-wrap gap-1.5">
            {trades.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTrade(t)}
                className={cn('h-8 rounded-md bg-surface px-3 text-[12px] text-muted transition-colors hover:text-foreground', trade === t && 'bg-foreground text-black hover:text-black')}
              >
                {tradeName[t]}
              </button>
            ))}
          </div>
          <Field label="What needs doing" htmlFor="nj-title">
            <Input id="nj-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Boiler losing pressure, kitchen" />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Customer" htmlFor="nj-cust">
              <select id="nj-cust" className={selectClass} value={customerId || 'new'} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="new">New customer</option>
                {book?.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            {!isNewCustomer && (
              <Field label="Site" htmlFor="nj-site">
                <select id="nj-site" className={selectClass} value={siteId || 'new'} onChange={(e) => setSiteId(e.target.value)}>
                  {customerSites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.line1}, {s.postcode}
                    </option>
                  ))}
                  <option value="new">Another address</option>
                </select>
              </Field>
            )}
          </div>

          {isNewCustomer && (
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-surface p-3 sm:grid-cols-3">
              <Field label="Name" htmlFor="nc-name">
                <Input id="nc-name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
              </Field>
              <Field label="Phone" htmlFor="nc-phone">
                <Input id="nc-phone" className="font-mono" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
              </Field>
              <Field label="Type" htmlFor="nc-kind">
                <select id="nc-kind" className={selectClass} value={newCustomer.kind} onChange={(e) => setNewCustomer({ ...newCustomer, kind: e.target.value as Customer['kind'] })}>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {kindWord[k]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          {isNewSite && (
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-surface p-3 sm:grid-cols-[1.4fr_1fr_0.8fr]">
              <Field label="Address" htmlFor="ns-line1">
                <Input id="ns-line1" value={newSite.line1} onChange={(e) => setNewSite({ ...newSite, line1: e.target.value })} placeholder="14 Alder Road" />
              </Field>
              <Field label="Town" htmlFor="ns-town">
                <Input id="ns-town" value={newSite.town} onChange={(e) => setNewSite({ ...newSite, town: e.target.value })} placeholder="Didsbury" />
              </Field>
              <Field label="Postcode" htmlFor="ns-pc">
                <Input id="ns-pc" className="font-mono uppercase" value={newSite.postcode} onChange={(e) => setNewSite({ ...newSite, postcode: e.target.value })} placeholder="M20 6BT" />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Day" htmlFor="nj-day" className="col-span-2 sm:col-span-1">
              <Input id="nj-day" type="date" className="font-mono" value={day} onChange={(e) => setDay(e.target.value)} />
            </Field>
            <Field label="From" htmlFor="nj-start">
              <Input id="nj-start" type="time" step={900} className="font-mono" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Hours" htmlFor="nj-hours">
              <Input id="nj-hours" type="number" min={0.5} max={12} step={0.5} className="font-mono" value={hours} onChange={(e) => setHours(Math.max(0.5, Number(e.target.value) || 1))} />
            </Field>
            <Field label="Who goes" htmlFor="nj-who" className="col-span-2 sm:col-span-1">
              <select id="nj-who" className={selectClass} value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Decide later</option>
                {book?.operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="divide-y divide-line rounded-lg bg-surface">
            <label className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span>
                <span className="block text-[13px]">Emergency call-out</span>
                <span className="block text-[12px] text-muted">Goes to the top of the board in ember</span>
              </span>
              <Switch checked={emergency} onCheckedChange={setEmergency} />
            </label>
            <label className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span>
                <span className="block text-[13px]">Needs a quote first</span>
                <span className="block text-[12px] text-muted">Logged as an enquiry until the customer says yes</span>
              </span>
              <Switch checked={quoteFirst} onCheckedChange={setQuoteFirst} />
            </label>
          </div>
        </Well>
        <div className="flex justify-end gap-2 p-2 pt-3">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {emergency ? (
            <HoldButton label="Hold to book it" onCommit={() => void create()} className="h-8 w-44 rounded-md" ms={900} disabled={!ready || busy} />
          ) : (
            <Button variant="ember" size="sm" onClick={() => void create()} disabled={!ready || busy}>
              {quoteFirst ? 'Log it' : 'Book it'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

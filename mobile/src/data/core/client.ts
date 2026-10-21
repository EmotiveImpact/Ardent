import type { ActionEntry, Approval, Automation, AutomationJob, Certificate, ComplianceCheck, Customer, DeclineReason, DriveTime, Exception, GasAppliance, GasInstallation, GasSafetyRecord, Invoice, Job, JobRequest, JobStatus, LineItem, MorningBrief, Note, OptionKey, PaymentMethod, PriceItem, Signature, Operator, OperatorState, Photo, Quote, Site, Standby, StockLevel, TimeEntry, VanFix, Level, Usage, Verdict } from './model'

/** What the office can change on a booked job. */
export type JobPatch = Partial<Pick<Job, 'title' | 'trade' | 'priority' | 'start' | 'end' | 'notes' | 'operatorIds'>>

/**
 * The one interface both apps code against. The mock backs the prototypes;
 * the Ardent engine (engine/) implements the same interface over HTTP, so
 * screens don't change when they switch.
 */
export interface ArdentClient {
  jobs: {
    list(filter?: { status?: JobStatus[]; operatorId?: string; from?: string; to?: string }): Promise<Job[]>
    get(id: string): Promise<Job | undefined>
    create(input: Omit<Job, 'id' | 'ref'>): Promise<Job>
    /** Rebook, reassign or rename. Office only. */
    update(id: string, patch: JobPatch): Promise<Job>
    setStatus(id: string, status: JobStatus): Promise<Job>
    /**
     * Log labour or materials against a job, from the office or on site. A line
     * with fromVan comes out of that engineer's van stock; removing it puts it back.
     */
    addLine(jobId: string, line: Omit<LineItem, 'id'>): Promise<Job>
    removeLine(jobId: string, lineId: string): Promise<Job>
    /** Pass, fail or reset a compliance gate; adds the check if the job lacks it. */
    setCheck(jobId: string, key: ComplianceCheck['key'], state: ComplianceCheck['state'], detail?: string): Promise<Job>
  }
  customers: {
    list(): Promise<Customer[]>
    get(id: string): Promise<Customer | undefined>
    /** Balance starts at zero; it follows the customer's invoices. */
    create(input: Omit<Customer, 'id' | 'balance'>): Promise<Customer>
    update(id: string, patch: Partial<Omit<Customer, 'id' | 'balance'>>): Promise<Customer>
  }
  sites: {
    list(filter?: { customerId?: string }): Promise<Site[]>
    get(id: string): Promise<Site | undefined>
    create(input: Omit<Site, 'id'>): Promise<Site>
  }
  operators: {
    list(): Promise<Operator[]>
    me(): Promise<Operator>
    setState(id: string, state: OperatorState, jobId?: string): Promise<Operator>
    /** The engineer's own van, from their phone, while on shift. Ignored off shift. */
    setLocation(id: string, fix: VanFix): Promise<Operator>
    /** The engineer puts themselves on standby for work, or comes off it (null). */
    setStandby(id: string, standby: Standby | null): Promise<Operator>
  }
  /**
   * Asking the crew who can take a job. The office sends one; it goes to
   * the nearest engineers with the trade and the papers for it, staff before
   * freelancers. Field sees the requests offered to them and answers.
   */
  requests: {
    /** Office: every request (open ones by default). Field: the ones offered to them. */
    list(filter?: { jobId?: string; open?: boolean }): Promise<JobRequest[]>
    /** One at a time (the default) or everyone at once. wait is seconds each, 45 unless given. */
    create(jobId: string, opts?: { mode?: JobRequest['mode']; wait?: number }): Promise<JobRequest>
    /** Accepting puts the engineer on the job; declining moves it to the next one. */
    respond(id: string, answer: 'accept' | 'decline', reason?: DeclineReason): Promise<JobRequest>
    /** Office calls it off. */
    withdraw(id: string): Promise<JobRequest>
  }
  /** How far each van on shift is from a site. Office only. */
  travel: {
    list(opts: { siteId: string }): Promise<DriveTime[]>
    /** Whether drive times by road are switched on (a TomTom key on the engine). */
    get(): Promise<{ roadTimes: boolean }>
  }
  time: {
    start(entry: Omit<TimeEntry, 'id' | 'end'>): Promise<TimeEntry>
    stop(id: string, at?: string): Promise<TimeEntry>
    forJob(jobId: string): Promise<TimeEntry[]>
  }
  photos: { add(photo: Omit<Photo, 'id'>): Promise<Photo>; forJob(jobId: string): Promise<Photo[]> }
  notes: { add(note: Omit<Note, 'id'>): Promise<Note>; forJob(jobId: string): Promise<Note[]> }
  quotes: {
    list(): Promise<Quote[]>
    forJob(jobId: string): Promise<Quote[]>
    /**
     * Draft quote. Lines default to the job's lines; valid for 30 days unless given.
     * Pass two or three options (A, B, C) to offer different ways of doing it.
     */
    create(jobId: string, opts?: { lines?: Omit<LineItem, 'id'>[]; options?: { key: OptionKey; label: string; lines: Omit<LineItem, 'id'>[] }[]; validUntil?: string }): Promise<Quote>
    /** Change a draft's lines or options. */
    update(id: string, patch: { lines?: Omit<LineItem, 'id'>[]; options?: { key: OptionKey; label: string; lines: Omit<LineItem, 'id'>[] }[] | null; validUntil?: string }): Promise<Quote>
    /** Marks it sent and moves an enquiry to quoted. */
    send(id: string, via: 'email' | 'sms'): Promise<Quote>
    /** Customer's answer. Accepting books the job with the chosen option's lines; a quote with options needs one. */
    respond(id: string, answer: 'accepted' | 'declined', option?: OptionKey): Promise<Quote>
  }
  certificates: { list(filter?: { siteId?: string }): Promise<Certificate[]> }
  /** The firm's price list. Everyone reads it (Field without costs); the office keeps it. */
  priceList: {
    list(opts?: { archived?: boolean }): Promise<PriceItem[]>
    create(input: Omit<PriceItem, 'id'>): Promise<PriceItem>
    /** null clears code, cost or trade (undefined is lost on the way over the wire). */
    update(id: string, patch: Partial<Omit<PriceItem, 'id' | 'code' | 'cost' | 'trade'>> & { code?: string | null; cost?: number | null; trade?: PriceItem['trade'] | null }): Promise<PriceItem>
  }
  /** What's on each van. Field sees their own; the office sees and sets every van. */
  stock: {
    list(filter?: { operatorId?: string }): Promise<StockLevel[]>
    /** A restock or stock take: set the count, and optionally the low mark. Office only. */
    set(operatorId: string, itemId: string, quantity: number, min?: number): Promise<StockLevel>
  }
  /** Landlord gas safety records (CP12), filled in on site and issued as a certificate. */
  gasRecords: {
    list(filter?: { siteId?: string }): Promise<GasSafetyRecord[]>
    forJob(jobId: string): Promise<GasSafetyRecord[]>
    /** A draft for the job, starting from the appliances on the site's last record. */
    create(jobId: string, operatorId: string): Promise<GasSafetyRecord>
    /** Add an appliance, or change one when its id is given. */
    saveAppliance(id: string, appliance: Omit<GasAppliance, 'id'> & { id?: string }): Promise<GasSafetyRecord>
    removeAppliance(id: string, applianceId: string): Promise<GasSafetyRecord>
    setInstallation(id: string, key: keyof GasInstallation, verdict: Verdict): Promise<GasSafetyRecord>
    /** Checks it's complete, stamps it, and puts a CP12 certificate on the site for twelve months. */
    issue(id: string): Promise<GasSafetyRecord>
  }
  /**
   * What Ardent has ready for a person's yes: invoices to send, reminders to
   * chase, quotes to send. Worked out from the records. Office only.
   */
  approvals: {
    list(filter?: { status?: Approval['status'][] }): Promise<Approval[]>
    /** Carry it out. version is the one the person saw; if it has changed since, it's turned down. */
    approve(id: string, version: string): Promise<Approval>
    reject(id: string, note?: string): Promise<Approval>
  }
  /** The firm's rules for Ardent: a level for each back office job, area switches, timings and limits. Owners change them. */
  automation: {
    get(): Promise<{ settings: Automation; jobs: AutomationJob[] }>
    set(patch: Partial<Omit<Automation, 'areas' | 'levels' | 'chase' | 'limits'>> & { areas?: Partial<Automation['areas']>; levels?: Record<string, Level>; chase?: Partial<Automation['chase']>; limits?: Partial<Automation['limits']> }): Promise<{ settings: Automation; jobs: AutomationJob[] }>
  }
  /** This month's AI spend, call minutes and texts against the plan. Office only. */
  usage: { get(opts?: { month?: string }): Promise<Usage> }
  /** Everything done in the firm, newest first: by whom, and whether Ardent drafted it. Office only. */
  log: { list(filter?: { jobId?: string; limit?: number }): Promise<ActionEntry[]> }
  /** The owner's morning brief for a UK day (today unless given). Office only. */
  brief: { get(opts?: { day?: string }): Promise<MorningBrief> }
  /** What needs the office's attention now, worked out from the records. Newest first. */
  attention: { list(): Promise<Exception[]> }
  signatures: { add(sig: Omit<Signature, 'id'>): Promise<Signature>; forJob(jobId: string): Promise<Signature[]> }
  invoices: {
    list(): Promise<Invoice[]>
    forJob(jobId: string): Promise<Invoice[]>
    /** Draft invoice copying the job's lines, or the draft already there. vatRate in basis points, default 2000. */
    create(jobId: string, opts?: { vatRate?: number }): Promise<Invoice>
    /** Marks it sent, stamps issuedAt, sets dueAt 14 days on. */
    send(id: string, via: 'email' | 'sms'): Promise<Invoice>
    /** Adds to paidAmount, sets part_paid or paid, and moves the job to invoiced or paid. Amount in pence. */
    recordPayment(id: string, amount: number, method: PaymentMethod): Promise<Invoice>
  }
}

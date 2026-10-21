import type { Certificate, ComplianceCheck, Customer, DriveTime, Exception, GasAppliance, GasInstallation, GasSafetyRecord, Invoice, Job, JobStatus, LineItem, Note, OptionKey, PaymentMethod, PriceItem, Signature, Operator, OperatorState, Photo, Quote, Site, StockLevel, TimeEntry, VanFix, Verdict } from './model'

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
    update(id: string, patch: Partial<Omit<PriceItem, 'id'>>): Promise<PriceItem>
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
  /** What needs the office's attention now, worked out from the records. Newest first. */
  attention: { list(): Promise<Exception[]> }
  signatures: { add(sig: Omit<Signature, 'id'>): Promise<Signature>; forJob(jobId: string): Promise<Signature[]> }
  invoices: {
    list(): Promise<Invoice[]>
    forJob(jobId: string): Promise<Invoice[]>
    /** Draft invoice copying the job's lines. vatRate in basis points, default 2000. */
    create(jobId: string, opts?: { vatRate?: number }): Promise<Invoice>
    /** Marks it sent, stamps issuedAt, sets dueAt 14 days on. */
    send(id: string, via: 'email' | 'sms'): Promise<Invoice>
    /** Adds to paidAmount, sets part_paid or paid, and moves the job to invoiced or paid. Amount in pence. */
    recordPayment(id: string, amount: number, method: PaymentMethod): Promise<Invoice>
  }
}

import type { Certificate, ComplianceCheck, Customer, Exception, Invoice, Job, JobStatus, LineItem, Note, PaymentMethod, Signature, Operator, OperatorState, Photo, Quote, Site, TimeEntry } from './model'

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
    /** Log labour or materials against a job, from the office or on site. */
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
    /** Draft quote. Lines default to the job's lines; valid for 30 days unless given. */
    create(jobId: string, opts?: { lines?: Omit<LineItem, 'id'>[]; validUntil?: string }): Promise<Quote>
    /** Marks it sent and moves an enquiry to quoted. */
    send(id: string, via: 'email' | 'sms'): Promise<Quote>
    /** Customer's answer. Accepting moves the job to booked. */
    respond(id: string, answer: 'accepted' | 'declined'): Promise<Quote>
  }
  certificates: { list(filter?: { siteId?: string }): Promise<Certificate[]> }
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

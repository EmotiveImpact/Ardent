import type { ComplianceCheck, Customer, Invoice, Job, JobStatus, LineItem, Note, PaymentMethod, Signature, Operator, OperatorState, Photo, Quote, Site, TimeEntry } from './model'

/**
 * The one interface both apps code against. The mock implementation backs
 * everything today; a Supabase implementation replaces it without screens
 * changing.
 */
export interface ArdentClient {
  jobs: {
    list(filter?: { status?: JobStatus[]; operatorId?: string; from?: string; to?: string }): Promise<Job[]>
    get(id: string): Promise<Job | undefined>
    create(input: Omit<Job, 'id' | 'ref'>): Promise<Job>
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
  }
  sites: {
    get(id: string): Promise<Site | undefined>
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
  quotes: { forJob(jobId: string): Promise<Quote[]> }
  signatures: { add(sig: Omit<Signature, 'id'>): Promise<Signature>; forJob(jobId: string): Promise<Signature[]> }
  invoices: {
    forJob(jobId: string): Promise<Invoice[]>
    /** Draft invoice copying the job's lines. vatRate in basis points, default 2000. */
    create(jobId: string, opts?: { vatRate?: number }): Promise<Invoice>
    /** Marks it sent, stamps issuedAt, sets dueAt 14 days on. */
    send(id: string, via: 'email' | 'sms'): Promise<Invoice>
    /** Adds to paidAmount, sets part_paid or paid, and moves the job to invoiced or paid. Amount in pence. */
    recordPayment(id: string, amount: number, method: PaymentMethod): Promise<Invoice>
  }
}

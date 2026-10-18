import type { Customer, Invoice, Job, JobStatus, Note, Operator, OperatorState, Photo, Quote, Site, TimeEntry } from './model'

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
  invoices: { forJob(jobId: string): Promise<Invoice[]> }
}

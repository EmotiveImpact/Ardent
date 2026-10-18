// PROPOSED TO ARDENT CORE, not yet in its client. These are the calls the
// wrap-up flow needs (sign-off, invoice, payment). Once Core's client.ts has
// them, delete this file and move callers to `ardent`.
import type { ComplianceCheck, Invoice, Job } from './core/model';

export interface Signature {
  id: string;
  jobId: string;
  operatorId: string;
  /** Name the customer typed or said. */
  signedBy: string;
  /** SVG path data for the strokes, in a 0 to 1000 by 0 to 400 box. */
  svg: string;
  at: string;
}

export type PaymentMethod = 'card' | 'bank_transfer' | 'cash';

export interface PendingClient {
  setCheck(jobId: string, key: ComplianceCheck['key'], state: ComplianceCheck['state'], detail?: string): Promise<Job>;
  signatures: {
    add(sig: Omit<Signature, 'id'>): Promise<Signature>;
    forJob(jobId: string): Promise<Signature[]>;
  };
  invoices: {
    create(jobId: string, opts?: { vatRate?: number }): Promise<Invoice>;
    send(id: string, via: 'email' | 'sms'): Promise<Invoice>;
    recordPayment(id: string, amount: number, method: PaymentMethod): Promise<Invoice>;
  };
}

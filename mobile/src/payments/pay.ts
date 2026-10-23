/**
 * Taking payment on the doorstep, when the firm takes payments through
 * Ardent (its own Stripe account). What the wrap-up screen offers, in order:
 *
 * 1. Tap to Pay on the engineer's phone. Needs signal.
 * 2. Pay on your own phone: a QR code the customer scans and pays with their
 *    own signal. With no signal on the engineer's phone the code carries the
 *    invoice itself, signed with the engineer's key (kit/pay.ts), and the
 *    engine raises the invoice from it when the customer opens it.
 * 3. Text them the link, queued until the phone has signal.
 * 4. Cash or bank transfer, recorded by hand, or pay later.
 */
import type { Day, Invoice, TapToPay } from '@/data/types';
import { type OfflineInvoice, signOffline } from '@/kit/pay';
import { ENGINE_URL, field } from '@/sync/field';
import { jobInvoice } from '@/sync/hooks';
import { isLocal } from '@/sync/ops';

/** The firm takes payments through Ardent, as far as the phone last heard. */
export const takesPayments = (day: Day | undefined) => day?.pay?.status === 'active';

/** Pay links live on the engine's own address. The demo has its pretend pay page inside the app. */
const payPage = (id: string) => (ENGINE_URL ? `${ENGINE_URL.replace(/\/+$/, '')}/pay/${id}` : `#/pay/${id}`);

export type PayCode = { url: string; offline: boolean; why?: undefined } | { url?: undefined; offline?: undefined; why: string };

/**
 * What the QR code says. An invoice the engine has numbered gets its stable
 * link, which works whenever the customer opens it. One still only on the
 * phone gets the signed offline code under its local id.
 */
export function payCode(day: Day, inv: Invoice): PayCode {
  if (!isLocal(inv.id)) return { url: payPage(inv.id), offline: false };
  const key = day.pay?.offlineKey;
  const me = field.state.me;
  if (!key || !me) return { why: 'This phone needs signal once to be set up for pay codes. Text them the link instead.' };
  if (!inv.lines.length) return { why: 'There is nothing on the invoice to pay yet.' };
  // When the phone raised it, so the code stays the same each time it is shown.
  const raised = field.state.outbox.find((o) => o.kind === 'call' && o.localId === inv.id)?.at ?? day.pulledAt;
  const code: OfflineInvoice = {
    offlineId: inv.id,
    orgId: me.organisation.id,
    jobId: inv.jobId,
    operatorId: day.operator.id,
    vatRate: inv.vatRate,
    lines: inv.lines.map((l) => [l.description, l.quantity, l.unitPrice, l.kind]),
    at: raised,
  };
  return { url: `${payPage(inv.id)}?${signOffline(code, key)}`, offline: true };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The job's invoice once the engine has it. An invoice raised moments ago is
 * still on its way, so this sends what's waiting and gives it a few seconds.
 */
export async function syncedInvoice(jobId: string): Promise<Invoice> {
  const find = () => (field.day ? jobInvoice(field.day, jobId) : undefined);
  for (let i = 0; i < 20; i++) {
    const inv = find();
    if (!inv) throw new Error('There is no invoice for this job yet.');
    if (!isLocal(inv.id)) return inv;
    if (i === 0) void field.flush();
    await wait(400);
  }
  throw new Error("The invoice hasn't reached the office yet. Try again in a moment.");
}

/** A payment for Tap to Pay, for what's still owed. Needs signal. */
export async function tapPayment(jobId: string): Promise<{ invoice: Invoice; tap: TapToPay }> {
  const invoice = await syncedInvoice(jobId);
  return { invoice, tap: await field.conn.client.payments.tap(invoice.id) };
}

/** The invoice as the engine has it now, for watching for a payment made on the customer's phone. */
export async function engineInvoice(jobId: string, invoiceId: string) {
  const list = await field.conn.client.invoices.forJob(jobId);
  return list.find((i) => i.id === invoiceId);
}

/**
 * After a tap Stripe tells the engine, not the phone, so read the invoice a
 * few times until the engine has it as paid, then bring the day up to date.
 */
export async function untilPaid(jobId: string, invoiceId: string) {
  for (let i = 0; i < 10; i++) {
    const inv = await engineInvoice(jobId, invoiceId).catch(() => undefined);
    if (inv?.status === 'paid') break;
    await wait(3000);
  }
  await field.refresh();
}

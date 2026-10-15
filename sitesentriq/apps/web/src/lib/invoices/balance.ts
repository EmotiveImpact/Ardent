import type { Payment } from '@haumea/types'

type PaymentAmount = Pick<Payment, 'amount'>

export function getInvoiceTotalPaid(payments: PaymentAmount[] | null | undefined): number {
  return (payments ?? []).reduce((sum, payment) => sum + (payment.amount || 0), 0)
}

export function getOutstandingInvoiceBalance(
  invoiceTotal: number,
  payments: PaymentAmount[] | null | undefined,
): number {
  return Math.max(0, invoiceTotal - getInvoiceTotalPaid(payments))
}

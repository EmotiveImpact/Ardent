import { formatCurrency, formatDate } from '@haumea/utils'

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface InvoicePdfData {
  invoice_number: string
  created_at: string
  due_date?: string
  client_name: string
  lines: { description: string; quantity: number; unit_price: number; total: number }[]
  subtotal: number
  tax: number
  total: number
}

interface QuotePdfLine {
  description: string
  quantity: number
  unit_price: number
  cost_price?: number | null
  markup_percent?: number | null
  tax_rate?: number | null
  total: number
}

interface QuotePdfData {
  quote_number: string
  quote_type?: string | null
  created_at: string
  valid_until?: string | null
  client_name: string
  property_name?: string | null
  notes?: string | null
  lines: QuotePdfLine[]
  subtotal: number
  tax: number
  total: number
}

interface PurchaseOrderPdfLine {
  description: string
  sku?: string | null
  quantity: number
  unit_cost: number
  tax_rate: number
  line_tax: number
  line_total: number
}

interface PurchaseOrderPdfData {
  po_number: string
  supplier_name: string
  property_name?: string | null
  job_title?: string | null
  order_date?: string | null
  expected_date?: string | null
  delivery_address?: string | null
  notes?: string | null
  lines: PurchaseOrderPdfLine[]
  subtotal: number
  tax: number
  total: number
}

/**
 * Open an HTML document in a new tab for printing / save-as-PDF.
 *
 * Uses a Blob URL with an EXPLICIT `text/html` MIME type instead of the legacy
 * `window.open('') + document.write` path. The old path could be MIME-sniffed by
 * some browsers and render the raw markup as TEXT — the "pdfs don't render, it's
 * just code in a new window" symptom. A text/html Blob URL always renders as a
 * document. An auto-print trigger is injected so the print dialog still pops once
 * the page has laid out (degrades gracefully to manual Ctrl/Cmd+P if a strict CSP
 * blocks the inline script — the document still renders either way).
 */
export function openPrintableHtml(html: string) {
  // Print via a hidden iframe rather than window.open(blobURL). The popup path
  // is unreliable: browsers block it when the call isn't inside a fresh user
  // gesture (e.g. after an `await`), and some MIME-sniff a blob tab as plain
  // text ("just shows code"). An off-screen iframe prints the document directly
  // into the browser's print dialog — where "Save as PDF" lives — with no popup.
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  iframe.srcdoc = html
  iframe.onload = () => {
    const w = iframe.contentWindow
    if (!w) {
      iframe.remove()
      return
    }
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      setTimeout(() => iframe.remove(), 500)
    }
    try {
      w.addEventListener('afterprint', cleanup)
    } catch {
      /* cross-origin guard — won't happen for srcdoc, but be safe */
    }
    try {
      w.focus()
      w.print()
    } catch {
      // Last-resort fallback: open the document in a new tab.
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }
    // Safety net if `afterprint` never fires (older Safari).
    setTimeout(cleanup, 60_000)
  }
  document.body.appendChild(iframe)
}

export function generateInvoicePdf(data: InvoicePdfData) {
  const lineRowsHtml = data.lines
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.description)}</td>
        <td class="numeric">${line.quantity}</td>
        <td class="numeric">${formatCurrency(line.unit_price)}</td>
        <td class="numeric strong">${formatCurrency(line.total)}</td>
      </tr>`
    )
    .join('')

  const vatRate = data.subtotal > 0 ? Math.round((data.tax / data.subtotal) * 100) : 0

  const body = `
  ${documentHeader({ docType: 'Invoice', docNumber: data.invoice_number, tagline: 'Facilities compliance and maintenance' })}

  <div class="meta-grid">
    <div>
      <div class="meta-block"><label>Bill To</label><span>${escapeHtml(data.client_name)}</span></div>
    </div>
    <div>
      <div class="meta-block"><label>Invoice Date</label><span>${formatDate(data.created_at)}</span></div>
      ${data.due_date ? `<div class="meta-block"><label>Due Date</label><span>${formatDate(data.due_date)}</span></div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="numeric">Qty</th>
        <th class="numeric">Unit Price</th>
        <th class="numeric">Total</th>
      </tr>
    </thead>
    <tbody>${lineRowsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="row"><label>Subtotal</label><span>${formatCurrency(data.subtotal)}</span></div>
    <div class="row"><label>VAT (${vatRate}%)</label><span>${formatCurrency(data.tax)}</span></div>
    <div class="row total-row"><label>Total</label><span>${formatCurrency(data.total)}</span></div>
  </div>`

  openPrintableHtml(
    documentShell(`Invoice ${data.invoice_number}`, body, { docType: 'INVOICE', docNumber: data.invoice_number }),
  )
}

function quoteTypeLabel(type?: string | null): string {
  if (type === 'service_quote' || type === 'service') return 'Service Quote'
  if (type === 'defect_quote' || type === 'reactive') return 'Defect Quote'
  return 'Quote'
}

interface DocumentHeaderOpts {
  docType: string
  docNumber: string
  tagline?: string
}

/**
 * Branded in-flow header: Haumea wordmark (brand orange) on the left,
 * document type + number on the right. Shared by all three document types so
 * the body of every PDF opens the same way.
 */
function documentHeader({ docType, docNumber, tagline }: DocumentHeaderOpts): string {
  return `
  <div class="header">
    <div>
      <div class="wordmark"><span class="wordmark-site">Hau</span><span class="wordmark-sentriq">mea</span></div>
      ${tagline ? `<div class="muted" style="font-size:12px;margin-top:5px;">${escapeHtml(tagline)}</div>` : ''}
    </div>
    <div class="header-doc">
      <div class="title">${escapeHtml(docType)}</div>
      <div class="number">${escapeHtml(docNumber)}</div>
    </div>
  </div>`
}

interface DocumentShellOpts {
  docType: string
  docNumber: string
}

/**
 * Full printable HTML document with a branded header band, fixed page footer
 * (generated date/time + page numbers via CSS @page counters), and shared
 * print-safe typography. `body` should begin with a documentHeader(...) block.
 */
function documentShell(title: string, body: string, opts: DocumentShellOpts): string {
  const generatedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const docLabel = `${opts.docType} · ${opts.docNumber}`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; font-size: 13px; line-height: 1.5; padding: 44px 48px 64px; }

    /* Branded header band */
    .brand-band { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 16px 22px; margin: -44px -48px 36px; background: #0f1225; border-bottom: 4px solid #e8772e; color: #fff; }
    .brand-band .band-wordmark { font-size: 19px; font-weight: 800; letter-spacing: -0.01em; }
    .brand-band .band-wordmark .accent { color: #e8772e; }
    .brand-band .band-doc { text-align: right; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #cbd5e1; }
    .brand-band .band-doc .band-doc-type { color: #e8772e; }

    /* In-flow document header */
    .header { display: flex; justify-content: space-between; gap: 32px; align-items: flex-start; margin-bottom: 30px; }
    .wordmark { font-size: 22px; font-weight: 800; letter-spacing: -0.015em; }
    .wordmark-site { color: #0f1225; }
    .wordmark-sentriq { color: #e8772e; }
    .header-doc { text-align: right; }
    .muted { color: #6b7280; }
    .title { font-size: 26px; font-weight: 760; color: #0f1225; letter-spacing: -0.02em; }
    .number { font-size: 13px; font-weight: 600; color: #e8772e; margin-top: 4px; letter-spacing: 0.02em; }

    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 30px; padding: 18px 20px; background: #f8fafc; border: 1px solid #eef1f5; border-radius: 10px; }
    .meta-block { margin-bottom: 12px; }
    .meta-block:last-child { margin-bottom: 0; }
    .meta-block label { display: block; font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
    .meta-block span, .meta-block p { font-size: 13px; color: #1f2937; line-height: 1.45; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
    thead th { padding: 9px 12px; font-size: 10px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; background: #e8772e; }
    thead th:first-child { border-top-left-radius: 6px; }
    thead th:last-child { border-top-right-radius: 6px; }
    thead th.numeric, tbody td.numeric { text-align: right; }
    tbody td { padding: 9px 12px; border-bottom: 1px solid #eef1f5; font-size: 13px; color: #374151; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #fbfcfd; }
    tbody td.strong { color: #0f1225; font-weight: 700; }
    tbody tr { page-break-inside: avoid; }

    .totals { display: flex; flex-direction: column; align-items: flex-end; gap: 7px; page-break-inside: avoid; }
    .totals .row { display: flex; gap: 32px; align-items: center; }
    .totals label { min-width: 86px; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; text-align: right; }
    .totals span { font-size: 13px; font-weight: 650; color: #111827; min-width: 120px; text-align: right; }
    .totals .total-row { margin-top: 5px; padding-top: 10px; border-top: 2px solid #e8772e; }
    .totals .total-row label { color: #0f1225; }
    .totals .total-row span { font-size: 16px; font-weight: 800; color: #0f1225; }

    .notes { margin-top: 26px; padding: 16px 18px; background: #f8fafc; border: 1px solid #eef1f5; border-left: 3px solid #e8772e; border-radius: 8px; page-break-inside: avoid; }

    /* Fixed page footer (repeats on every printed page) */
    .page-footer { position: fixed; left: 0; right: 0; bottom: 0; height: 36px; padding: 0 48px; display: flex; align-items: center; justify-content: space-between; gap: 24px; font-size: 10px; color: #94a3b8; border-top: 1px solid #eef1f5; background: #fff; }
    .page-footer .foot-brand strong { color: #e8772e; font-weight: 700; }
    .page-footer .foot-page::after { content: "Page " counter(page) " of " counter(pages); }

    @media screen {
      body { background: #f1f5f9; }
      body > :not(.brand-band):not(.page-footer) { /* keep content on white sheet feel handled below */ }
    }
    @media print {
      body { padding: 0 48px 56px; }
      .brand-band { margin: 0 -48px 36px; }
      .page-footer { padding: 0 48px; }
      @page { margin: 44px 0 56px; }
    }
  </style>
</head>
<body>
  <div class="brand-band">
    <div class="band-wordmark">Hau<span class="accent">mea</span></div>
    <div class="band-doc"><span class="band-doc-type">${escapeHtml(opts.docType)}</span> · ${escapeHtml(opts.docNumber)}</div>
  </div>
  ${body}
  <div class="page-footer">
    <div class="foot-brand"><strong>Haumea</strong> · ${escapeHtml(docLabel)}</div>
    <div class="foot-meta">Generated ${escapeHtml(generatedAt)} <span class="foot-page"></span></div>
  </div>
</body>
</html>`
}

export function generateQuotePdf(data: QuotePdfData) {
  const lineRowsHtml = data.lines
    .map((line) => {
      const taxRate = line.tax_rate ?? 20
      return `
      <tr>
        <td>${escapeHtml(line.description)}</td>
        <td class="numeric">${line.quantity}</td>
        <td class="numeric">${formatCurrency(line.cost_price ?? line.unit_price)}</td>
        <td class="numeric">${line.markup_percent ?? 0}%</td>
        <td class="numeric">${formatCurrency(line.unit_price)}</td>
        <td class="numeric">${taxRate}%</td>
        <td class="numeric strong">${formatCurrency(line.total)}</td>
      </tr>`
    })
    .join('')

  const body = `
  ${documentHeader({ docType: quoteTypeLabel(data.quote_type), docNumber: data.quote_number, tagline: 'Facilities compliance and maintenance' })}

  <div class="meta-grid">
    <div>
      <div class="meta-block"><label>Client</label><span>${escapeHtml(data.client_name)}</span></div>
      ${data.property_name ? `<div class="meta-block"><label>Property</label><span>${escapeHtml(data.property_name)}</span></div>` : ''}
    </div>
    <div>
      <div class="meta-block"><label>Date</label><span>${formatDate(data.created_at)}</span></div>
      ${data.valid_until ? `<div class="meta-block"><label>Valid Until</label><span>${formatDate(data.valid_until)}</span></div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="numeric">Qty</th>
        <th class="numeric">Cost</th>
        <th class="numeric">Markup</th>
        <th class="numeric">Sell</th>
        <th class="numeric">Tax</th>
        <th class="numeric">Line Total</th>
      </tr>
    </thead>
    <tbody>${lineRowsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="row"><label>Subtotal</label><span>${formatCurrency(data.subtotal)}</span></div>
    <div class="row"><label>Tax</label><span>${formatCurrency(data.tax)}</span></div>
    <div class="row total-row"><label>Total</label><span>${formatCurrency(data.total)}</span></div>
  </div>

  ${data.notes ? `<div class="notes"><div class="meta-block"><label>Notes</label><p>${escapeHtml(data.notes)}</p></div></div>` : ''}`

  openPrintableHtml(
    documentShell(`Quote ${data.quote_number}`, body, {
      docType: quoteTypeLabel(data.quote_type).toUpperCase(),
      docNumber: data.quote_number,
    }),
  )
}

export function generatePurchaseOrderPdf(data: PurchaseOrderPdfData) {
  const lineRowsHtml = data.lines
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.description)}</td>
        <td>${escapeHtml(line.sku || '-')}</td>
        <td class="numeric">${line.quantity}</td>
        <td class="numeric">${formatCurrency(line.unit_cost)}</td>
        <td class="numeric">${line.tax_rate}%</td>
        <td class="numeric">${formatCurrency(line.line_tax)}</td>
        <td class="numeric strong">${formatCurrency(line.line_total)}</td>
      </tr>`,
    )
    .join('')

  const body = `
  ${documentHeader({ docType: 'Purchase Order', docNumber: data.po_number, tagline: 'Supplier purchasing control' })}

  <div class="meta-grid">
    <div>
      <div class="meta-block"><label>Supplier</label><span>${escapeHtml(data.supplier_name)}</span></div>
      ${data.property_name ? `<div class="meta-block"><label>Property</label><span>${escapeHtml(data.property_name)}</span></div>` : ''}
      ${data.job_title ? `<div class="meta-block"><label>Job</label><span>${escapeHtml(data.job_title)}</span></div>` : ''}
    </div>
    <div>
      ${data.order_date ? `<div class="meta-block"><label>Order Date</label><span>${formatDate(data.order_date)}</span></div>` : ''}
      ${data.expected_date ? `<div class="meta-block"><label>Expected Date</label><span>${formatDate(data.expected_date)}</span></div>` : ''}
      ${data.delivery_address ? `<div class="meta-block"><label>Delivery Address</label><p>${escapeHtml(data.delivery_address)}</p></div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>SKU</th>
        <th class="numeric">Qty</th>
        <th class="numeric">Unit Cost</th>
        <th class="numeric">Tax %</th>
        <th class="numeric">Tax</th>
        <th class="numeric">Total</th>
      </tr>
    </thead>
    <tbody>${lineRowsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="row"><label>Subtotal</label><span>${formatCurrency(data.subtotal)}</span></div>
    <div class="row"><label>Tax</label><span>${formatCurrency(data.tax)}</span></div>
    <div class="row total-row"><label>Total</label><span>${formatCurrency(data.total)}</span></div>
  </div>

  ${data.notes ? `<div class="notes"><div class="meta-block"><label>Notes</label><p>${escapeHtml(data.notes)}</p></div></div>` : ''}`

  openPrintableHtml(
    documentShell(`Purchase Order ${data.po_number}`, body, {
      docType: 'PURCHASE ORDER',
      docNumber: data.po_number,
    }),
  )
}

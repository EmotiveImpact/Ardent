// src/components/shared/certificate-preview.tsx
// Reusable certificate preview / save / print modal content.
//
// The hot path is intentionally simple:
//   1. The parent passes either { jobId } or { complianceItemId }.
//   2. We call buildCertificate() to render the template to HTML.
//   3. We pump that HTML into a sandboxed <iframe> so the print
//      stylesheet / Plus Jakarta Sans / brand colours don't bleed
//      into the parent app.
//   4. "Print" → triggers iframe.contentWindow.print().
//      "Save copy" → calls generateCertificate() to upload + insert.
//
// We keep this component dumb about layout — callers wrap it in a
// HeroUI Modal or a card as needed.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Spinner } from '@haumea/ui'
import { Download, Printer, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  buildCertificate,
  generateCertificate,
  TEMPLATE_META,
  type CertificateType,
  type GenerateCertificateInput,
} from '@/lib/certificates'

interface CertificatePreviewProps {
  /** One of these two is required. */
  jobId?: string
  complianceItemId?: string
  /** Optional override of the inferred template type. */
  type?: CertificateType
  /** Called after a successful save with the new certificate id. */
  onSaved?: (result: {
    id: string
    certificate_number: string
    signed_url: string
    signed_pdf_url?: string | null
  }) => void
}

export function CertificatePreview({
  jobId,
  complianceItemId,
  type,
  onSaved,
}: CertificatePreviewProps) {
  const [html, setHtml] = useState<string | null>(null)
  const [resolvedType, setResolvedType] = useState<CertificateType>(
    type ?? 'generic',
  )
  const [certNumber, setCertNumber] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** Set after Save & Print resolves. When non-null, "Download PDF" replaces
   *  "Save & Print" and prefers the binary PDF. Falls back to HTML download
   *  via `savedSignedHtmlUrl` when Browserless wasn't configured. */
  const [savedSignedPdfUrl, setSavedSignedPdfUrl] = useState<string | null>(null)
  const [savedSignedHtmlUrl, setSavedSignedHtmlUrl] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)

  // Build the preview on mount / when inputs change.
  useEffect(() => {
    let cancelled = false
    async function run() {
      setHtml(null)
      setError(null)
      try {
        const built = await buildCertificate({
          jobId,
          complianceItemId,
          type,
        })
        if (cancelled) return
        setHtml(built.html)
        setResolvedType(built.type)
        setCertNumber(built.data.certificate_number)
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [jobId, complianceItemId, type])

  // Pump the HTML into the iframe via srcDoc — works without same-origin
  // navigation and isolates print styles cleanly.
  const srcDoc = useMemo(() => html ?? '', [html])

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow
    if (!win) {
      toast.error('Preview not ready yet')
      return
    }
    try {
      win.focus()
      win.print()
    } catch (err) {
      console.error('[certificate-preview] print failed', err)
      toast.error('Could not open print dialog')
    }
  }

  const handleSave = async () => {
    if (!jobId && !complianceItemId) return
    setSaving(true)
    try {
      const input: GenerateCertificateInput = {
        jobId,
        complianceItemId,
        type,
      }
      const result = await generateCertificate(input)
      setSavedSignedHtmlUrl(result.signed_url || null)
      setSavedSignedPdfUrl(result.signed_pdf_url || null)
      const tail =
        result.pdf_render_mode === 'browserless' && result.signed_pdf_url
          ? ' — PDF ready'
          : ''
      toast.success(`Certificate saved — ${result.certificate_number}${tail}`)
      onSaved?.({
        id: result.id,
        certificate_number: result.certificate_number,
        signed_url: result.signed_url,
        signed_pdf_url: result.signed_pdf_url,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[certificate-preview] save failed', err)
      toast.error(`Save failed: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  /** Default the post-save download to the binary PDF when available;
   *  fall back to the saved HTML signed URL when Browserless is not
   *  configured on the project. */
  const handleDownloadSaved = () => {
    const url = savedSignedPdfUrl || savedSignedHtmlUrl
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleDownload = () => {
    if (!html) return
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${TEMPLATE_META[resolvedType].fileSlug}-${certNumber || 'preview'}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (error) {
    return (
      <Card className="!gap-0 !rounded-xl !bg-surface-card !shadow-none border border-border-default !p-5">
        <p className="text-label text-status-overdue">
          Failed to build certificate preview: {error}
        </p>
      </Card>
    )
  }

  if (!html) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Spinner size="md" />
        <p className="text-caption text-text-muted">Building certificate preview…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">
            {TEMPLATE_META[resolvedType].label}
          </p>
          <p className="text-label font-semibold text-text-primary tracking-[-0.01em]">
            {certNumber}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onPress={handleDownload}>
            <Download size={14} />
            Download HTML
          </Button>
          <Button variant="outline" size="sm" onPress={handlePrint}>
            <Printer size={14} />
            Print
          </Button>
          {savedSignedPdfUrl || savedSignedHtmlUrl ? (
            <Button
              variant="primary"
              size="sm"
              onPress={handleDownloadSaved}
            >
              <Download size={14} />
              {savedSignedPdfUrl ? 'Download PDF' : 'Download saved HTML'}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onPress={handleSave}
              isDisabled={saving}
            >
              <Save size={14} />
              {saving ? 'Saving…' : 'Save & Print'}
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-border-default bg-surface-page overflow-hidden">
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          title={`Certificate preview ${certNumber}`}
          sandbox="allow-same-origin allow-modals allow-popups"
          className="w-full"
          style={{ height: '720px', border: 0, background: '#fff' }}
        />
      </div>
      <p className="text-micro text-text-muted">
        Save & Print persists a portable HTML record and — when
        <code className="mx-1 px-1 bg-surface-page rounded">BROWSERLESS_TOKEN</code>
        is configured on the
        <code className="mx-1 px-1 bg-surface-page rounded">generate-certificate</code>
        edge function — also stores a binary PDF rendered by a headless
        browser. The Download button prefers the PDF when available.
      </p>
    </div>
  )
}

// White-label branding settings (Wave 12 / Task 109).
//
// Two-column layout: form on the left, live preview on the right.
// Plan-gated behind Growth — Starter users see the upgrade modal.

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@haumea/ui'
import { SkeletonBox, FormSkeleton } from '@/components/shared/skeletons'
import { AppCard } from '@haumea/ui'
import {
  Palette,
  Upload as UploadIcon,
  AlertCircle,
  Check,
  ShieldCheck,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { SectionHeader } from '@/components/shared/section-header'
import { UpgradeModal } from '@/components/shared/upgrade-modal'
import { useAuth } from '@/hooks/use-auth'
import { useSubscription } from '@/hooks/use-subscription'
import { planAllows } from '@/lib/billing/plan-gating'
import {
  useOrgBranding,
  useUpdateBranding,
  useUploadLogo,
} from '@/lib/branding/hooks'
import { ACCENT_PRESETS } from '@/lib/branding/types'
import {
  deriveDarkAccent,
  isValidHex,
  passesContrastOnWhiteText,
} from '@/lib/branding/validate'
import {
  buildTrustUrl,
  isValidSlug,
  suggestSlug,
  useTrustUrlSettings,
  useUpdateTrustUrlSettings,
} from '@/hooks/use-trust-url'

const inputClass =
  'bg-surface-card border border-border-default rounded-lg text-label px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-navy-950/30'

const labelClass =
  'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'

const MAX_LOGO_BYTES = 1024 * 1024 // 1 MB

interface FormState {
  branding_enabled: boolean
  logo_url: string | null
  accent_color: string
  support_email: string
  support_phone: string
  portal_welcome_message: string
  portal_terms_url: string
}

const EMPTY_FORM: FormState = {
  branding_enabled: false,
  logo_url: null,
  accent_color: '#e8772e',
  support_email: '',
  support_phone: '',
  portal_welcome_message: '',
  portal_terms_url: '',
}

export default function BrandingSettingsPage() {
  const { profile, organisation } = useAuth()
  const orgId = profile?.organisation_id ?? ''
  const { data: subscription } = useSubscription()
  const { data: branding, isLoading } = useOrgBranding(orgId)
  const updateBranding = useUpdateBranding()
  const uploadLogo = useUploadLogo()

  const allowed = planAllows(subscription?.plan, 'branding')

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [dragOver, setDragOver] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)

  // Hydrate the form once branding loads.
  useEffect(() => {
    if (!branding) return
    setForm({
      branding_enabled: branding.branding_enabled ?? false,
      logo_url: branding.logo_url ?? null,
      accent_color: branding.accent_color ?? '#e8772e',
      support_email: branding.support_email ?? '',
      support_phone: branding.support_phone ?? '',
      portal_welcome_message: branding.portal_welcome_message ?? '',
      portal_terms_url: branding.portal_terms_url ?? '',
    })
  }, [branding])

  const accentValid = isValidHex(form.accent_color)
  const accentDark = useMemo(
    () => (accentValid ? deriveDarkAccent(form.accent_color) ?? '#0e9a7e' : '#0e9a7e'),
    [form.accent_color, accentValid],
  )
  const contrastOk = passesContrastOnWhiteText(form.accent_color)

  const handleLogoFile = async (file: File) => {
    if (!file) return
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logo too large — please keep it under 1 MB.')
      return
    }
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.type)) {
      toast.error('Logo must be PNG, JPG, SVG, or WebP.')
      return
    }
    try {
      setLogoUploading(true)
      const url = await uploadLogo.mutateAsync(file)
      setForm((f) => ({ ...f, logo_url: url }))
      toast.success('Logo uploaded')
    } catch (err) {
      toast.error('Logo upload failed')
       
      console.error('[branding] logo upload', err)
    } finally {
      setLogoUploading(false)
    }
  }

  const onSave = async () => {
    if (!orgId) return
    if (form.branding_enabled && !accentValid) {
      toast.error('Accent colour must be a valid hex (e.g. #e8772e).')
      return
    }
    try {
      await updateBranding.mutateAsync({
        organisation_id: orgId,
        branding_enabled: form.branding_enabled,
        logo_url: form.logo_url,
        accent_color: form.branding_enabled ? form.accent_color : null,
        accent_color_dark: form.branding_enabled ? accentDark : null,
        support_email: form.support_email.trim() || null,
        support_phone: form.support_phone.trim() || null,
        portal_welcome_message: form.portal_welcome_message.trim() || null,
        portal_terms_url: form.portal_terms_url.trim() || null,
      })
      toast.success('Branding live in your client portal')
    } catch (err) {
      toast.error('Could not save branding — please try again.')
       
      console.error('[branding] save', err)
    }
  }

  // Plan gating — Starter shows the soft paywall but keeps the breadcrumbs.
  if (!allowed) {
    return (
      <div className="space-y-6 max-w-[1200px]">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', path: '/dashboard' },
            { label: 'Settings', path: '/dashboard/settings' },
            { label: 'Branding' },
          ]}
        />
        <SectionHeader
          variant="page"
          title="White-label branding"
          subtitle="Show your logo and brand colours in the client portal."
        />
        <UpgradeModal isOpen={true} feature="branding" />
      </div>
    )
  }

  if (isLoading) {
    return <FormSkeleton fields={6} />
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Settings', path: '/dashboard/settings' },
          { label: 'Branding' },
        ]}
      />

      <SectionHeader
        variant="page"
        title="White-label branding"
        subtitle="Show your logo and brand colours in the client portal — your customers see YOUR brand, powered by Haumea behind the scenes."
        action={
          <Button
            variant="primary"
            size="sm"
            onPress={onSave}
            isDisabled={updateBranding.isPending || !orgId}
          >
            {updateBranding.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── FORM ──────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Enable toggle */}
          <AppCard padding="md">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.branding_enabled}
                onChange={(e) =>
                  setForm({ ...form, branding_enabled: e.target.checked })
                }
                className="mt-1 rounded border-border-strong accent-brand-500"
              />
              <div className="flex-1">
                <div className="text-body font-semibold text-text-primary">
                  Enable white-label branding
                </div>
                <p className="text-caption text-text-muted mt-0.5">
                  When off, the client portal shows the default Haumea look.
                  When on, your customers see your logo, colours, and contact
                  details in the portal.
                </p>
              </div>
            </label>
          </AppCard>

          {/* Logo upload */}
          <AppCard padding="md">
            <label className={labelClass}>Company logo</label>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const file = e.dataTransfer.files?.[0]
                if (file) void handleLogoFile(file)
              }}
              className={`border-2 border-dashed rounded-lg px-4 py-6 text-center transition-colors ${
                dragOver
                  ? 'border-brand-500 bg-brand-500/5'
                  : 'border-border-default bg-surface-page'
              }`}
            >
              {form.logo_url ? (
                <div className="flex items-center justify-center gap-3">
                  <img
                    src={form.logo_url}
                    alt="Logo preview"
                    className="h-12 max-w-[200px] object-contain"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => setForm({ ...form, logo_url: null })}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <UploadIcon size={20} className="text-text-muted" />
                  <p className="text-label text-text-secondary">
                    Drop your logo here, or
                  </p>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-elevated border border-border-default text-caption font-medium text-text-secondary hover:bg-surface-page cursor-pointer transition-colors">
                    {logoUploading ? 'Uploading…' : 'Choose file'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void handleLogoFile(f)
                      }}
                    />
                  </label>
                  <p className="text-micro text-text-muted mt-1">
                    PNG, JPG, SVG or WebP · max 1 MB
                  </p>
                </div>
              )}
            </div>
          </AppCard>

          {/* Accent colour */}
          <AppCard padding="md">
            <label className={labelClass}>Accent colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={accentValid ? form.accent_color : '#e8772e'}
                onChange={(e) =>
                  setForm({ ...form, accent_color: e.target.value })
                }
                className="h-10 w-12 rounded-md border border-border-default cursor-pointer"
                aria-label="Pick accent colour"
              />
              <input
                type="text"
                value={form.accent_color}
                onChange={(e) =>
                  setForm({ ...form, accent_color: e.target.value })
                }
                placeholder="#e8772e"
                className={`${inputClass} font-mono text-caption`}
              />
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setForm({ ...form, accent_color: p.value })}
                  title={p.name}
                  aria-label={`Use ${p.name} preset`}
                  className={`w-7 h-7 rounded-md border-2 transition-all ${
                    form.accent_color.toLowerCase() === p.value.toLowerCase()
                      ? 'border-text-primary scale-110'
                      : 'border-border-default hover:border-text-secondary'
                  }`}
                  style={{ background: p.value }}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-caption">
              <span className="text-text-muted">Hover/active:</span>
              <span
                className="inline-block w-4 h-4 rounded border border-border-default"
                style={{ background: accentDark }}
              />
              <span className="font-mono text-text-muted">{accentDark}</span>
            </div>
            {accentValid && !contrastOk && (
              <div className="mt-3 flex items-start gap-2 text-caption text-status-due-soon">
                <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  Low contrast against white text — buttons may be hard to
                  read. Pick a darker shade for WCAG AA (4.5:1).
                </span>
              </div>
            )}
            {accentValid && contrastOk && (
              <div className="mt-3 flex items-start gap-2 text-caption text-status-compliant">
                <Check size={13} className="mt-0.5 flex-shrink-0" />
                <span>Passes WCAG AA contrast against white text.</span>
              </div>
            )}
          </AppCard>

          {/* Support contact */}
          <AppCard padding="md" className="space-y-4">
            <div>
              <label className={labelClass}>Support email</label>
              <input
                type="email"
                value={form.support_email}
                onChange={(e) =>
                  setForm({ ...form, support_email: e.target.value })
                }
                placeholder="help@yourcompany.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Support phone</label>
              <input
                type="tel"
                value={form.support_phone}
                onChange={(e) =>
                  setForm({ ...form, support_phone: e.target.value })
                }
                placeholder="+44 20 1234 5678"
                className={inputClass}
              />
            </div>
          </AppCard>

          {/* Welcome message + terms */}
          <AppCard padding="md" className="space-y-4">
            <div>
              <label className={labelClass}>Portal welcome message</label>
              <textarea
                value={form.portal_welcome_message}
                onChange={(e) =>
                  setForm({ ...form, portal_welcome_message: e.target.value })
                }
                rows={3}
                placeholder="Welcome to your service portal. Track every visit, document, and invoice in one place."
                className={inputClass}
              />
              <p className="text-micro text-text-muted mt-1">
                Plain text or simple Markdown. Shown on the portal home page.
              </p>
            </div>
            <div>
              <label className={labelClass}>Portal terms URL</label>
              <input
                type="url"
                value={form.portal_terms_url}
                onChange={(e) =>
                  setForm({ ...form, portal_terms_url: e.target.value })
                }
                placeholder="https://yourcompany.com/terms"
                className={inputClass}
              />
            </div>
          </AppCard>

          {/* Public Trust URL — Strategic 1 follow-up */}
          <TrustUrlSection orgName={organisation?.name ?? ''} />
        </div>

        {/* ── LIVE PREVIEW ─────────────────────────────────── */}
        <div className="lg:sticky lg:top-6 self-start">
          <AppCard padding="none" className="overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b border-border-subtle bg-surface-page flex items-center gap-2">
              <Palette size={14} className="text-text-muted" />
              <span className="text-caption font-medium text-text-secondary">
                Live preview · how your client portal will look
              </span>
            </div>
            <div className="bg-surface-page">
              {/* Mock portal header */}
              <div className="px-5 py-3 bg-surface-card border-b border-border-default flex items-center gap-3">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Logo"
                    className="h-7 max-w-[120px] object-contain"
                  />
                ) : (
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{
                      background: accentValid
                        ? form.accent_color
                        : '#e8772e',
                    }}
                  >
                    <span className="text-white font-bold text-micro">
                      {(organisation?.name ?? 'H').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-label font-semibold text-text-primary">
                  {organisation?.name ?? 'Your company'}
                </span>
                <div className="ml-auto flex items-center gap-1 text-micro text-text-muted">
                  <span>Service Portal</span>
                </div>
              </div>
              {/* Mock body */}
              <div className="p-5 space-y-4">
                <div>
                  <h3 className="text-[15px] font-semibold text-text-primary">
                    Welcome back
                  </h3>
                  <p className="text-caption text-text-muted mt-1 whitespace-pre-line">
                    {form.portal_welcome_message ||
                      'Track every visit, document, and invoice in one place.'}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-md text-caption font-semibold text-white transition-colors"
                    style={{
                      background: accentValid ? form.accent_color : '#e8772e',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = accentDark
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = accentValid
                        ? form.accent_color
                        : '#e8772e'
                    }}
                  >
                    Submit a request
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-md text-caption font-medium text-text-secondary border border-border-default bg-surface-card"
                  >
                    View history
                  </button>
                </div>

                <div className="rounded-lg border border-border-default bg-surface-card p-3">
                  <div className="text-micro font-medium text-text-muted uppercase tracking-[0.04em] mb-1">
                    Need help?
                  </div>
                  <div className="text-caption text-text-secondary">
                    {form.support_email ? (
                      <span style={{ color: accentValid ? form.accent_color : '#e8772e' }}>
                        {form.support_email}
                      </span>
                    ) : (
                      <span className="text-text-muted">No support email set</span>
                    )}
                    {form.support_phone && (
                      <span className="ml-2 text-text-muted">
                        · {form.support_phone}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-[10px] text-text-muted text-center pt-2">
                  {organisation?.name ?? 'Your company'} · Powered by Haumea
                </div>
              </div>
            </div>
          </AppCard>

          {!form.branding_enabled && (
            <p className="text-micro text-text-muted mt-3 italic">
              Note: white-label is currently OFF. Save and toggle on to apply
              this look to your live client portal.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Public Trust URL section — Vanta-style continuous-compliance page.
// Lives next to branding because it shares the same audience (org
// admins thinking about how their company shows up to customers and
// auditors) and the same plan tier — though it's NOT plan-gated yet
// because it's a top-of-funnel growth lever.
// ─────────────────────────────────────────────────────────────────

interface TrustUrlSectionProps {
  orgName: string
}

function TrustUrlSection({ orgName }: TrustUrlSectionProps) {
  const { data: settings, isLoading } = useTrustUrlSettings()
  const update = useUpdateTrustUrlSettings()

  // Local form state — hydrate once from server, then user-controlled
  // until they save or refresh.
  const [enabled, setEnabled] = useState(false)
  const [slug, setSlug] = useState('')
  const [showBreakdown, setShowBreakdown] = useState(true)
  const [showHistory, setShowHistory] = useState(true)
  const [touchedSlug, setTouchedSlug] = useState(false)

  useEffect(() => {
    if (!settings) return
    setEnabled(settings.trust_url_enabled)
    setSlug(settings.trust_url_slug ?? '')
    setShowBreakdown(settings.trust_url_show_breakdown)
    setShowHistory(settings.trust_url_show_history)
  }, [settings])

  // Auto-suggest a slug from the org name when the user has never
  // touched the field. Once they edit it (or hydrate from a saved
  // value) we leave it alone.
  useEffect(() => {
    if (!enabled) return
    if (touchedSlug) return
    if (slug) return
    if (!orgName) return
    const suggested = suggestSlug(orgName)
    if (suggested) setSlug(suggested)
  }, [enabled, orgName, slug, touchedSlug])

  const slugValid = !slug || isValidSlug(slug)
  const previewUrl = useMemo(() => (slug ? buildTrustUrl(slug) : ''), [slug])

  const onCopy = async () => {
    if (!previewUrl) return
    try {
      await navigator.clipboard.writeText(previewUrl)
      toast.success('Trust URL copied to clipboard')
    } catch {
      toast.error('Could not access clipboard — copy the link manually.')
    }
  }

  const onSave = async () => {
    try {
      await update.mutateAsync({
        trust_url_slug: slug || null,
        trust_url_enabled: enabled,
        trust_url_show_breakdown: showBreakdown,
        trust_url_show_history: showHistory,
      })
    } catch {
      // Toast handled inside the hook.
    }
  }

  return (
    <AppCard padding="md">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={16} className="text-brand-600" />
        </div>
        <div className="flex-1">
          <p className="text-body font-semibold text-text-primary">
            Public Trust URL
          </p>
          <p className="text-caption text-text-muted mt-0.5 leading-relaxed">
            Share a no-login link that proves your continuous compliance to
            insurers, auditors, prospects, and your board. We publish your live
            Compliance Score and (optionally) a 30-day trend.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <SkeletonBox className="h-4 w-48" />
          <SkeletonBox className="h-10 w-full rounded-lg" />
          <SkeletonBox className="h-10 w-full rounded-lg" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Enable toggle */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-1 rounded border-border-strong accent-brand-500"
            />
            <div className="flex-1">
              <div className="text-label font-medium text-text-primary">
                Publish a public Trust URL
              </div>
              <p className="text-micro text-text-muted mt-0.5">
                When off, your Trust URL returns &ldquo;page not found&rdquo;.
              </p>
            </div>
          </label>

          {enabled && (
            <>
              {/* Slug + URL preview */}
              <div>
                <label className={labelClass}>URL slug</label>
                <div className="flex items-center gap-2">
                  <span className="text-caption text-text-muted whitespace-nowrap">
                    haumea.io/trust/
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setTouchedSlug(true)
                      setSlug(e.target.value.toLowerCase())
                    }}
                    onBlur={() => setTouchedSlug(true)}
                    placeholder="acme-fm"
                    className={`${inputClass} font-mono text-caption`}
                    spellCheck={false}
                    autoCapitalize="off"
                  />
                </div>
                {slug && !slugValid && (
                  <div className="mt-2 flex items-start gap-2 text-micro text-status-overdue">
                    <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                    <span>
                      Slug must be 3-32 chars, lowercase a-z, 0-9, and hyphens
                      only. No leading/trailing or doubled hyphens.
                    </span>
                  </div>
                )}
                {slug && slugValid && previewUrl && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <code className="text-micro font-mono text-text-secondary bg-surface-page border border-border-subtle rounded px-2 py-1 truncate max-w-full">
                      {previewUrl}
                    </code>
                    <button
                      type="button"
                      onClick={onCopy}
                      className="inline-flex items-center gap-1 text-micro font-medium text-brand-600 hover:text-brand-700"
                    >
                      <Copy size={11} /> Copy
                    </button>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-micro font-medium text-brand-600 hover:text-brand-700"
                    >
                      <ExternalLink size={11} /> Preview
                    </a>
                  </div>
                )}
              </div>

              {/* Privacy toggles */}
              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBreakdown}
                    onChange={(e) => setShowBreakdown(e.target.checked)}
                    className="mt-1 rounded border-border-strong accent-brand-500"
                  />
                  <div className="flex-1">
                    <div className="text-caption font-medium text-text-primary">
                      Publish the four sub-metrics
                    </div>
                    <p className="text-micro text-text-muted mt-0.5">
                      Compliance items, PPM on-time, first-time pass rate,
                      action health. Off = headline number only.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showHistory}
                    onChange={(e) => setShowHistory(e.target.checked)}
                    className="mt-1 rounded border-border-strong accent-brand-500"
                  />
                  <div className="flex-1">
                    <div className="text-caption font-medium text-text-primary">
                      Publish the 30-day trend
                    </div>
                    <p className="text-micro text-text-muted mt-0.5">
                      Shows how your score has moved over the last month.
                    </p>
                  </div>
                </label>
              </div>
            </>
          )}

          <div className="pt-2">
            <Button
              variant="primary"
              size="sm"
              onPress={onSave}
              isDisabled={update.isPending || (enabled && (!slug || !slugValid))}
            >
              {update.isPending ? 'Saving…' : 'Save Trust URL settings'}
            </Button>
          </div>
        </div>
      )}
    </AppCard>
  )
}

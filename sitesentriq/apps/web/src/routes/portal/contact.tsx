import { Building2, Mail, Phone } from 'lucide-react'
import { AppCard, PageHeader } from '@haumea/ui'
import { useOrganisation } from '@/hooks/use-organisation'
import { FormSkeleton } from '@/components/shared/skeletons'

export default function PortalContactPage() {
  const { organisation, isLoading } = useOrganisation()

  if (isLoading) {
    return <FormSkeleton fields={4} />
  }

  // Pull contact details from the organisations row (00034 added
  // support_email / support_phone). Used to be hardcoded
  // "support@haumea.com" / "+44 20 1234 5678" / a London address —
  // wrong for any white-labelled deploy and useless to the actual
  // FM team this portal is meant to surface.
  const supportEmail = organisation?.support_email?.trim() || null
  const supportPhone = organisation?.support_phone?.trim() || null

  return (
    <div className="space-y-6 max-w-[600px]">
      <div>
        <PageHeader title="Contact" subtitle="Get in touch with your facilities management team" />
      </div>

      <AppCard padding="lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center">
            <Building2 size={22} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-text-primary">
              {organisation?.name || 'Your Facilities Manager'}
            </h2>
            <p className="text-label text-text-muted">Facilities Management</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Email — clickable mailto when present, otherwise a fallback note. */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-page">
            <Mail size={16} className="text-text-muted mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-0.5">
                Email
              </p>
              {supportEmail ? (
                <a
                  href={`mailto:${supportEmail}`}
                  className="text-label text-text-secondary hover:text-brand-600 transition-colors"
                >
                  {supportEmail}
                </a>
              ) : (
                <p className="text-label text-text-muted italic">
                  Not configured — ask your FM team to set a support email in Settings
                </p>
              )}
            </div>
          </div>

          {/* Phone — clickable tel: when present, fallback when not. */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-surface-page">
            <Phone size={16} className="text-text-muted mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-0.5">
                Phone
              </p>
              {supportPhone ? (
                <a
                  href={`tel:${supportPhone.replace(/\s+/g, '')}`}
                  className="text-label text-text-secondary hover:text-brand-600 transition-colors"
                >
                  {supportPhone}
                </a>
              ) : (
                <p className="text-label text-text-muted italic">
                  Not configured — ask your FM team to set a support phone in Settings
                </p>
              )}
            </div>
          </div>
        </div>
      </AppCard>

      <AppCard padding="lg">
        <h3 className="text-body font-semibold text-text-primary mb-2">Need urgent help?</h3>
        <p className="text-label text-text-muted">
          For emergency issues such as flooding, gas leaks, or security breaches, please
          {supportPhone ? (
            <>
              {' '}
              call{' '}
              <a
                href={`tel:${supportPhone.replace(/\s+/g, '')}`}
                className="font-medium text-brand-600 hover:underline"
              >
                {supportPhone}
              </a>
              {' '}directly.
            </>
          ) : (
            ' contact the emergency line directly.'
          )}
          {' '}For routine enquiries, email is preferred.
        </p>
      </AppCard>
    </div>
  )
}

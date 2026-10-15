/**
 * Field-mode customer signature capture.
 *
 * Wraps the existing shared `SignaturePad` (canvas + pointer/touch handling)
 * with the metadata inputs the captain needs:
 *   - Customer name
 *   - Role (Authorised Site Contact, etc.)
 *   - Optional contact email/phone
 *   - "Email me a copy" toggle
 *
 * Returns a structured payload to the parent so the caller decides what to do
 * with the data URL (upload to Supabase Storage, attach to a job complete
 * mutation, etc).
 */
import { useState } from 'react'
import { Button, Spinner } from '@haumea/ui'
import { FormSelect } from '@haumea/ui'
import { Mail, PenLine, User } from 'lucide-react'
import { SignaturePad as RawSignaturePad } from '@/components/shared/signature-pad'

export const CUSTOMER_ROLES = [
  { value: 'authorised_site_contact', label: 'Authorised Site Contact' },
  { value: 'site_manager',            label: 'Site Manager' },
  { value: 'duty_holder',             label: 'Duty Holder' },
  { value: 'tenant',                  label: 'Tenant' },
  { value: 'other',                   label: 'Other' },
] as const

export type CustomerRoleValue = (typeof CUSTOMER_ROLES)[number]['value']

export interface CustomerSignaturePayload {
  name: string
  role: CustomerRoleValue
  email?: string
  phone?: string
  emailCopy: boolean
  /** PNG data URL of the captured signature. */
  dataUrl: string
}

interface FieldSignaturePadProps {
  /** Called when the user submits a complete signature payload. */
  onSubmit: (payload: CustomerSignaturePayload) => Promise<void> | void
  /** Optional pending state from the parent (used to show a spinner). */
  isSubmitting?: boolean
  /** Heading shown above the form. */
  title?: string
}

const inputCls =
  'w-full border border-border-default rounded-lg px-3 py-2 text-label bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors'
const labelCls =
  'block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5'

export function FieldSignaturePad({ onSubmit, isSubmitting, title = 'Customer signature' }: FieldSignaturePadProps) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<CustomerRoleValue>('authorised_site_contact')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [emailCopy, setEmailCopy] = useState(false)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setEmail('')
    setPhone('')
    setEmailCopy(false)
    setSignatureDataUrl(null)
    setError(null)
  }

  async function handleSubmit() {
    setError(null)
    if (!name.trim()) {
      setError('Please enter the signer\'s name.')
      return
    }
    if (!signatureDataUrl) {
      setError('Please capture a signature before submitting.')
      return
    }
    if (emailCopy && !email.trim()) {
      setError('Provide an email address to send a copy.')
      return
    }
    await onSubmit({
      name: name.trim(),
      role,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      emailCopy,
      dataUrl: signatureDataUrl,
    })
    reset()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <PenLine size={15} className="text-brand-500" />
        <h4 className="text-body font-semibold text-text-primary">{title}</h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            <span className="inline-flex items-center gap-1.5">
              <User size={11} />
              Name <span className="text-status-overdue">*</span>
            </span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Customer full name"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Role</label>
          <FormSelect<CustomerRoleValue>
            value={role}
            onChange={setRole}
            ariaLabel="Role"
            options={CUSTOMER_ROLES.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>
        <div>
          <label className={labelCls}>
            <span className="inline-flex items-center gap-1.5">
              <Mail size={11} />
              Email (optional)
            </span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Phone (optional)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+44 7700 900000"
            className={inputCls}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-label text-text-secondary">
        <input
          type="checkbox"
          checked={emailCopy}
          onChange={(e) => setEmailCopy(e.target.checked)}
          className="rounded border-border-default"
        />
        Email customer a copy of the signed receipt
      </label>

      <RawSignaturePad
        label="Customer signs here"
        height={200}
        onSave={(dataUrl) => setSignatureDataUrl(dataUrl)}
        onClear={() => setSignatureDataUrl(null)}
      />

      {signatureDataUrl && (
        <p className="text-caption text-status-compliant">Signature captured. Click submit when ready.</p>
      )}

      {error && <p className="text-caption text-status-overdue">{error}</p>}

      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          onPress={handleSubmit}
          isDisabled={!signatureDataUrl || !name.trim() || !!isSubmitting}
        >
          {isSubmitting && <Spinner size="sm" />}
          Submit & complete
        </Button>
      </div>
    </div>
  )
}

export default FieldSignaturePad

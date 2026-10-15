import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import { Button, Chip } from '@haumea/ui'
import { AppCard, PageHeader, Heading, Text } from '@haumea/ui'
import { ArrowLeft, Pencil, Trash2, Plus, Building2, Mail, Phone, MapPin, StickyNote, UserCircle, ReceiptText, Save, X, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useClient, useDeleteClient, useUpdateClient } from '@/hooks/use-clients'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Timeline } from '@/components/shared/timeline'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import type { Property, PropertyWithRelations } from '@haumea/types'

// 5 fields persisted by migration 00043 — surfaced as editable in B5.
// Stored at the client level (not per-property) per the user's
// hierarchy spec. `client_code` is shown on every billing surface so
// the same code accompanies its 5 billing fields here.
interface BillingDraft {
  client_code: string
  billing_email: string
  billing_address: string
  billing_terms: string
  tax_number: string
}

const EMPTY_BILLING: BillingDraft = {
  client_code: '',
  billing_email: '',
  billing_address: '',
  billing_terms: '',
  tax_number: '',
}

// Sprint 1.5 / H3 — Field-level validation for the billing draft.
// Rules are deliberately permissive so we don't reject sensible-looking
// values from non-UK orgs (US EIN, IE VAT, etc.). All fields are
// optional — empty strings pass.
//
//   client_code   alphanumeric + dashes/underscores, 2–32 chars
//   billing_email basic RFC-ish shape — local@domain.tld
//   tax_number    8–20 chars, letters/digits/spaces/dashes only — covers
//                 GB123456789, IE1234567X, US 12-3456789, etc.
const RX_CLIENT_CODE = /^[A-Za-z0-9_-]{2,32}$/
const RX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const RX_TAX_NUMBER = /^[A-Za-z0-9 -]{8,20}$/

type BillingErrors = Partial<Record<keyof BillingDraft, string>>

export function validateBillingDraft(draft: BillingDraft): BillingErrors {
  const errors: BillingErrors = {}
  const code = draft.client_code.trim()
  if (code && !RX_CLIENT_CODE.test(code)) {
    errors.client_code = '2–32 chars, letters / digits / dash / underscore'
  }
  const email = draft.billing_email.trim()
  if (email && !RX_EMAIL.test(email)) {
    errors.billing_email = "Doesn't look like a valid email"
  }
  const tax = draft.tax_number.trim()
  if (tax && !RX_TAX_NUMBER.test(tax)) {
    errors.tax_number = '8–20 chars — letters, digits, spaces, dashes'
  }
  return errors
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: client, isLoading, error } = useClient(id!)
  const deleteClient = useDeleteClient()
  const updateClient = useUpdateClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Inline edit state for the Client Billing panel. Closed by default
  // — clicking "Edit billing" loads current values into the draft and
  // toggles the panel into form mode. Save dispatches an update via
  // useUpdateClient and reverts to read mode on success.
  const [billingEditing, setBillingEditing] = useState(false)
  const [billingDraft, setBillingDraft] = useState<BillingDraft>(EMPTY_BILLING)

  const handleDelete = async () => {
    await deleteClient.mutateAsync(id!)
    navigate('/dashboard/clients')
  }

  const startBillingEdit = () => {
    if (!client) return
    setBillingDraft({
      client_code: client.client_code ?? '',
      billing_email: client.billing_email ?? '',
      billing_address: client.billing_address ?? '',
      billing_terms: client.billing_terms ?? '',
      tax_number: client.tax_number ?? '',
    })
    setBillingEditing(true)
  }

  const cancelBillingEdit = () => {
    setBillingEditing(false)
    setBillingDraft(EMPTY_BILLING)
  }

  // Recompute on every render so error state follows the draft live —
  // useMemo to avoid wasting cycles when the draft hasn't changed.
  const billingErrors = useMemo(() => validateBillingDraft(billingDraft), [billingDraft])
  const hasBillingErrors = Object.keys(billingErrors).length > 0

  const saveBillingEdit = async () => {
    if (!id) return
    // Block on validation — surface a toast so the user knows why the
    // save didn't go through (the inline errors handle the "where").
    if (hasBillingErrors) {
      toast.error('Fix the highlighted billing fields before saving')
      return
    }
    // Empty strings → null so we don't shove "" rows into the DB.
    await updateClient.mutateAsync({
      id,
      ...Object.fromEntries(
        Object.entries(billingDraft).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()]),
      ),
    })
    toast.success('Billing details updated')
    setBillingEditing(false)
  }

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (error || !client) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard/clients" className="inline-flex items-center gap-1.5 text-caption font-medium text-text-muted hover:text-text-secondary transition-colors">
          <ArrowLeft size={14} />
          Back to Clients
        </Link>
        <div className="text-label text-status-overdue bg-status-overdue/10 p-4 rounded-xl border border-status-overdue/30">
          {error ? `Failed to load client: ${(error as Error).message}` : 'Client not found.'}
        </div>
      </div>
    )
  }

  const properties = (client.properties ?? []) as Property[]

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Clients', path: '/dashboard/clients' },
        { label: client.name },
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <PageHeader title={client.name} />
          <p className="text-label text-text-muted mt-0.5">
            {client.client_code ? `${client.client_code} · ` : ''}Client details and properties
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={() => navigate(`/dashboard/clients/${id}/edit`)}
          >
            <Pencil className="w-4 h-4" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            isDisabled={deleteClient.isPending}
            onPress={() => setConfirmOpen(true)}
          >
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            title="Delete Client"
            message="Are you sure you want to delete this client? This action cannot be undone."
            confirmLabel="Delete"
            variant="danger"
            onConfirm={handleDelete}
            onCancel={() => setConfirmOpen(false)}
          />
        </div>
      </div>

      {/* Client Details Card */}
      <AppCard padding="md">
        <Heading level={2} scale="body" className="mb-4">Client Details</Heading>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {client.primary_contact_name && (
            <div className="flex items-start gap-2.5">
              <UserCircle size={15} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Primary Contact</dt>
                <dd className="text-label text-text-secondary mt-0.5">
                  {client.primary_contact_name}
                  {client.primary_contact_phone ? ` · ${client.primary_contact_phone}` : ''}
                </dd>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2.5">
            <Mail size={15} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Email</dt>
              <dd className="text-label text-text-secondary mt-0.5">{client.contact_email || '-'}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Phone size={15} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Phone</dt>
              <dd className="text-label text-text-secondary mt-0.5">{client.contact_phone || '-'}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPin size={15} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Address</dt>
              <dd className="text-label text-text-secondary mt-0.5">{client.address || '-'}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <StickyNote size={15} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Notes</dt>
              <dd className="text-label text-text-secondary mt-0.5 whitespace-pre-wrap">{client.notes || '-'}</dd>
            </div>
          </div>
        </dl>
      </AppCard>

      <AppCard padding="md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ReceiptText size={16} className="text-brand-500" />
            <Heading level={2} scale="body">Client Billing</Heading>
          </div>
          {!billingEditing ? (
            <Button variant="outline" size="sm" onPress={startBillingEdit}>
              <Pencil size={13} className="mr-1.5" />
              Edit billing
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onPress={cancelBillingEdit} isDisabled={updateClient.isPending}>
                <X size={13} className="mr-1.5" />
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onPress={saveBillingEdit}
                isDisabled={updateClient.isPending || hasBillingErrors}
              >
                <Save size={13} className="mr-1.5" />
                {updateClient.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </div>

        {/* Read mode — same dl as before, augmented with Client Code which
            also lives in 00043 and was not previously surfaced. */}
        {!billingEditing ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Client Code</dt>
              <dd className="text-label text-text-secondary mt-0.5">{client.client_code || '-'}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Billing Email</dt>
              <dd className="text-label text-text-secondary mt-0.5">{client.billing_email || client.contact_email || '-'}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Payment Terms</dt>
              <dd className="text-label text-text-secondary mt-0.5">{client.billing_terms || '-'}</dd>
            </div>
            <div>
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Tax / VAT Number</dt>
              <dd className="text-label text-text-secondary mt-0.5">{client.tax_number || '-'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Billing Address</dt>
              <dd className="text-label text-text-secondary mt-0.5 whitespace-pre-wrap">{client.billing_address || client.address || '-'}</dd>
            </div>
          </dl>
        ) : (
          /* Edit mode — same 5 fields plus client_code, all editable.
             Uses native inputs/textarea matching the existing form
             style on clients/new.tsx for visual continuity. */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="client-billing-code" className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                Client Code
              </label>
              <input
                id="client-billing-code"
                type="text"
                value={billingDraft.client_code}
                onChange={(e) => setBillingDraft((d) => ({ ...d, client_code: e.target.value }))}
                placeholder="C-1458"
                aria-invalid={!!billingErrors.client_code}
                aria-describedby={billingErrors.client_code ? 'err-client-code' : undefined}
                className={`w-full bg-surface-card border rounded-lg text-label px-3 py-2 focus:outline-none focus:ring-2 ${
                  billingErrors.client_code
                    ? 'border-status-overdue/60 focus:ring-status-overdue/20 focus:border-status-overdue'
                    : 'border-border-default focus:ring-accent/20 focus:border-accent/40'
                }`}
              />
              {billingErrors.client_code && (
                <p
                  id="err-client-code"
                  className="mt-1 text-micro text-status-overdue inline-flex items-center gap-1"
                >
                  <AlertCircle size={11} /> {billingErrors.client_code}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="client-billing-email" className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                Billing Email
              </label>
              <input
                id="client-billing-email"
                type="email"
                value={billingDraft.billing_email}
                onChange={(e) => setBillingDraft((d) => ({ ...d, billing_email: e.target.value }))}
                placeholder="accounts@example.com"
                aria-invalid={!!billingErrors.billing_email}
                aria-describedby={billingErrors.billing_email ? 'err-billing-email' : undefined}
                className={`w-full bg-surface-card border rounded-lg text-label px-3 py-2 focus:outline-none focus:ring-2 ${
                  billingErrors.billing_email
                    ? 'border-status-overdue/60 focus:ring-status-overdue/20 focus:border-status-overdue'
                    : 'border-border-default focus:ring-accent/20 focus:border-accent/40'
                }`}
              />
              {billingErrors.billing_email && (
                <p
                  id="err-billing-email"
                  className="mt-1 text-micro text-status-overdue inline-flex items-center gap-1"
                >
                  <AlertCircle size={11} /> {billingErrors.billing_email}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="client-billing-terms" className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                Payment Terms
              </label>
              <input
                id="client-billing-terms"
                type="text"
                value={billingDraft.billing_terms}
                onChange={(e) => setBillingDraft((d) => ({ ...d, billing_terms: e.target.value }))}
                placeholder="Net 30"
                className="w-full bg-surface-card border border-border-default rounded-lg text-label px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40"
              />
            </div>
            <div>
              <label htmlFor="client-billing-tax" className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                Tax / VAT Number
              </label>
              <input
                id="client-billing-tax"
                type="text"
                value={billingDraft.tax_number}
                onChange={(e) => setBillingDraft((d) => ({ ...d, tax_number: e.target.value }))}
                placeholder="GB123456789"
                aria-invalid={!!billingErrors.tax_number}
                aria-describedby={billingErrors.tax_number ? 'err-tax-number' : undefined}
                className={`w-full bg-surface-card border rounded-lg text-label px-3 py-2 focus:outline-none focus:ring-2 ${
                  billingErrors.tax_number
                    ? 'border-status-overdue/60 focus:ring-status-overdue/20 focus:border-status-overdue'
                    : 'border-border-default focus:ring-accent/20 focus:border-accent/40'
                }`}
              />
              {billingErrors.tax_number && (
                <p
                  id="err-tax-number"
                  className="mt-1 text-micro text-status-overdue inline-flex items-center gap-1"
                >
                  <AlertCircle size={11} /> {billingErrors.tax_number}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="client-billing-address" className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                Billing Address
              </label>
              <textarea
                id="client-billing-address"
                value={billingDraft.billing_address}
                onChange={(e) => setBillingDraft((d) => ({ ...d, billing_address: e.target.value }))}
                rows={3}
                placeholder="Address used on invoices"
                className="w-full bg-surface-card border border-border-default rounded-lg text-label px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 resize-y"
              />
            </div>
          </div>
        )}
      </AppCard>

      {/* Properties Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Heading level={2} scale="body">Properties</Heading>
          <Button asChild variant="primary" size="sm">
            <Link to={`/dashboard/properties/new?client_id=${client.id}`}>
              <Plus className="w-4 h-4" /> Add Property
            </Link>
          </Button>
        </div>

        {properties.length === 0 ? (
          <AppCard padding="none" className="flex flex-col items-center justify-center py-12 px-0">
            <Building2 size={28} strokeWidth={1.5} className="text-text-muted mb-3" />
            <p className="text-label text-text-muted">No properties linked to this client yet.</p>
          </AppCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {properties.map((property) => (
              <Link key={property.id} to={`/dashboard/properties/${property.id}`}>
                <AppCard padding="md" className="hover:border-border-strong transition-colors cursor-pointer h-full">
                  <div className="flex items-start gap-3">
                    <Building2 size={18} className="text-text-muted mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-label font-medium text-text-primary truncate">{property.name}</h3>
                      {property.property_code && (
                        <p className="text-micro text-brand-500 font-medium mt-0.5">{property.property_code}</p>
                      )}
                      <Text scale="caption" tone="muted" className="truncate mt-0.5">{property.address}</Text>
                      {(property as PropertyWithRelations).site_manager && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <UserCircle size={12} className="text-text-muted" />
                          <Text scale="micro" as="span" tone="muted">{(property as PropertyWithRelations).site_manager}</Text>
                        </div>
                      )}
                      {property.site_type && (
                        <span className="inline-block mt-2">
                          <Chip variant="soft" color="default" size="sm">
                            {property.site_type}
                          </Chip>
                        </span>
                      )}
                    </div>
                  </div>
                </AppCard>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Client Timeline */}
      <AppCard padding="md">
        <Heading level={2} scale="body" className="mb-4">Timeline</Heading>
        <Timeline clientId={id} limit={15} />
      </AppCard>
    </div>
  )
}

import { useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import {
  Trash2,
  Pencil,
  Mail,
  Phone,
  StickyNote,
  UserCircle,
  Wrench,
  Building2,
  FileText,
  Briefcase,
  Download,
  Plus,
  ShieldAlert,
  Clock,
  CalendarDays,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { Chip } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader } from '@haumea/ui'

import {
  useSubcontractor,
  useDeleteSubcontractor,
  useSubcontractorDocuments,
  useUploadSubcontractorDocument,
  useDeleteSubcontractorDocument,
} from '@/hooks/use-subcontractors'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { SubcontractorComplianceTab } from '@/components/subcontractors/compliance-tab'
import { openSubcontractorFile } from '@/lib/subcontractor-files'
import { SUBCONTRACTOR_DOC_TYPES } from '@/lib/constants'
import { toast } from 'sonner'

type Tab = 'overview' | 'compliance' | 'documents' | 'jobs'

const statusConfig: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'default' }> = {
  approved: { label: 'Approved', color: 'success' },
  pending: { label: 'Pending', color: 'warning' },
  suspended: { label: 'Suspended', color: 'danger' },
}

const docUploadSchema = z.object({
  name: z.string().min(1, 'Document name is required'),
  document_type: z.string().min(1, 'Type is required'),
  expiry_date: z.string().optional(),
})

type DocUploadForm = z.infer<typeof docUploadSchema>

export default function SubcontractorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { organisation } = useAuth()
  const { data: subcontractor, isLoading, error } = useSubcontractor(id!)
  const deleteSubcontractor = useDeleteSubcontractor()
  const { data: documents } = useSubcontractorDocuments(id!)
  const uploadDocument = useUploadSubcontractorDocument()
  const deleteDocument = useDeleteSubcontractorDocument()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showDocForm, setShowDocForm] = useState(false)
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Jobs query
  const { data: jobs } = useQuery({
    queryKey: ['subcontractor-jobs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(name)')
        .eq('subcontractor_id', id!)
        .order('scheduled_date', { ascending: false })
      if (error) throw error
      return data as any[]
    },
    enabled: !!id,
  })

  const {
    register: registerDoc,
    handleSubmit: handleDocSubmit,
    reset: resetDoc,
    control: controlDoc,
    formState: { errors: docErrors, isSubmitting: docSubmitting },
  } = useForm<DocUploadForm>({
    resolver: zodResolver(docUploadSchema),
    defaultValues: { name: '', document_type: '', expiry_date: '' },
  })

  const handleDelete = async () => {
    await deleteSubcontractor.mutateAsync(id!)
    navigate('/dashboard/subcontractors')
  }

  const onDocSubmit = async (data: DocUploadForm) => {
    const file = fileInputRef.current?.files?.[0]
    let file_url = ''
    const orgId = organisation?.id
    if (!orgId) throw new Error('missing organisation')

    if (file) {
      // First path segment MUST be the org id — the documents bucket RLS (00059)
      // requires foldername[1] = caller's organisation_id, else upload is rejected.
      const path = `${orgId}/subcontractor-docs/${id}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, file)
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      file_url = urlData.publicUrl
    }

    await uploadDocument.mutateAsync({
      subcontractor_id: id!,
      organisation_id: orgId,
      name: data.name,
      document_type: data.document_type,
      expiry_date: data.expiry_date || undefined,
      file_url,
      file_size: file?.size,
      mime_type: file?.type,
    })
    resetDoc()
    if (fileInputRef.current) fileInputRef.current.value = ''
    setShowDocForm(false)
  }

  const handleDeleteDoc = async (docId: string) => {
    await deleteDocument.mutateAsync({ id: docId, subcontractorId: id! })
    setDeleteDocId(null)
  }

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (error || !subcontractor) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard/subcontractors" className="inline-flex items-center gap-1.5 text-caption font-medium text-text-muted hover:text-text-secondary transition-colors">
          Back to Subcontractors
        </Link>
        <div className="text-label text-status-overdue bg-status-overdue/10 p-4 rounded-xl border border-status-overdue/30">
          {error ? `Failed to load subcontractor: ${(error as Error).message}` : 'Subcontractor not found.'}
        </div>
      </div>
    )
  }

  const status = statusConfig[subcontractor.status] ?? statusConfig.pending

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'compliance', label: 'Compliance', icon: ShieldAlert },
    { id: 'documents', label: 'Documents & Risk Assessments', icon: FileText },
    { id: 'jobs', label: 'Job History', icon: Briefcase },
  ]

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Subcontractors', path: '/dashboard/subcontractors' },
        { label: subcontractor.company_name },
      ]} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <PageHeader title={subcontractor.company_name} subtitle="Subcontractor details and documents" />
          </div>
          <Chip variant="soft" color={status.color} size="sm">{status.label}</Chip>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/dashboard/subcontractors/${id}/edit`}
            className="inline-flex items-center border border-border-default text-text-secondary hover:bg-surface-page rounded-lg px-3 py-1.5 text-caption font-medium transition-colors"
          >
            <Pencil className="w-4 h-4 mr-1" /> Edit
          </Link>
          <button
            className="inline-flex items-center border border-border-default text-text-secondary hover:bg-surface-page rounded-lg px-3 py-1.5 text-caption font-medium transition-colors disabled:opacity-50"
            disabled={deleteSubcontractor.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </button>
          <ConfirmDialog
            open={confirmOpen}
            title="Delete Subcontractor"
            message="Are you sure you want to delete this subcontractor? This action cannot be undone."
            confirmLabel="Delete"
            variant="danger"
            onConfirm={handleDelete}
            onCancel={() => setConfirmOpen(false)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border-default overflow-x-auto">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-label font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-navy-950 text-navy-950'
                    : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border-default'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <AppCard padding="md">
          <h2 className="text-body font-semibold text-text-primary mb-4">Subcontractor Details</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex items-start gap-2.5">
              <Building2 size={15} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Company Name</dt>
                <dd className="text-label text-text-secondary mt-0.5">{subcontractor.company_name}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <UserCircle size={15} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Contact Person</dt>
                <dd className="text-label text-text-secondary mt-0.5">{subcontractor.contact_person || '-'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Mail size={15} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Email</dt>
                <dd className="text-label text-text-secondary mt-0.5">{subcontractor.email || '-'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Phone size={15} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Phone</dt>
                <dd className="text-label text-text-secondary mt-0.5">{subcontractor.phone || '-'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Wrench size={15} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Trade</dt>
                <dd className="text-label text-text-secondary mt-0.5">{subcontractor.trade || '-'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <StickyNote size={15} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <dt className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Notes</dt>
                <dd className="text-label text-text-secondary mt-0.5 whitespace-pre-wrap">{subcontractor.notes || '-'}</dd>
              </div>
            </div>
          </dl>
        </AppCard>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-body font-semibold text-text-primary">Documents & Risk Assessments</h2>
            <button
              onClick={() => setShowDocForm(!showDocForm)}
              className="inline-flex items-center bg-foreground text-background hover:bg-foreground/90 rounded-lg px-3 py-1.5 text-caption font-medium transition-colors"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Document
            </button>
          </div>

          {/* Inline upload form */}
          {showDocForm && (
            <AppCard padding="md">
            <form onSubmit={handleDocSubmit(onDocSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-caption font-medium text-text-secondary mb-1">
                    Name <span className="text-status-overdue">*</span>
                  </label>
                  <input
                    {...registerDoc('name')}
                    type="text"
                    className="w-full px-3 py-2 border border-border-default rounded-lg text-label text-text-secondary bg-surface-card focus:outline-none focus:ring-2 focus:ring-border-default"
                    placeholder="Document name"
                  />
                  {docErrors.name && <p className="mt-1 text-micro text-status-overdue">{docErrors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-caption font-medium text-text-secondary mb-1">
                    Type <span className="text-status-overdue">*</span>
                  </label>
                  <FormSelectController
                    control={controlDoc}
                    name="document_type"
                    ariaLabel="Type"
                    placeholder="Select type..."
                    options={Object.entries(SUBCONTRACTOR_DOC_TYPES).map(([key, label]) => ({ value: key, label }))}
                  />
                  {docErrors.document_type && <p className="mt-1 text-micro text-status-overdue">{docErrors.document_type.message}</p>}
                </div>
                <div>
                  <label className="block text-caption font-medium text-text-secondary mb-1">Expiry Date</label>
                  <input
                    {...registerDoc('expiry_date')}
                    type="date"
                    className="w-full px-3 py-2 border border-border-default rounded-lg text-label text-text-secondary bg-surface-card focus:outline-none focus:ring-2 focus:ring-border-default"
                  />
                </div>
              </div>
              <div>
                <label className="block text-caption font-medium text-text-secondary mb-1">File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="block w-full text-label text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border-default file:text-caption file:font-medium file:bg-surface-page file:text-text-secondary hover:file:bg-surface-page"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={docSubmitting}
                  className="bg-foreground text-background hover:bg-foreground/90 rounded-lg px-4 py-2 text-label font-medium transition-colors disabled:opacity-50"
                >
                  {docSubmitting ? 'Uploading...' : 'Upload'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDocForm(false); resetDoc() }}
                  className="border border-border-default text-text-secondary hover:bg-surface-page rounded-lg px-4 py-2 text-label font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
            </AppCard>
          )}

          {/* Documents table */}
          {(!documents || documents.length === 0) && !showDocForm ? (
            <div className="bg-surface-card border border-border-default rounded-xl flex flex-col items-center justify-center py-12">
              <FileText size={28} strokeWidth={1.5} className="text-text-muted mb-3" />
              <p className="text-label text-text-muted">No documents uploaded yet.</p>
            </div>
          ) : documents && documents.length > 0 && (
            <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table aria-label="Subcontractor documents" className="w-full">
                    <thead><tr>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Name</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Type</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Expiry Date</th>
                      <th className="text-right py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
                    </tr></thead>
                    <tbody>
                      {documents.map((doc) => {
                        const isRiskAssessment = doc.document_type === 'risk_assessment'
                        return (
                          <tr key={doc.id} id={doc.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                {isRiskAssessment && <ShieldAlert size={14} className="text-status-due-soon shrink-0" />}
                                <span className="text-label font-medium text-text-primary">{doc.name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <Chip
                                variant="soft"
                                color={isRiskAssessment ? 'warning' : 'default'}
                                size="sm"
                              >
                                {SUBCONTRACTOR_DOC_TYPES[doc.document_type] ?? doc.document_type}
                              </Chip>
                            </td>
                            <td className="py-3 px-4 text-label text-text-secondary">
                              {doc.expiry_date ? (
                                <span className="flex items-center gap-1">
                                  <CalendarDays size={12} className="text-text-muted" />
                                  {new Date(doc.expiry_date).toLocaleDateString()}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {doc.file_url && (
                                  <button
                                    onClick={async () => {
                                      const ok = await openSubcontractorFile(doc.file_url)
                                      if (!ok) toast.error('Could not open this file')
                                    }}
                                    className="p-2 rounded-lg hover:bg-surface-page text-text-muted hover:text-text-secondary transition-colors inline-flex"
                                    aria-label={`Download ${doc.name}`}
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => setDeleteDocId(doc.id)}
                                  className="p-2 rounded-lg hover:bg-status-overdue/10 text-text-muted hover:text-status-overdue transition-colors inline-flex"
                                  aria-label={`Delete ${doc.name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Delete doc confirmation */}
          <ConfirmDialog
            open={!!deleteDocId}
            title="Delete Document"
            message="Are you sure you want to delete this document? This action cannot be undone."
            confirmLabel="Delete"
            variant="danger"
            onConfirm={() => deleteDocId && handleDeleteDoc(deleteDocId)}
            onCancel={() => setDeleteDocId(null)}
          />
        </div>
      )}

      {activeTab === 'compliance' && organisation?.id && (
        <SubcontractorComplianceTab subcontractorId={id!} organisationId={organisation.id} />
      )}

      {activeTab === 'jobs' && (
        <div className="space-y-4">
          <h2 className="text-body font-semibold text-text-primary">Job History</h2>

          {(!jobs || jobs.length === 0) ? (
            <div className="bg-surface-card border border-border-default rounded-xl flex flex-col items-center justify-center py-12">
              <Briefcase size={28} strokeWidth={1.5} className="text-text-muted mb-3" />
              <p className="text-label text-text-muted">No jobs assigned to this subcontractor yet.</p>
            </div>
          ) : (
            <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table aria-label="Subcontractor job history" className="w-full">
                    <thead><tr>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Title</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Date</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Status</th>
                      <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Outcome</th>
                    </tr></thead>
                    <tbody>
                      {jobs.map((job: any) => (
                        <tr key={job.id} id={job.id} className="border-b border-border-subtle hover:bg-surface-page transition-colors last:border-0">
                          <td className="py-3 px-4 text-label font-medium text-text-primary">
                            <Link to={`/dashboard/jobs/${job.id}`} className="hover:text-navy-950 transition-colors">
                              {job.title}
                            </Link>
                          </td>
                          <td className="py-3 px-4 text-label text-text-secondary">{job.properties?.name ?? '-'}</td>
                          <td className="py-3 px-4 text-label text-text-secondary">
                            {job.scheduled_date ? (
                              <span className="flex items-center gap-1">
                                <Clock size={12} className="text-text-muted" />
                                {new Date(job.scheduled_date).toLocaleDateString()}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <Chip variant="soft" color="default" size="sm" className="capitalize">
                              {job.status?.replace(/_/g, ' ') ?? '-'}
                            </Chip>
                          </td>
                          <td className="py-3 px-4 text-label text-text-secondary capitalize">
                            {job.outcome?.replace(/_/g, ' ') ?? '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

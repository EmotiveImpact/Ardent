import { useCallback, useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Chip } from '@haumea/ui'
import {
  Award,
  Briefcase,
  Car,
  ClipboardList,
  FileText,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import {
  useCreateAccreditation,
  useDeleteAccreditation,
  useDeleteEngineer,
  useDeleteEngineerDocument,
  useEngineer,
  useUpdateEngineer,
  useUploadEngineerDocument,
} from '@/hooks/use-engineers'
import { useTravelRecords, useCreateTravelRecord, useDeleteTravelRecord } from '@/hooks/use-travel'
import { useAuth } from '@/hooks/use-auth'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { DetailPageSkeleton, TableSkeleton } from '@/components/shared/skeletons'
import { AppCard, Heading, PageHeader, Text } from '@haumea/ui'
import {
  EngineerEditForm,
  EngineerInfoCard,
  EngineerRenewalIcon,
  EngineerSignatureSection,
  EngineerStatCard,
  engineerEditSchema,
  type EngineerEditFormData,
} from '@/components/engineers/engineer-info-card'
import {
  EngineerAccreditationForm,
  EngineerAccreditationsTable,
  engineerAccreditationSchema,
  getAccreditationStatus,
  type EngineerAccreditationFormData,
} from '@/components/engineers/engineer-accreditations-table'
import {
  EngineerDocumentForm,
  EngineerDocumentsTable,
  engineerDocumentSchema,
  type EngineerDocumentFormData,
} from '@/components/engineers/engineer-documents-table'
import { EngineerJobsTable, type EngineerJobHistory } from '@/components/engineers/engineer-jobs-table'
import { EngineerLocationPanel } from '@/components/engineers/engineer-location-panel'
import {
  EngineerTravelRecordsTable,
  EngineerTravelTimeForm,
  engineerTravelSchema,
  type EngineerTravelFormData,
} from '@/components/engineers/engineer-travel-time-form'

type Tab = 'overview' | 'accreditations' | 'documents' | 'jobs' | 'travel'

const tabs: { id: Tab; label: string; icon: typeof ShieldCheck }[] = [
  { id: 'overview', label: 'Overview', icon: ClipboardList },
  { id: 'accreditations', label: 'Accreditations', icon: Award },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'jobs', label: 'Job History', icon: Briefcase },
  { id: 'travel', label: 'Travel', icon: Car },
]

export default function EngineerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { organisation } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showAccForm, setShowAccForm] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [showTravelForm, setShowTravelForm] = useState(false)
  const [jobs, setJobs] = useState<EngineerJobHistory[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)

  const { data: engineer, isLoading, error } = useEngineer(id!)
  const updateEngineer = useUpdateEngineer()
  const deleteEngineer = useDeleteEngineer()
  const createAccreditation = useCreateAccreditation()
  const deleteAccreditation = useDeleteAccreditation()
  const uploadDocument = useUploadEngineerDocument()
  const deleteDocument = useDeleteEngineerDocument()
  const { data: travelRecords, isLoading: travelLoading } = useTravelRecords(id)
  const createTravel = useCreateTravelRecord()
  const deleteTravel = useDeleteTravelRecord()

  const loadJobs = useCallback(async () => {
    if (!id) return
    setJobsLoading(true)
    try {
      const { data, error: jobErr } = await supabase
        .from('jobs')
        .select('id, title, scheduled_date, status, outcome, properties(name)')
        .eq('engineer_record_id', id)
        .order('scheduled_date', { ascending: false })
      if (jobErr) throw jobErr
      setJobs((data ?? []) as EngineerJobHistory[])
    } catch {
      setJobs([])
    } finally {
      setJobsLoading(false)
    }
  }, [id])

  const editForm = useForm<EngineerEditFormData>({
    resolver: zodResolver(engineerEditSchema),
    values: engineer
      ? {
          name: engineer.name,
          email: engineer.email || '',
          phone: engineer.phone || '',
          trade: engineer.trade || '',
          status: engineer.status,
          notes: engineer.notes || '',
        }
      : undefined,
  })

  const accForm = useForm<EngineerAccreditationFormData>({
    resolver: zodResolver(engineerAccreditationSchema),
    defaultValues: { accreditation_type: '', registration_number: '', qqi_level: '', issuing_body: '', issue_date: '', expiry_date: '' },
  })

  const docForm = useForm<EngineerDocumentFormData>({
    resolver: zodResolver(engineerDocumentSchema),
    defaultValues: { name: '', document_type: '', expiry_date: '' },
  })

  const travelForm = useForm<EngineerTravelFormData>({
    resolver: zodResolver(engineerTravelSchema),
    defaultValues: { from_postcode: '', to_postcode: '', distance_miles: 0, travel_date: '', job_id: '', notes: '' },
  })

  if (isLoading) return <DetailPageSkeleton />

  if (error || !engineer || !id) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Engineer not found"
          breadcrumbs={<Breadcrumbs items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Engineers', path: '/dashboard/engineers' }]} />}
        />
        <AppCard>
          <Text scale="caption" className="text-status-overdue">
            {error ? (error as Error).message : 'Engineer not found.'}
          </Text>
        </AppCard>
      </div>
    )
  }

  const accreditations = engineer.engineer_accreditations ?? []
  const documents = engineer.engineer_documents ?? []
  const expiredAccreditations = accreditations.filter((acc) => getAccreditationStatus(acc.expiry_date).label === 'Expired')
  const expiringAccreditations = accreditations.filter((acc) => getAccreditationStatus(acc.expiry_date).label === 'Expiring')
  const needsRenewal = expiredAccreditations.length + expiringAccreditations.length > 0

  const handleDelete = async () => {
    await deleteEngineer.mutateAsync(id)
    navigate('/dashboard/engineers')
  }

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    if ((tab === 'jobs' || tab === 'travel') && jobs.length === 0) void loadJobs()
  }

  const handleEditSubmit = async (data: EngineerEditFormData) => {
    await updateEngineer.mutateAsync({ id, ...data })
    setEditing(false)
  }

  const handleAccreditationSubmit = async (data: EngineerAccreditationFormData) => {
    await createAccreditation.mutateAsync({
      engineer_id: id,
      organisation_id: organisation?.id,
      ...data,
      status: 'active',
    })
    accForm.reset()
    setShowAccForm(false)
  }

  const handleDocumentSubmit = async (data: EngineerDocumentFormData) => {
    if (!docFile || !organisation) return
    const orgId = organisation.id
    if (!orgId) throw new Error('missing organisation')

    // First path segment MUST be the org id — the documents bucket RLS (00059)
    // requires foldername[1] = caller's organisation_id, else upload is rejected.
    const filePath = `${orgId}/engineer-documents/${id}/${Date.now()}-${docFile.name}`
    const { error: uploadErr } = await supabase.storage.from('documents').upload(filePath, docFile)
    if (uploadErr) throw uploadErr

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
    await uploadDocument.mutateAsync({
      engineer_id: id,
      organisation_id: organisation.id,
      name: data.name,
      document_type: data.document_type,
      file_url: urlData.publicUrl,
      file_size: docFile.size,
      mime_type: docFile.type,
      expiry_date: data.expiry_date || undefined,
    })
    docForm.reset()
    setDocFile(null)
    setShowDocForm(false)
  }

  const handleTravelSubmit = async (data: EngineerTravelFormData) => {
    await createTravel.mutateAsync({
      engineer_id: id,
      organisation_id: organisation?.id,
      from_postcode: data.from_postcode,
      to_postcode: data.to_postcode,
      distance_miles: data.distance_miles,
      travel_date: data.travel_date,
      job_id: data.job_id || undefined,
    })
    travelForm.reset()
    setShowTravelForm(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={engineer.name}
        subtitle={engineer.trade || undefined}
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: 'Dashboard', path: '/dashboard' },
              { label: 'Engineers', path: '/dashboard/engineers' },
              { label: engineer.name },
            ]}
          />
        }
        actions={
          <>
            <Chip variant={engineer.status === 'active' ? 'primary' : 'soft'} color={engineer.status === 'active' ? 'success' : 'default'} size="sm">
              {engineer.status}
            </Chip>
            <Button variant="outline" size="sm" onPress={() => setEditing(!editing)}>
              <Pencil className="h-4 w-4" />
              {editing ? 'Cancel' : 'Edit'}
            </Button>
            <Button variant="danger" size="sm" isDisabled={deleteEngineer.isPending} onPress={() => setConfirmOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </>
        }
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Engineer"
        message={`Delete engineer "${engineer.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <div className="overflow-x-auto border-b border-border-default">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-label font-medium transition-colors ${
                  isActive
                    ? 'border-navy-950 text-navy-950'
                    : 'border-transparent text-text-muted hover:border-border-default hover:text-text-secondary'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            {editing ? (
              <EngineerEditForm form={editForm} onSubmit={handleEditSubmit} isPending={updateEngineer.isPending} onCancel={() => setEditing(false)} />
            ) : (
              <EngineerInfoCard engineer={engineer} />
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <EngineerStatCard label="Accreditations" value={accreditations.length} icon={<Award size={18} className="text-brand-500" />} />
              <EngineerStatCard label="Need Renewal" value={expiredAccreditations.length + expiringAccreditations.length} icon={<EngineerRenewalIcon needsRenewal={needsRenewal} />} />
              <EngineerStatCard label="Documents" value={documents.length} icon={<FileText size={18} className="text-brand-500" />} />
            </div>
            <EngineerSignatureSection engineerId={id} currentUrl={engineer.signature_image_url} />
          </div>
          <EngineerLocationPanel engineerId={id} />
        </div>
      ) : null}

      {activeTab === 'accreditations' ? (
        <div className="space-y-4">
          <SectionTitle
            title="Accreditations"
            action={
              <Button variant="primary" size="sm" onPress={() => setShowAccForm(!showAccForm)}>
                {showAccForm ? <X size={14} /> : <Plus size={14} />}
                {showAccForm ? 'Cancel' : 'Add Accreditation'}
              </Button>
            }
          />
          {showAccForm ? <EngineerAccreditationForm form={accForm} onSubmit={handleAccreditationSubmit} isPending={createAccreditation.isPending} /> : null}
          {needsRenewal ? (
            <div className="rounded-xl border border-status-due/30 bg-status-due/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck size={18} className="mt-0.5 text-status-due" />
                <div>
                  <p className="text-label font-semibold text-text-primary">Accreditation renewal needed</p>
                  <p className="mt-1 text-caption text-text-secondary">
                    {expiredAccreditations.length} expired and {expiringAccreditations.length} expiring within 30 days. Renew before assigning regulated work.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {accreditations.length === 0 ? (
            <EmptyState icon={Award} title="No accreditations recorded yet." />
          ) : (
            <EngineerAccreditationsTable
              accreditations={accreditations}
              onDelete={(accId) => deleteAccreditation.mutate({ id: accId, engineerId: id })}
              isDeleting={deleteAccreditation.isPending}
            />
          )}
        </div>
      ) : null}

      {activeTab === 'documents' ? (
        <div className="space-y-4">
          <SectionTitle
            title="Documents"
            action={
              <Button variant="primary" size="sm" onPress={() => setShowDocForm(!showDocForm)}>
                {showDocForm ? <X size={14} /> : <Plus size={14} />}
                {showDocForm ? 'Cancel' : 'Upload Document'}
              </Button>
            }
          />
          {showDocForm ? <EngineerDocumentForm form={docForm} onSubmit={handleDocumentSubmit} isPending={uploadDocument.isPending} file={docFile} onFileChange={setDocFile} /> : null}
          {documents.length === 0 ? (
            <EmptyState icon={FileText} title="No documents uploaded yet." />
          ) : (
            <EngineerDocumentsTable
              documents={documents}
              onDelete={(docId) => deleteDocument.mutate({ id: docId, engineerId: id })}
              isDeleting={deleteDocument.isPending}
            />
          )}
        </div>
      ) : null}

      {activeTab === 'jobs' ? (
        <div className="space-y-4">
          <SectionTitle title="Job History" />
          {jobsLoading ? (
            <TableSkeleton rows={5} cols={5} showHeader={false} showSearch={false} />
          ) : jobs.length === 0 ? (
            <EmptyState icon={Briefcase} title="No job history yet." />
          ) : (
            <EngineerJobsTable jobs={jobs} />
          )}
        </div>
      ) : null}

      {activeTab === 'travel' ? (
        <div className="space-y-4">
          <SectionTitle
            title="Travel Records"
            action={
              <Button variant="primary" size="sm" onPress={() => setShowTravelForm(!showTravelForm)}>
                {showTravelForm ? <X size={14} /> : <Plus size={14} />}
                {showTravelForm ? 'Cancel' : 'Add Travel Record'}
              </Button>
            }
          />
          {showTravelForm ? (
            <EngineerTravelTimeForm form={travelForm} onSubmit={handleTravelSubmit} isPending={createTravel.isPending} jobs={jobs} onLoadJobs={loadJobs} />
          ) : null}
          {travelLoading ? (
            <TableSkeleton rows={4} cols={5} showHeader={false} showSearch={false} />
          ) : !travelRecords || travelRecords.length === 0 ? (
            <EmptyState icon={Car} title="No travel records yet." />
          ) : (
            <EngineerTravelRecordsTable
              records={travelRecords}
              onDelete={(recordId) => deleteTravel.mutate({ id: recordId, engineerId: id })}
              isDeleting={deleteTravel.isPending}
            />
          )}
        </div>
      ) : null}
    </div>
  )
}

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Heading level={2} scale="body">
        {title}
      </Heading>
      {action}
    </div>
  )
}

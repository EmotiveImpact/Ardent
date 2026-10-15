import { useState } from 'react'
import { Button, Chip } from '@haumea/ui'
import { AppCard, FormSelect } from '@haumea/ui'
import { ListPageSkeleton } from '@/components/shared/skeleton'
import { Upload, FileText } from 'lucide-react'
import { useDocuments, useUploadDocument, useDeleteDocument } from '@/hooks/use-documents'
import { useProperties } from '@/hooks/use-properties'
import { useAssets } from '@/hooks/use-assets'
import { useAuth } from '@/hooks/use-auth'
import { formatDate } from '@haumea/utils'
import { FileUpload } from '@/components/shared/file-upload'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeader } from '@/components/shared/section-header'
import type { DocumentWithRelations } from '@haumea/types'

const DOCUMENT_TYPES = ['Certificate', 'Report', 'Invoice', 'Quote', 'Risk Assessment', 'Other']

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsPage() {
  const { user, organisation } = useAuth()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('')
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [confirmState, setConfirmState] = useState<{ open: boolean; id: string }>({ open: false, id: '' })

  const { data: documents, isLoading } = useDocuments({
    search: search || undefined,
    document_type: typeFilter || undefined,
    property_id: propertyFilter || undefined,
  })
  const { data: properties } = useProperties()
  const uploadMutation = useUploadDocument()
  const deleteMutation = useDeleteDocument()

  // Upload form state
  const [docName, setDocName] = useState('')
  const [docType, setDocType] = useState('')
  const [docProperty, setDocProperty] = useState('')
  const [docAsset, setDocAsset] = useState('')
  const [docExpiry, setDocExpiry] = useState('')
  const [docTags, setDocTags] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Fetch assets filtered by selected property
  const { data: assets } = useAssets(docProperty || undefined)

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile || !docName || !organisation?.id) return

    await uploadMutation.mutateAsync({
      name: docName,
      file: selectedFile,
      organisation_id: organisation.id,
      property_id: docProperty || undefined,
      asset_id: docAsset || undefined,
      document_type: docType || undefined,
      expiry_date: docExpiry || undefined,
      tags: docTags ? docTags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      uploaded_by: user?.id,
    })

    // Reset form
    setDocName('')
    setDocType('')
    setDocProperty('')
    setDocAsset('')
    setDocExpiry('')
    setDocTags('')
    setSelectedFile(null)
    setShowUploadForm(false)
  }

  const handleDelete = (id: string) => {
    setConfirmState({ open: true, id })
  }

  const handleConfirmDelete = async () => {
    await deleteMutation.mutateAsync(confirmState.id)
    setConfirmState({ open: false, id: '' })
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        variant="page"
        title="Documents"
        subtitle="Certificates, reports, and supporting files"
        action={
          <Button variant="primary" size="sm" onPress={() => setShowUploadForm(!showUploadForm)}>
            <Upload size={14} className="mr-1.5" />
            {showUploadForm ? 'Cancel' : 'Upload Document'}
          </Button>
        }
      />

      {/* Upload Form */}
      {showUploadForm && (
        <AppCard padding="md">
          <h2 className="text-body font-semibold text-text-primary mb-4">Upload Document</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="doc-name" className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Name *</label>
                <input
                  id="doc-name"
                  type="text"
                  className="w-full border border-border-default rounded-lg text-label px-3 py-2 bg-surface-card focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  required
                  placeholder="Document name"
                />
              </div>
              <div>
                <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Type</label>
                <FormSelect
                  value={docType}
                  onChange={setDocType}
                  ariaLabel="Type"
                  placeholder="Select type"
                  clearable
                  options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
                />
              </div>
              <div>
                <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Property</label>
                <FormSelect
                  value={docProperty}
                  onChange={(v) => {
                    setDocProperty(v)
                    setDocAsset('') // Reset asset when property changes
                  }}
                  ariaLabel="Property"
                  placeholder="No property"
                  clearable
                  options={(properties ?? []).map((p) => ({ value: p.id, label: p.name }))}
                />
              </div>
              <div>
                <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Asset</label>
                <FormSelect
                  value={docAsset}
                  onChange={setDocAsset}
                  ariaLabel="Asset"
                  placeholder="No asset"
                  clearable
                  disabled={!docProperty}
                  options={(assets ?? []).map((a) => ({ value: a.id, label: a.name }))}
                />
              </div>
              <div>
                <label htmlFor="doc-expiry" className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Expiry Date</label>
                <input
                  id="doc-expiry"
                  type="date"
                  className="w-full border border-border-default rounded-lg text-label px-3 py-2 bg-surface-card focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  value={docExpiry}
                  onChange={(e) => setDocExpiry(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="doc-tags" className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1">Tags (comma-separated)</label>
                <input
                  id="doc-tags"
                  type="text"
                  className="w-full border border-border-default rounded-lg text-label px-3 py-2 bg-surface-card focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  value={docTags}
                  onChange={(e) => setDocTags(e.target.value)}
                  placeholder="e.g. fire safety, annual"
                />
              </div>
            </div>

            <FileUpload
              label="File *"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.csv"
              onChange={setSelectedFile}
              value={selectedFile}
              description="Drop files here or click to browse"
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                isDisabled={uploadMutation.isPending || !selectedFile}
              >
                {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
              </Button>
            </div>
          </form>
        </AppCard>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          className="border border-border-default rounded-lg text-label px-3 py-2 flex-1 bg-surface-card focus:ring-2 focus:ring-accent/20 focus:outline-none"
          placeholder="Search documents..."
          aria-label="Search documents"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="w-48">
          <FormSelect
            value={typeFilter}
            onChange={setTypeFilter}
            ariaLabel="Filter by document type"
            placeholder="All Types"
            clearable
            options={DOCUMENT_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </div>
        <div className="w-56">
          <FormSelect
            value={propertyFilter}
            onChange={setPropertyFilter}
            ariaLabel="Filter by property"
            placeholder="All Properties"
            clearable
            options={(properties ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>
      </div>

      {/* Documents List */}
      {isLoading ? (
        <ListPageSkeleton cols={5} />
      ) : !documents?.length ? (
        <div className="bg-surface-card border border-border-default rounded-xl">
          {search || typeFilter || propertyFilter ? (
            // A filter is active and matched nothing — don't claim there are no
            // documents at all, and don't offer Upload (the wrong action here).
            <EmptyState
              icon={FileText}
              title="No matching documents"
              description="No documents match your current search or filters. Try adjusting them."
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              description="Upload certificates, reports, and other files to keep everything organized."
              action={
                <Button variant="primary" size="sm" onPress={() => setShowUploadForm(true)}>
                  <Upload size={14} className="mr-1.5" />
                  Upload Document
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <table aria-label="Documents" className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
            <thead><tr>
              <th className="px-3 py-2.5 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Name</th>
              <th className="px-3 py-2.5 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Type</th>
              <th className="px-3 py-2.5 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Property</th>
              <th className="px-3 py-2.5 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Size</th>
              <th className="px-3 py-2.5 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Version</th>
              <th className="px-3 py-2.5 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Uploaded</th>
              <th className="px-3 py-2.5 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Expiry</th>
              <th className="px-3 py-2.5 text-micro font-medium text-text-muted uppercase tracking-[0.04em]">Actions</th>
            </tr></thead>
            <tbody>
              {documents.map((doc: DocumentWithRelations) => (
                <tr key={doc.id} id={doc.id} className="border-b border-border-subtle hover:bg-surface-page">
                  <td className="px-3 py-3 text-label font-medium text-text-primary">{doc.name}</td>
                  <td className="px-3 py-3">
                    {doc.document_type && (
                      <Chip variant="soft" color="accent" size="sm">
                        {doc.document_type}
                      </Chip>
                    )}
                  </td>
                  <td className="px-3 py-3 text-label text-text-secondary">
                    {doc.properties?.name || '-'}
                  </td>
                  <td className="px-3 py-3 text-label text-text-secondary">
                    {doc.file_size ? formatFileSize(doc.file_size) : '-'}
                  </td>
                  <td className="px-3 py-3">
                    {doc.version && doc.version > 1 ? (
                      <Chip variant="soft" color="default" size="sm">
                        v{doc.version}
                      </Chip>
                    ) : (
                      <span className="text-micro text-text-muted">v1</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-label text-text-secondary">
                    {doc.uploaded_at ? formatDate(doc.uploaded_at) : '-'}
                  </td>
                  <td className="px-3 py-3 text-label text-text-secondary">
                    {doc.expiry_date ? formatDate(doc.expiry_date) : '-'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      {doc.file_url && (
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-label font-medium text-navy-950 hover:underline"
                        >
                          Download
                        </a>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        onPress={() => handleDelete(doc.id)}
                        isDisabled={deleteMutation.isPending}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      )}
      <ConfirmDialog
        open={confirmState.open}
        title="Delete Document"
        message="Are you sure you want to delete this document?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmState({ open: false, id: '' })}
      />
    </div>
  )
}

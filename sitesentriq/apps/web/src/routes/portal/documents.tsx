import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { AppCard, SearchInput, PageHeader } from '@haumea/ui'
import { FilterSelect } from '@haumea/ui'
import { useDocuments } from '@/hooks/use-documents'
import { formatDate } from '@haumea/utils'
import type { DocumentWithRelations } from '@haumea/types'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { usePortalProperty } from '@/components/layout/portal-layout'

const DOCUMENT_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'report', label: 'Report' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'contract', label: 'Contract' },
  { value: 'manual', label: 'Manual' },
  { value: 'other', label: 'Other' },
]

export default function PortalDocumentsPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const { selectedPropertyId } = usePortalProperty()

  const { data: documents, isLoading } = useDocuments({
    document_type: typeFilter || undefined,
    search: search || undefined,
    property_id: selectedPropertyId ?? undefined,
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Documents &amp; Reports" />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          ariaLabel="Search documents"
          placeholder="Search documents..."
          className="flex-1 min-w-[200px]"
        />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          ariaLabel="Filter documents by type"
          options={DOCUMENT_TYPES}
        />
      </div>

      {/* Documents grid */}
      {isLoading ? (
        <CardGridSkeleton count={6} columns={3} />
      ) : !documents?.length ? (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <FileText size={28} strokeWidth={1.5} className="mb-2" />
            <p className="text-label text-text-muted">No documents found</p>
            <p className="text-micro text-text-muted mt-1">Documents and reports for your properties will appear here</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc: DocumentWithRelations) => (
            <AppCard key={doc.id} padding="sm">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-surface-page border border-border-subtle mt-0.5">
                  <FileText size={18} className="text-text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-label font-medium text-text-secondary truncate">{doc.name}</p>
                  {doc.properties?.name && (
                    <p className="text-caption text-text-muted mt-0.5">{doc.properties.name}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    {doc.document_type && (
                      <span className="text-micro font-medium text-text-muted bg-surface-page px-1.5 py-0.5 rounded capitalize">
                        {doc.document_type}
                      </span>
                    )}
                    {doc.uploaded_at && (
                      <span className="text-micro text-text-muted">{formatDate(doc.uploaded_at)}</span>
                    )}
                  </div>
                  {doc.expiry_date && (
                    <p className={`text-micro mt-1.5 ${new Date(doc.expiry_date) < new Date() ? 'text-status-overdue font-medium' : 'text-text-muted'}`}>
                      Expires: {formatDate(doc.expiry_date)}
                    </p>
                  )}
                </div>
              </div>
              {doc.file_url && (
                <div className="mt-3 pt-3 border-t border-border-subtle">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full border border-border-default text-text-secondary hover:bg-surface-page px-3 py-1.5 rounded-lg text-caption font-medium transition-colors"
                  >
                    <Download size={13} />
                    Download
                  </a>
                </div>
              )}
            </AppCard>
          ))}
        </div>
      )}
    </div>
  )
}

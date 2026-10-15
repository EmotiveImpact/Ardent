import { type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { Button, FieldError, Input, Label, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, Heading } from '@haumea/ui'
import { Download, Trash2 } from 'lucide-react'

import { ENGINEER_DOC_TYPES } from '@/lib/constants'
import { formatDate } from '@haumea/utils'
import { FileUpload } from '@/components/shared/file-upload'
import type { EngineerDocument as EngineerDocType } from '@haumea/types'

export const engineerDocumentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  document_type: z.string().min(1, 'Type is required'),
  expiry_date: z.string().optional(),
})

export type EngineerDocumentFormData = z.infer<typeof engineerDocumentSchema>

export function EngineerDocumentForm({
  form,
  onSubmit,
  isPending,
  file,
  onFileChange,
}: {
  form: UseFormReturn<EngineerDocumentFormData>
  onSubmit: (data: EngineerDocumentFormData) => void
  isPending: boolean
  file: File | null
  onFileChange: (file: File | null) => void
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = form

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <AppCard>
        <div className="space-y-4">
        <Heading level={3} scale="body">
          Upload Document
        </Heading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField isRequired isInvalid={!!errors.name}>
            <Label>Name</Label>
            <Input {...register('name')} />
            {errors.name ? <FieldError>{errors.name.message}</FieldError> : null}
          </TextField>
          <div>
            <label className="mb-1 block text-caption font-medium uppercase tracking-[0.04em] text-text-muted">Type *</label>
            <FormSelectController
              control={control}
              name="document_type"
              ariaLabel="Type"
              placeholder="Select type..."
              options={Object.entries(ENGINEER_DOC_TYPES).map(([key, label]) => ({ value: key, label }))}
            />
            {errors.document_type ? <p className="mt-1 text-micro text-status-overdue">{errors.document_type.message}</p> : null}
          </div>
          <TextField>
            <Label>Expiry Date</Label>
            <Input type="date" {...register('expiry_date')} />
          </TextField>
          <FileUpload
            label="File"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            value={file}
            onChange={onFileChange}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" isDisabled={isPending || !file}>
          {isPending ? 'Uploading...' : 'Upload Document'}
        </Button>
      </div>
        </div>
      </AppCard>
    </form>
  )
}

export function EngineerDocumentsTable({
  documents,
  onDelete,
  isDeleting,
}: {
  documents: EngineerDocType[]
  onDelete: (id: string) => void
  isDeleting: boolean
}) {
  return (
    <AppCard padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table aria-label="Engineer documents" className="w-full">
            <thead><tr>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Name</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Type</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Expiry Date</th>
              <th className="px-4 py-3 text-left text-micro font-semibold uppercase tracking-[0.04em] text-text-muted">Download</th>
              <th className="px-4 py-3"> </th>
            </tr></thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} id={doc.id} className="border-b border-border-default transition-colors last:border-0 hover:bg-surface-page/50">
                  <td className="px-4 py-3 text-label font-medium text-text-primary">{doc.name}</td>
                  <td className="px-4 py-3 text-label text-text-secondary">
                    {ENGINEER_DOC_TYPES[doc.document_type] || doc.document_type}
                  </td>
                  <td className="px-4 py-3 text-label text-text-secondary">{doc.expiry_date ? formatDate(doc.expiry_date) : '-'}</td>
                  <td className="px-4 py-3">
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-caption font-medium text-brand-500 transition-colors hover:text-brand-600"
                    >
                      <Download size={13} />
                      Download
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onPress={() => onDelete(doc.id)} isDisabled={isDeleting}>
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
        </table>
      </div>
    </AppCard>
  )
}

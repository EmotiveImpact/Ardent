import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Chip, FieldError, Input, Label, Spinner, TextArea, TextField } from '@haumea/ui'
import { FormSelectController, PageHeader } from '@haumea/ui'
import { useKBArticle, useUpdateKBArticle, useDeleteKBArticle } from '@/hooks/use-knowledge-base'
import { KB_CATEGORIES } from '@/lib/constants'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { DetailPageSkeleton } from '@/components/shared/skeletons'
import { useAuth } from '@/hooks/use-auth'
import { formatDate } from '@haumea/utils'
import { Pencil, Trash2, BookOpen, Clock, Tag, CheckCircle, XCircle, Send, ShieldCheck } from 'lucide-react'


// QA status colours map onto canonical status tokens so the table stays
// legible across all themes. "Under review" reuses the brand accent
// (warm orange) since it's an in-progress signal rather than a
// pass/fail. Approved → status-compliant, rejected → status-overdue.
const QA_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  not_reviewed: { label: 'Not Reviewed', color: 'text-text-secondary', bg: 'bg-surface-page' },
  under_review: { label: 'Under Review', color: 'text-text-accent', bg: 'bg-accent/10' },
  approved: { label: 'Approved', color: 'text-status-compliant', bg: 'bg-status-compliant/10' },
  rejected: { label: 'Rejected', color: 'text-status-overdue', bg: 'bg-status-overdue/10' },
}

const articleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  category: z.string().min(1, 'Category is required'),
  content: z.string().min(1, 'Content is required'),
  tags: z.string().optional(),
  is_published: z.boolean().optional(),
})

type ArticleFormData = z.infer<typeof articleSchema>

export default function KBArticleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { profile } = useAuth()

  const { data: article, isLoading } = useKBArticle(id!)
  const updateArticle = useUpdateKBArticle()
  const deleteArticle = useDeleteKBArticle()

  const isAdmin = profile?.role === 'org_admin' || profile?.role === 'admin'

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<ArticleFormData>({
    resolver: zodResolver(articleSchema),
  })

  const startEditing = () => {
    if (article) {
      reset({
        title: article.title,
        category: article.category,
        content: article.content || '',
        tags: article.tags?.join(', ') || '',
        is_published: article.is_published ?? true,
      })
    }
    setEditing(true)
  }

  const onSubmit = (data: ArticleFormData) => {
    const tagsArray = data.tags
      ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []

    updateArticle.mutate(
      {
        id: id!,
        title: data.title,
        category: data.category,
        content: data.content,
        tags: tagsArray,
        is_published: data.is_published ?? true,
      },
      {
        onSuccess: () => {
          setEditing(false)
        },
      }
    )
  }

  const handleDelete = () => {
    deleteArticle.mutate(id!, {
      onSuccess: () => {
        navigate('/dashboard/knowledge-base')
      },
    })
  }

  const handleQAAction = (status: 'under_review' | 'approved' | 'rejected') => {
    updateArticle.mutate({
      id: id!,
      qa_status: status,
      qa_reviewed_by: status === 'under_review' ? undefined : profile?.full_name,
      qa_reviewed_at: status === 'under_review' ? undefined : new Date().toISOString(),
    } as any)
  }

  if (isLoading) {
    return <DetailPageSkeleton withTabs={false} />
  }

  if (!article) {
    return (
      <div className="bg-surface-card border border-border-default rounded-xl">
        <div className="flex flex-col items-center justify-center py-16 text-text-muted">
          <BookOpen size={28} strokeWidth={1.5} className="mb-2" />
          <p className="text-label">Article not found</p>
        </div>
      </div>
    )
  }

  const qaStatus = article.qa_status || 'not_reviewed'
  const qaConfig = QA_STATUS_CONFIG[qaStatus] || QA_STATUS_CONFIG.not_reviewed

  return (
    <div className="space-y-6 max-w-[800px]">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Knowledge Base', path: '/dashboard/knowledge-base' },
        { label: article.title },
      ]} />

      {editing ? (
        /* Edit Mode */
        <>
          <div>
            <PageHeader title="Edit Article" subtitle="Update the knowledge base article" />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="bg-surface-card border border-border-default rounded-xl p-5 space-y-5">
              {/* Title */}
              <TextField isRequired isInvalid={!!errors.title}>
                <Label>Title</Label>
                <Input type="text" {...register('title')} />
                {errors.title && <FieldError>{errors.title.message}</FieldError>}
              </TextField>

              {/* Category */}
              <div>
                <label className="block text-caption font-medium text-text-muted uppercase tracking-[0.04em] mb-1.5">
                  Category <span className="text-status-overdue">*</span>
                </label>
                <FormSelectController
                  control={control}
                  name="category"
                  ariaLabel="Category"
                  placeholder="Select category..."
                  options={Object.entries(KB_CATEGORIES).map(([value, label]) => ({ value, label }))}
                />
                {errors.category && (
                  <p className="text-caption text-status-overdue mt-1">{errors.category.message}</p>
                )}
              </div>

              {/* Content */}
              <TextField isRequired isInvalid={!!errors.content}>
                <Label>Content</Label>
                <TextArea rows={12} {...register('content')} />
                {errors.content && <FieldError>{errors.content.message}</FieldError>}
              </TextField>

              {/* Tags */}
              <TextField>
                <Label>Tags</Label>
                <Input type="text" placeholder="comma-separated tags" {...register('tags')} />
              </TextField>

              {/* Published */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_published"
                  {...register('is_published')}
                  className="rounded border-border-strong accent-brand-500"
                />
                <label htmlFor="is_published" className="text-label text-text-secondary">
                  Published
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" onPress={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isDisabled={updateArticle.isPending}>
                {updateArticle.isPending && <Spinner size="sm" color="current" className="mr-2" />}
                Save Changes
              </Button>
            </div>
          </form>
        </>
      ) : (
        /* View Mode */
        <>
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <PageHeader title={article.title} />
                {article.is_published === false && (
                  <Chip variant="soft" color="warning" size="sm">
                    Draft
                  </Chip>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Chip
                  variant="soft"
                  color={article.category === 'safety' ? 'danger' : article.category === 'qa' ? 'warning' : article.category === 'training' ? 'accent' : article.category === 'procedures' ? 'accent' : 'default'}
                  size="sm"
                >
                  {KB_CATEGORIES[article.category ?? ''] || article.category || 'General'}
                </Chip>
                {article.author_name && (
                  <span className="text-caption text-text-muted">by {article.author_name}</span>
                )}
                <span className="flex items-center gap-1 text-caption text-text-muted">
                  <Clock size={12} />
                  {formatDate(article.updated_at || article.created_at)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onPress={startEditing}>
                <Pencil size={13} />
                Edit
              </Button>
              <Button variant="danger" size="sm" onPress={() => setConfirmDelete(true)}>
                <Trash2 size={13} />
                Delete
              </Button>
            </div>
          </div>

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tag size={13} className="text-text-muted" />
              {article.tags.map((tag: string, i: number) => (
                <Chip key={i} variant="soft" color="default" size="sm">
                  {tag}
                </Chip>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="bg-surface-card border border-border-default rounded-xl p-6">
            <div className="prose prose-sm max-w-none text-label text-text-secondary leading-relaxed whitespace-pre-wrap">
              {article.content || 'No content.'}
            </div>
          </div>

          {/* QA Sign-off Section */}
          <div className="bg-surface-card border border-border-default rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={16} className="text-brand-600" />
              <h3 className="text-body font-semibold text-text-primary">QA Sign-off</h3>
            </div>

            <div className="space-y-4">
              {/* Current status */}
              <div className="flex items-center gap-3">
                <span className="text-caption font-medium text-text-muted uppercase tracking-[0.04em]">Status:</span>
                <Chip
                  variant="soft"
                  color={qaStatus === 'approved' ? 'success' : qaStatus === 'rejected' ? 'danger' : qaStatus === 'under_review' ? 'accent' : 'default'}
                  size="sm"
                >
                  {qaConfig.label}
                </Chip>
              </div>

              {/* Reviewer info */}
              {article.qa_reviewed_by && (qaStatus === 'approved' || qaStatus === 'rejected') && (
                <div className="flex items-center gap-3 text-label text-text-secondary">
                  {qaStatus === 'approved' ? (
                    <CheckCircle size={14} className="text-status-compliant" />
                  ) : (
                    <XCircle size={14} className="text-status-overdue" />
                  )}
                  <span>
                    {qaStatus === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                    <span className="font-medium text-text-primary">{article.qa_reviewed_by}</span>
                    {article.qa_reviewed_at && (
                      <span className="text-text-muted"> on {formatDate(article.qa_reviewed_at)}</span>
                    )}
                  </span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-1">
                {qaStatus === 'not_reviewed' && (
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={() => handleQAAction('under_review')}
                    isDisabled={updateArticle.isPending}
                  >
                    <Send size={13} />
                    Submit for QA Review
                  </Button>
                )}

                {qaStatus === 'under_review' && isAdmin && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onPress={() => handleQAAction('approved')}
                      isDisabled={updateArticle.isPending}
                      className="bg-status-compliant hover:opacity-90 text-white"
                    >
                      <CheckCircle size={13} />
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onPress={() => handleQAAction('rejected')}
                      isDisabled={updateArticle.isPending}
                    >
                      <XCircle size={13} />
                      Reject
                    </Button>
                  </>
                )}

                {qaStatus === 'under_review' && !isAdmin && (
                  <p className="text-label text-text-muted">Awaiting admin review...</p>
                )}

                {(qaStatus === 'approved' || qaStatus === 'rejected') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => handleQAAction('under_review')}
                    isDisabled={updateArticle.isPending}
                  >
                    <Send size={13} />
                    Re-submit for Review
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Article"
        message="Are you sure you want to delete this article? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}

import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, FieldError, Input, Label, Spinner, TextArea, TextField } from '@haumea/ui'
import { AppCard, FormSelectController, PageHeader } from '@haumea/ui'
import { useCreateKBArticle } from '@/hooks/use-knowledge-base'
import { KB_CATEGORIES } from '@/lib/constants'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'

const articleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  category: z.string().min(1, 'Category is required'),
  content: z.string().min(1, 'Content is required'),
  tags: z.string().optional(),
  is_published: z.boolean().optional(),
})

type ArticleFormData = z.infer<typeof articleSchema>

export default function NewKBArticlePage() {
  const navigate = useNavigate()
  const createArticle = useCreateKBArticle()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ArticleFormData>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      title: '',
      category: '',
      content: '',
      tags: '',
      is_published: true,
    },
  })

  const onSubmit = (data: ArticleFormData) => {
    const tagsArray = data.tags
      ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : []

    createArticle.mutate(
      {
        title: data.title,
        category: data.category,
        content: data.content,
        tags: tagsArray,
        is_published: data.is_published ?? true,
      },
      {
        onSuccess: () => {
          navigate('/dashboard/knowledge-base')
        },
      }
    )
  }

  return (
    <div className="space-y-6 max-w-[800px]">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Knowledge Base', path: '/dashboard/knowledge-base' },
        { label: 'New Article' },
      ]} />

      <div>
        <PageHeader title="New Article" subtitle="Create a new knowledge base article" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <AppCard padding="md">
          <div className="space-y-5">
          {/* Title */}
          <TextField isRequired isInvalid={!!errors.title}>
            <Label>Title</Label>
            <Input type="text" placeholder="Article title..." {...register('title')} />
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
            <TextArea rows={12} placeholder="Write your article content here..." {...register('content')} />
            {errors.content && <FieldError>{errors.content.message}</FieldError>}
          </TextField>

          {/* Tags */}
          <TextField>
            <Label>Tags</Label>
            <Input type="text" placeholder="fire-safety, training, compliance (comma-separated)" {...register('tags')} />
            <p className="text-micro text-text-muted mt-1">Separate multiple tags with commas</p>
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
              Publish immediately
            </label>
          </div>
          </div>
        </AppCard>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onPress={() => navigate('/dashboard/knowledge-base')}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isDisabled={createArticle.isPending}>
            {createArticle.isPending && <Spinner size="sm" color="current" className="mr-2" />}
            Create Article
          </Button>
        </div>
      </form>
    </div>
  )
}

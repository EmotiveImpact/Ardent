import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { Button, Chip, Tabs } from '@haumea/ui'
import { useKBArticles } from '@/hooks/use-knowledge-base'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { KB_CATEGORIES } from '@/lib/constants'
import type { KBArticle } from '@haumea/types'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { Plus, BookOpen, Clock } from 'lucide-react'
import { formatDate } from '@haumea/utils'
import { SearchInput, PageHeader } from '@haumea/ui'


const ALL_CATEGORIES = [
  { label: 'All', value: '' },
  ...Object.entries(KB_CATEGORIES).map(([value, label]) => ({ label, value })),
]

export default function KnowledgeBasePage() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const { data: articles, isLoading, error } = useKBArticles()

  const filtered = useMemo(() => {
    if (!articles) return []
    let result = articles
    if (categoryFilter) {
      result = result.filter((a) => a.category === categoryFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        a.content?.toLowerCase().includes(q)
      )
    }
    return result
  }, [articles, search, categoryFilter])

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Breadcrumbs items={[
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Knowledge Base' },
      ]} />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <PageHeader title="Knowledge Base" subtitle="Training materials, procedures, and reference documents" />
        </div>
        <Button asChild variant="primary" size="sm">
          <Link to="/dashboard/knowledge-base/new">
            <Plus size={14} className="mr-1.5" /> New Article
          </Link>
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          ariaLabel="Search articles"
          placeholder="Search articles..."
          className="flex-1"
        />
      </div>

      {/* Category filter tabs */}
      <Tabs
        selectedKey={categoryFilter || 'all'}
        onSelectionChange={(key) => setCategoryFilter(key === 'all' ? '' : String(key))}
        aria-label="Filter articles by category"
        className="w-fit"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Filter articles by category">
            {ALL_CATEGORIES.map((c) => (
              <Tabs.Tab key={c.value || 'all'} id={c.value || 'all'}>
                {c.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {/* Loading */}
      {isLoading && <CardGridSkeleton count={6} columns={3} />}

      {/* Error */}
      {error && (
        <div className="text-label text-status-overdue bg-status-overdue/10 p-4 rounded-xl border border-status-overdue/30">
          Failed to load articles: {(error as Error).message}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="bg-surface-card border border-border-default rounded-xl">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-4">
              <BookOpen size={24} strokeWidth={1.5} className="text-text-muted" />
            </div>
            <h2 className="text-[15px] font-semibold text-text-primary mb-1">
              {search || categoryFilter ? 'No matching articles' : 'No articles yet'}
            </h2>
            <p className="text-label text-text-muted">
              {search || categoryFilter
                ? 'Try adjusting your search or filter.'
                : 'Create your first knowledge base article to get started.'}
            </p>
          </div>
        </div>
      )}

      {/* Article grid */}
      {!isLoading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((article: KBArticle) => (
            <Link
              key={article.id}
              to={`/dashboard/knowledge-base/${article.id}`}
              className="card-hover block bg-surface-card border border-border-default rounded-xl p-5 group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-[15px] font-semibold text-text-primary group-hover:text-brand-600 transition-colors line-clamp-1">
                  {article.title}
                </h3>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {article.is_published === false && (
                    <Chip variant="soft" color="warning" size="sm">
                      Draft
                    </Chip>
                  )}
                  <Chip
                    variant="soft"
                    color={article.category === 'safety' ? 'danger' : article.category === 'qa' ? 'warning' : article.category === 'training' ? 'accent' : article.category === 'procedures' ? 'accent' : 'default'}
                    size="sm"
                  >
                    {KB_CATEGORIES[article.category ?? ''] || article.category || 'General'}
                  </Chip>
                </div>
              </div>

              {article.content && (
                <p className="text-label text-text-muted line-clamp-2 mb-3">
                  {article.content.slice(0, 120)}{article.content.length > 120 ? '...' : ''}
                </p>
              )}

              <div className="flex items-center gap-3 text-micro text-text-muted">
                {article.author_name && (
                  <span>{article.author_name}</span>
                )}
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {formatDate(article.updated_at || article.created_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

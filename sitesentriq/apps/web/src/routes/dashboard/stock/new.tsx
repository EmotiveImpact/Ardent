import { useNavigate } from 'react-router'
import { AppCard } from '@haumea/ui'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { SectionHeader } from '@/components/shared/section-header'
import { StockItemForm } from '@/components/stock/stock-item-form'
import { useAuth } from '@/hooks/use-auth'
import { useCreateStockItem } from '@/lib/stock/hooks'

export default function NewStockItemPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const orgId = profile?.organisation_id ?? ''
  const createItem = useCreateStockItem()

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', path: '/dashboard' },
          { label: 'Stock', path: '/dashboard/stock' },
          { label: 'New item' },
        ]}
      />

      <SectionHeader variant="page" title="Add stock item" subtitle="Register a new part for your inventory" />

      <AppCard padding="md" className="max-w-3xl">
        <StockItemForm
          organisationId={orgId}
          submitting={createItem.isPending}
          submitLabel="Create item"
          onSubmit={async (draft) => {
            if (!orgId) return
            const created = await createItem.mutateAsync({ ...draft, organisation_id: orgId })
            navigate(`/dashboard/stock/${created.id}`)
          }}
        />
      </AppCard>
    </div>
  )
}

import { AlertTriangle } from 'lucide-react'
import { isLowStock, type StockItem } from '@/lib/stock'

interface LowStockBannerProps {
  items: StockItem[] | undefined
  onView: () => void
}

/**
 * Banner displayed above the stock list when one or more items are at/below
 * their reorder point. Click "View" jumps the list to the low-stock view.
 */
export function LowStockBanner({ items, onView }: LowStockBannerProps) {
  const lowItems = (items ?? []).filter(isLowStock)
  if (lowItems.length === 0) return null

  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-xl border border-status-overdue/30 bg-status-overdue/10 px-4 py-3"
    >
      <AlertTriangle size={18} className="shrink-0 text-status-overdue" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-label font-medium text-text-primary">
          {lowItems.length} item{lowItems.length === 1 ? '' : 's'} below reorder point
        </p>
        <p className="text-caption text-text-muted truncate">
          Replenish soon to avoid running out on jobs.
        </p>
      </div>
      <button
        type="button"
        onClick={onView}
        className="text-caption font-medium text-status-overdue hover:underline shrink-0"
      >
        View low stock
      </button>
    </div>
  )
}

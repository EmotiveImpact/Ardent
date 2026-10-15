// Stock TanStack Query hooks.
// Co-located with the data layer in src/lib/stock for module clarity.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  fetchStockItems,
  fetchStockItem,
  fetchMovementsForItem,
  fetchMovementsForJob,
  createStockItem,
  updateStockItem,
  archiveStockItem,
  recordMovement,
  type CreateStockItemArgs,
  type RecordMovementArgs,
  type StockItemDraft,
} from '@/lib/stock'

const STOCK_KEY = ['stock-items'] as const
const MOVEMENT_KEY = ['stock-movements'] as const

export function useStockItems(includeArchived = false) {
  return useQuery({
    queryKey: [...STOCK_KEY, { includeArchived }],
    queryFn: () => fetchStockItems(includeArchived),
  })
}

export function useStockItem(id: string | undefined) {
  return useQuery({
    queryKey: [...STOCK_KEY, id],
    queryFn: () => fetchStockItem(id as string),
    enabled: !!id,
  })
}

export function useStockMovementsForItem(itemId: string | undefined) {
  return useQuery({
    queryKey: [...MOVEMENT_KEY, 'item', itemId],
    queryFn: () => fetchMovementsForItem(itemId as string),
    enabled: !!itemId,
  })
}

export function useStockMovementsForJob(jobId: string | undefined) {
  return useQuery({
    queryKey: [...MOVEMENT_KEY, 'job', jobId],
    queryFn: () => fetchMovementsForJob(jobId as string),
    enabled: !!jobId,
  })
}

export function useCreateStockItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: CreateStockItemArgs) => createStockItem(args),
    onSuccess: () => {
      toast.success('Stock item created')
      qc.invalidateQueries({ queryKey: STOCK_KEY })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create stock item'),
  })
}

export function useUpdateStockItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<StockItemDraft> & { archived?: boolean } }) =>
      updateStockItem(id, patch),
    onSuccess: (_, vars) => {
      toast.success('Stock item updated')
      qc.invalidateQueries({ queryKey: STOCK_KEY })
      qc.invalidateQueries({ queryKey: [...STOCK_KEY, vars.id] })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update stock item'),
  })
}

export function useArchiveStockItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archiveStockItem(id),
    onSuccess: () => {
      toast.success('Stock item archived')
      qc.invalidateQueries({ queryKey: STOCK_KEY })
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to archive item'),
  })
}

export function useRecordMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: RecordMovementArgs) => recordMovement(args),
    onSuccess: (movement) => {
      toast.success('Stock movement recorded')
      qc.invalidateQueries({ queryKey: STOCK_KEY })
      qc.invalidateQueries({ queryKey: MOVEMENT_KEY })
      qc.invalidateQueries({ queryKey: [...STOCK_KEY, movement.stock_item_id] })
      if (movement.related_job_id) {
        qc.invalidateQueries({ queryKey: [...MOVEMENT_KEY, 'job', movement.related_job_id] })
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to record movement'),
  })
}

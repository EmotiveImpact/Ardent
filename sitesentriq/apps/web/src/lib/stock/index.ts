// Stock / Parts module — public client API.
// Wraps Supabase queries + mutations for stock_items and stock_movements,
// and exposes constants used across the UI layer.

import { supabase } from '@/lib/supabase'

export const STOCK_CATEGORIES = {
  filter: 'Filter',
  gasket: 'Gasket',
  valve: 'Valve',
  sensor: 'Sensor',
  lamp: 'Lamp',
  fuse: 'Fuse',
  other: 'Other',
} as const

export type StockCategory = keyof typeof STOCK_CATEGORIES

export const STOCK_UNITS = {
  each: 'Each',
  metres: 'Metres',
  litres: 'Litres',
} as const

export type StockUnit = keyof typeof STOCK_UNITS

export const MOVEMENT_TYPES = {
  receipt: 'Receipt',
  usage: 'Usage',
  adjustment: 'Adjustment',
  transfer: 'Transfer',
  write_off: 'Write off',
} as const

export type MovementType = keyof typeof MOVEMENT_TYPES

export interface StockItem {
  id: string
  organisation_id: string
  sku: string | null
  name: string
  category: StockCategory
  description: string | null
  unit: StockUnit
  unit_cost: number
  supplier_name: string | null
  supplier_part_number: string | null
  reorder_point: number
  reorder_qty: number
  current_qty: number
  location: string | null
  notes: string | null
  image_url: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export interface StockMovement {
  id: string
  organisation_id: string
  stock_item_id: string
  movement_type: MovementType
  quantity: number
  unit_cost_at_time: number | null
  related_job_id: string | null
  related_engineer_id: string | null
  related_purchase_order: string | null
  reason: string | null
  performed_by_user_id: string | null
  performed_at: string
  notes: string | null
  created_at: string
}

export interface StockItemDraft {
  sku?: string | null
  name: string
  category: StockCategory
  description?: string | null
  unit: StockUnit
  unit_cost: number
  supplier_name?: string | null
  supplier_part_number?: string | null
  reorder_point: number
  reorder_qty: number
  location?: string | null
  notes?: string | null
  image_url?: string | null
}

/**
 * Fetch all non-archived stock items for the current org.
 * Pass `includeArchived` to view soft-deleted records.
 */
export async function fetchStockItems(includeArchived = false): Promise<StockItem[]> {
  let q = supabase.from('stock_items').select('*').order('name')
  if (!includeArchived) q = q.eq('archived', false)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as StockItem[]
}

export async function fetchStockItem(id: string): Promise<StockItem | null> {
  const { data, error } = await supabase
    .from('stock_items')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as StockItem | null
}

export async function fetchMovementsForItem(itemId: string): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('stock_item_id', itemId)
    .order('performed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as StockMovement[]
}

export async function fetchMovementsForJob(jobId: string): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('related_job_id', jobId)
    .order('performed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as StockMovement[]
}

export interface CreateStockItemArgs extends StockItemDraft {
  organisation_id: string
}

export async function createStockItem(args: CreateStockItemArgs): Promise<StockItem> {
  const { data, error } = await supabase
    .from('stock_items')
    .insert({
      organisation_id: args.organisation_id,
      sku: args.sku ?? null,
      name: args.name,
      category: args.category,
      description: args.description ?? null,
      unit: args.unit,
      unit_cost: args.unit_cost,
      supplier_name: args.supplier_name ?? null,
      supplier_part_number: args.supplier_part_number ?? null,
      reorder_point: args.reorder_point,
      reorder_qty: args.reorder_qty,
      location: args.location ?? null,
      notes: args.notes ?? null,
      image_url: args.image_url ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as StockItem
}

export async function updateStockItem(id: string, patch: Partial<StockItemDraft> & { archived?: boolean }): Promise<StockItem> {
  const { data, error } = await supabase
    .from('stock_items')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as StockItem
}

export async function archiveStockItem(id: string): Promise<void> {
  const { error } = await supabase
    .from('stock_items')
    .update({ archived: true })
    .eq('id', id)
  if (error) throw error
}

export interface RecordMovementArgs {
  organisation_id: string
  stock_item_id: string
  movement_type: MovementType
  /** Quantity is always positive; sign is derived from movement_type. */
  quantity: number
  unit_cost_at_time?: number | null
  related_job_id?: string | null
  related_engineer_id?: string | null
  related_purchase_order?: string | null
  reason?: string | null
  performed_by_user_id?: string | null
  notes?: string | null
}

/**
 * Record a stock movement. Positive movements (receipt) add to current_qty.
 * Outbound movements (usage / write_off / outbound transfer) subtract.
 * Adjustment is treated as a signed delta — the caller passes the delta directly.
 */
export async function recordMovement(args: RecordMovementArgs): Promise<StockMovement> {
  const sign =
    args.movement_type === 'receipt'
      ? 1
      : args.movement_type === 'usage' || args.movement_type === 'write_off' || args.movement_type === 'transfer'
        ? -1
        : // adjustment — caller supplies signed delta
          1

  const signedQty = args.movement_type === 'adjustment' ? args.quantity : sign * Math.abs(args.quantity)

  const { data, error } = await supabase
    .from('stock_movements')
    .insert({
      organisation_id: args.organisation_id,
      stock_item_id: args.stock_item_id,
      movement_type: args.movement_type,
      quantity: signedQty,
      unit_cost_at_time: args.unit_cost_at_time ?? null,
      related_job_id: args.related_job_id ?? null,
      related_engineer_id: args.related_engineer_id ?? null,
      related_purchase_order: args.related_purchase_order ?? null,
      reason: args.reason ?? null,
      performed_by_user_id: args.performed_by_user_id ?? null,
      notes: args.notes ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as StockMovement
}

/** Convenience: compute new_qty - current to obtain a signed adjustment delta. */
export function adjustmentDelta(currentQty: number, newQty: number): number {
  return newQty - currentQty
}

/** Items where current_qty <= reorder_point (and not archived). */
export function isLowStock(item: Pick<StockItem, 'current_qty' | 'reorder_point' | 'archived'>): boolean {
  return !item.archived && item.current_qty <= item.reorder_point
}

/** Items where current_qty <= 0. */
export function isOutOfStock(item: Pick<StockItem, 'current_qty' | 'archived'>): boolean {
  return !item.archived && item.current_qty <= 0
}

/** Total cost of a list of movements (sum of |qty| × unit_cost_at_time). */
export function sumMovementCost(movements: StockMovement[]): number {
  return movements.reduce((acc, m) => {
    const cost = m.unit_cost_at_time ?? 0
    return acc + Math.abs(m.quantity) * cost
  }, 0)
}

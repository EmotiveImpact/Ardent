import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderWithRelations,
  Supplier,
  SupplierItem,
} from '@haumea/types'

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name')
      if (error) throw error
      return (data ?? []) as Supplier[]
    },
  })
}

export function useSupplierItems(supplierId?: string) {
  return useQuery({
    queryKey: ['supplier_items', supplierId],
    enabled: !!supplierId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_items')
        .select('*')
        .eq('supplier_id', supplierId!)
        .eq('status', 'active')
        .order('name')
      if (error) {
        if (/schema cache|does not exist|supplier_items/i.test(error.message)) return []
        throw error
      }
      return (data ?? []) as SupplierItem[]
    },
  })
}

/**
 * Sprint 3 / B3 — single-supplier fetch for the new standalone
 * Suppliers detail page. Returns the supplier row plus the count of
 * non-cancelled POs raised against them so the detail header can
 * surface "12 active POs" without a second round-trip.
 */
export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: ['supplier', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Supplier
    },
  })
}

/**
 * Sprint 3 / B3 — total + active count of POs for a supplier. Used
 * on the Suppliers list (right-side stat) and the detail header.
 */
export function useSupplierPoCounts(id: string | undefined) {
  return useQuery({
    queryKey: ['supplier_po_counts', id],
    enabled: !!id,
    queryFn: async () => {
      const [{ count: totalCount }, { count: activeCount }] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select('id', { count: 'exact', head: true })
          .eq('supplier_id', id!),
        supabase
          .from('purchase_orders')
          .select('id', { count: 'exact', head: true })
          .eq('supplier_id', id!)
          .not('status', 'in', '(received,cancelled)'),
      ])
      return { total: totalCount ?? 0, active: activeCount ?? 0 }
    },
  })
}

export function useCreateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (supplier: Partial<Supplier>) => {
      const { data, error } = await supabase
        .from('suppliers')
        .insert(supplier)
        .select()
        .single()
      if (error) throw error
      return data as Supplier
    },
    onSuccess: () => {
      toast.success('Supplier saved')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save supplier')
    },
  })
}

export function useCreateSupplierItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: Partial<SupplierItem>) => {
      const { data, error } = await supabase
        .from('supplier_items')
        .insert(item)
        .select()
        .single()
      if (error) throw error
      return data as SupplierItem
    },
    onSuccess: (item) => {
      toast.success('Catalogue item saved')
      queryClient.invalidateQueries({ queryKey: ['supplier_items', item.supplier_id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save catalogue item')
    },
  })
}

/**
 * Sprint 3 / B3 — full update of a supplier row (everything the
 * detail page can edit). useUpdateSupplierStatus stays for the list
 * page's quick-toggle.
 */
export function useUpdateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Supplier> & { id: string }) => {
      const { data, error } = await supabase
        .from('suppliers')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Supplier
    },
    onSuccess: (data) => {
      toast.success('Supplier saved')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['supplier', data.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save supplier')
    },
  })
}

/**
 * Sprint 3 / B3 — delete a supplier. The DB enforces ON DELETE
 * RESTRICT against purchase_orders.supplier_id (you can't delete a
 * supplier that's been used) so the mutation surfaces a friendly
 * message instead of letting the FK error propagate raw.
 */
export function useDeleteSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id)
      if (error) {
        if (/foreign key|violates|reference/i.test(error.message)) {
          throw new Error(
            "Can't delete: this supplier has purchase orders. Mark inactive instead.",
          )
        }
        throw error
      }
      return id
    },
    onSuccess: () => {
      toast.success('Supplier deleted')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateSupplierStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Supplier['status'] }) => {
      const { data, error } = await supabase
        .from('suppliers')
        .update({ status })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Supplier
    },
    onSuccess: () => {
      toast.success('Supplier updated')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update supplier')
    },
  })
}

export function usePurchaseOrders(filters?: { status?: string }) {
  return useQuery({
    queryKey: ['purchase_orders', filters],
    queryFn: async () => {
      let query = supabase
        .from('purchase_orders')
        .select('*, suppliers(name), properties(name), jobs(title)')
        .order('created_at', { ascending: false })

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as PurchaseOrderWithRelations[]
    },
  })
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: ['purchase_orders', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, suppliers(*), properties(name, address), jobs(title), purchase_order_lines(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      if (data?.purchase_order_lines) {
        data.purchase_order_lines.sort(
          (a: PurchaseOrderLine, b: PurchaseOrderLine) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        )
      }
      return data as PurchaseOrderWithRelations
    },
  })
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      lines,
      ...purchaseOrder
    }: Partial<PurchaseOrder> & {
      lines: Array<Pick<PurchaseOrderLine, 'description' | 'sku' | 'quantity' | 'unit_cost' | 'tax_rate'>>
    }) => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .insert(purchaseOrder)
        .select()
        .single()
      if (error) throw error

      const lineRows = lines.map((line, index) => {
        const quantity = Number(line.quantity || 0)
        const unitCost = Number(line.unit_cost || 0)
        const taxRate = Number(line.tax_rate ?? 20)
        const lineSubtotal = quantity * unitCost
        const lineTax = lineSubtotal * (taxRate / 100)
        return {
          purchase_order_id: data.id,
          description: line.description,
          sku: line.sku || null,
          quantity,
          unit_cost: unitCost,
          tax_rate: taxRate,
          line_subtotal: lineSubtotal,
          line_tax: lineTax,
          line_total: lineSubtotal + lineTax,
          sort_order: index,
        }
      })

      if (lineRows.length > 0) {
        const { error: lineError } = await supabase.from('purchase_order_lines').insert(lineRows)
        if (lineError) {
          await supabase.from('purchase_orders').delete().eq('id', data.id)
          throw lineError
        }
      }

      return data as PurchaseOrder
    },
    onSuccess: () => {
      toast.success('Purchase order created')
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create purchase order')
    },
  })
}

export function useUpdatePurchaseOrderStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PurchaseOrder['status'] }) => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .update({ status })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as PurchaseOrder
    },
    onSuccess: (_, variables) => {
      toast.success('Purchase order updated')
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase_orders', variables.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update purchase order')
    },
  })
}

export function useUpdatePurchaseOrderWorkflow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PurchaseOrder> & { id: string }) => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as PurchaseOrder
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase_orders', variables.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update purchase order')
    },
  })
}

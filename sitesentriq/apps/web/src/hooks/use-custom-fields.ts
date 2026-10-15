// Custom fields (00124): per-org field definitions + reading/writing the
// values stored in each entity row's `custom_fields` jsonb.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { CustomFieldDefinition, CustomFieldEntity } from '@haumea/types'

const KEY = 'custom-field-defs'

// entity → DB table holding the custom_fields jsonb column.
const TABLE_FOR_ENTITY: Record<CustomFieldEntity, string> = {
  client: 'clients',
  property: 'properties',
  asset: 'assets',
  job: 'jobs',
  subcontractor: 'subcontractors',
  contract: 'contracts',
}

/** Active field definitions for an entity, in display order. */
export function useCustomFieldDefinitions(entity: CustomFieldEntity | undefined) {
  const { profile } = useAuth()
  return useQuery<CustomFieldDefinition[]>({
    queryKey: [KEY, entity],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_field_definitions')
        .select('*')
        .eq('entity', entity!)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as CustomFieldDefinition[]
    },
    enabled: !!entity && !!profile?.organisation_id,
  })
}

/** ALL definitions for an entity (incl. inactive) — for the settings editor. */
export function useAllCustomFieldDefinitions(entity: CustomFieldEntity) {
  const { profile } = useAuth()
  return useQuery<CustomFieldDefinition[]>({
    queryKey: [KEY, 'all', entity],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_field_definitions')
        .select('*')
        .eq('entity', entity)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as CustomFieldDefinition[]
    },
    enabled: !!profile?.organisation_id,
  })
}

export interface SaveFieldInput {
  id?: string
  entity: CustomFieldEntity
  field_key: string
  label: string
  field_type: CustomFieldDefinition['field_type']
  options?: string[] | null
  sort_order?: number
  is_active?: boolean
}

export function useSaveCustomFieldDefinition() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  return useMutation({
    mutationFn: async (input: SaveFieldInput) => {
      if (!profile?.organisation_id) throw new Error('No organisation')
      const row = {
        organisation_id: profile.organisation_id,
        entity: input.entity,
        field_key: input.field_key,
        label: input.label,
        field_type: input.field_type,
        options: input.field_type === 'select' ? input.options ?? [] : null,
        sort_order: input.sort_order ?? 0,
        is_active: input.is_active ?? true,
      }
      if (input.id) {
        const { error } = await supabase
          .from('custom_field_definitions')
          .update(row)
          .eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('custom_field_definitions').insert(row)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Custom field saved')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save field'),
  })
}

export function useDeleteCustomFieldDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_field_definitions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Custom field removed')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove field'),
  })
}

/** Persist an entity row's custom_fields jsonb. */
export function useSaveCustomFieldValues(entity: CustomFieldEntity) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase
        .from(TABLE_FOR_ENTITY[entity])
        .update({ custom_fields: values })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      // Entity detail queries vary; invalidate broadly by the entity's table key.
      qc.invalidateQueries({ queryKey: [TABLE_FOR_ENTITY[entity]] })
      toast.success('Saved')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to save'),
  })
}

/**
 * FK lookup helpers — resolve names → ids for the current organisation.
 * Used during import to translate user-supplied names (e.g. "Acme Corp")
 * to the database ids the insert requires.
 */
import { supabase } from '@/lib/supabase'
import type { ImportEntity } from './schemas'

const TABLE_FOR: Record<ImportEntity, string> = {
  clients: 'clients',
  properties: 'properties',
  assets: 'assets',
  engineers: 'engineers',
  compliance_items: 'compliance_items',
  contracts: 'contracts',
  subcontractors: 'subcontractors',
  maintenance_plans: 'maintenance_plans',
}

export type NameToIdMap = Record<string, string>

/**
 * Fetches all (id, name) pairs for an entity within the org, returns a
 * lowercase-name → id map. If multiple rows share a name, the most recent wins
 * (cheap, deterministic; users with duplicate names likely have a data issue
 * already).
 */
export async function fetchNameMap(
  entity: ImportEntity,
  organisationId: string,
): Promise<NameToIdMap> {
  const table = TABLE_FOR[entity]
  const { data, error } = await supabase
    .from(table)
    .select('id, name')
    .eq('organisation_id', organisationId)
  if (error) throw error
  const map: NameToIdMap = {}
  for (const row of (data ?? []) as { id: string; name: string }[]) {
    if (!row?.name) continue
    map[row.name.toLowerCase().trim()] = row.id
  }
  return map
}

export function resolveNameToId(map: NameToIdMap, name: string | undefined | null): string | null {
  if (!name) return null
  return map[String(name).toLowerCase().trim()] ?? null
}

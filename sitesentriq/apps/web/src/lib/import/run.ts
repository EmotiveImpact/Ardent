/**
 * Import execution: validate, transform, FK-resolve, batch-insert.
 *
 * Exposes:
 *  - `validateRows` — pure, used by the preview step
 *  - `runImport`    — performs the actual Supabase inserts + records an `import_runs` audit row
 */
import { supabase } from '@/lib/supabase'
import { fetchNameMap, resolveNameToId } from './lookup'
import { SCHEMAS, type ImportEntity } from './schemas'

export interface RowError {
  row: number
  message: string
}

export interface ValidatedRow {
  /** 1-based row number (excluding header). */
  rowNumber: number
  /** Raw CSV row (header → string). */
  raw: Record<string, string>
  /** Mapped DB record (field key → transformed value). FK fields still hold names here. */
  mapped: Record<string, unknown>
  /** Field-level errors collected during validation. */
  errors: { field: string; message: string }[]
  /** True if this row is a duplicate of an earlier row in the same CSV (by required-name keys). */
  isDuplicate: boolean
}

export interface ImportResult {
  inserted: number
  skipped: number
  errors: RowError[]
  importRunId: string | null
}

// ── Pure validation step ─────────────────────────────────────────────────────

/** Builds mapped + validated rows from raw CSV rows + the user's column mapping. */
export function validateRows(
  entity: ImportEntity,
  rows: Record<string, string>[],
  /** csv header → field key (or null when unmapped) */
  fieldMapping: Record<string, string | null>,
): ValidatedRow[] {
  const schema = SCHEMAS[entity]
  // reverse: field key → CSV header chosen for it (last-write wins; UI prevents duplicates)
  const fieldToHeader: Record<string, string> = {}
  for (const [header, fieldKey] of Object.entries(fieldMapping)) {
    if (fieldKey) fieldToHeader[fieldKey] = header
  }

  const seen = new Set<string>()
  const validated: ValidatedRow[] = []

  rows.forEach((raw, idx) => {
    const errors: { field: string; message: string }[] = []
    const mapped: Record<string, unknown> = {}

    for (const field of schema.fields) {
      const header = fieldToHeader[field.key]
      const rawVal = header ? raw[header] ?? '' : ''
      // Required check
      if (field.required && !rawVal.trim()) {
        errors.push({ field: field.key, message: `${field.label} is required` })
      }
      // Custom validate
      if (rawVal && field.validate) {
        const err = field.validate(rawVal, raw)
        if (err) errors.push({ field: field.key, message: err })
      }
      // Transform
      const value = field.transform ? field.transform(rawVal) : rawVal.trim() || null
      mapped[field.key] = value
    }

    // Dedup key: required string fields concatenated
    const dedupKey = schema.fields
      .filter((f) => f.required)
      .map((f) => String(mapped[f.key] ?? '').toLowerCase().trim())
      .join('||')
    const isDuplicate = dedupKey ? seen.has(dedupKey) : false
    if (dedupKey) seen.add(dedupKey)

    validated.push({
      rowNumber: idx + 1,
      raw,
      mapped,
      errors,
      isDuplicate,
    })
  })

  return validated
}

export function hasBlockingErrors(validated: ValidatedRow[]): boolean {
  return validated.some((r) => r.errors.length > 0)
}

// ── Insert flow ──────────────────────────────────────────────────────────────

interface RunImportArgs {
  entity: ImportEntity
  validated: ValidatedRow[]
  organisationId: string
  userId: string | null
  sourceFilename: string
}

/**
 * Resolve FK virtual fields (e.g. client_name → client_id), drop virtual fields,
 * and shape the record for direct insert into the entity's table.
 */
async function buildInsertRows(
  entity: ImportEntity,
  validated: ValidatedRow[],
  organisationId: string,
): Promise<{ rows: Record<string, unknown>[]; errors: RowError[]; skipped: number }> {
  const schema = SCHEMAS[entity]
  const errors: RowError[] = []
  let skipped = 0

  // Pre-fetch FK name maps (one per FK target entity)
  const fkMaps: Record<string, Record<string, string>> = {}
  if (schema.fkLookups) {
    for (const fk of schema.fkLookups) {
      fkMaps[fk.fieldKey] = await fetchNameMap(fk.targetEntity, organisationId)
    }
  }

  const insertRows: Record<string, unknown>[] = []

  for (const r of validated) {
    if (r.errors.length > 0) {
      // Already-known validation errors are reported up front; don't re-list here.
      continue
    }
    if (r.isDuplicate) {
      skipped++
      continue
    }

    const out: Record<string, unknown> = { organisation_id: organisationId }

    // Resolve FKs
    let fkFailed = false
    if (schema.fkLookups) {
      for (const fk of schema.fkLookups) {
        const name = String(r.mapped[fk.fieldKey] ?? '').trim()
        const id = resolveNameToId(fkMaps[fk.fieldKey], name)
        if (!id) {
          errors.push({
            row: r.rowNumber,
            message: `${fk.targetEntity.replace(/s$/, '')} "${name}" not found — create it first or fix the spelling`,
          })
          fkFailed = true
          break
        }
        out[fk.targetIdField] = id
      }
    }
    if (fkFailed) continue

    // Copy non-virtual fields
    const fkVirtualKeys = new Set((schema.fkLookups ?? []).map((f) => f.fieldKey))
    for (const f of schema.fields) {
      if (fkVirtualKeys.has(f.key)) continue
      const v = r.mapped[f.key]
      if (v == null || v === '') continue
      out[f.key] = v
    }

    // Entity-specific shaping
    if (entity === 'properties') {
      // Combine address + postcode + city into the single `address` column;
      // store property_type in `site_type`; fold notes into `access_notes`.
      const parts: string[] = []
      if (out.address) parts.push(String(out.address))
      if (out.city) parts.push(String(out.city))
      if (out.postcode) parts.push(String(out.postcode))
      out.address = parts.join(', ') || 'No address'
      delete out.city
      delete out.postcode
      if (out.property_type) {
        out.site_type = out.property_type
        delete out.property_type
      }
    }
    if (entity === 'assets') {
      // `location` is virtual — fold into notes. (Schema only has `area_id`.)
      if (out.location) {
        const noteParts = [String(out.location), out.notes ? String(out.notes) : '']
          .filter(Boolean)
          .join(' — ')
        out.notes = `Location: ${noteParts}`
        delete out.location
      }
    }
    if (entity === 'compliance_items') {
      // Fall back: name defaults to compliance_type if blank
      if (!out.name && out.compliance_type) out.name = out.compliance_type
    }

    insertRows.push(out)
  }

  return { rows: insertRows, errors, skipped }
}

export async function runImport(args: RunImportArgs): Promise<ImportResult> {
  const { entity, validated, organisationId, userId, sourceFilename } = args
  const totalRows = validated.length
  const validationErrorCount = validated.filter((r) => r.errors.length > 0).length

  // Open the audit run
  let importRunId: string | null = null
  try {
    const { data, error } = await supabase
      .from('import_runs')
      .insert({
        organisation_id: organisationId,
        entity_type: entity,
        started_by_user_id: userId,
        source_filename: sourceFilename,
        total_rows: totalRows,
        status: 'running',
      })
      .select('id')
      .single()
    if (!error && data) importRunId = (data as { id: string }).id
  } catch {
    // Audit row failure shouldn't block the import; we'll still return results.
  }

  const errors: RowError[] = []
  // Surface the up-front validation errors first.
  for (const r of validated) {
    for (const e of r.errors) {
      errors.push({ row: r.rowNumber, message: `${e.field}: ${e.message}` })
    }
  }

  let inserted = 0
  let skipped = 0
  try {
    const built = await buildInsertRows(entity, validated, organisationId)
    skipped += built.skipped
    errors.push(...built.errors)
    const insertRows = built.rows

    // Chunked inserts (50 at a time)
    const CHUNK = 50
    const tableName = entity // tables match entity names
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      const chunk = insertRows.slice(i, i + CHUNK)
      const { data, error } = await supabase.from(tableName).insert(chunk).select('id')
      if (error) {
        errors.push({ row: 0, message: `Insert failed: ${error.message}` })
        continue
      }
      inserted += data?.length ?? chunk.length
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown import error'
    errors.push({ row: 0, message: msg })
  }

  // Close the audit run
  if (importRunId) {
    try {
      await supabase
        .from('import_runs')
        .update({
          inserted_rows: inserted,
          skipped_rows: skipped,
          error_rows: errors.length,
          errors_json: errors.slice(0, 100),
          status: errors.length > 0 && inserted === 0 ? 'failed' : 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', importRunId)
    } catch {
      // ignore
    }
  }

  return {
    inserted,
    skipped: skipped + validationErrorCount,
    errors,
    importRunId,
  }
}

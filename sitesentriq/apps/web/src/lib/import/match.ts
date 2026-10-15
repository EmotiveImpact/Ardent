/**
 * Auto-mapping CSV headers → field keys via fuzzy match.
 *
 * Score per (header, fieldSpec) pair:
 *  - exact normalised header == field key OR matches one of matchHints → 100/95
 *  - normalised matchHint == header → 90
 *  - either string contains the other (substring) → 50–70
 *  - else 0
 *
 * Threshold: only auto-pick when score ≥ 50. Each CSV header gets at most one
 * field; field keys are taken on a first-claim basis (highest-scoring header
 * wins per field, ties broken by appearance order).
 */
import type { FieldSpec } from './schemas'

const normalise = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

function pairScore(headerN: string, field: FieldSpec): number {
  const keyN = normalise(field.key)
  if (headerN === keyN) return 100
  const hintsN = field.matchHints.map(normalise)
  if (hintsN.includes(headerN)) return 95
  // partial: header in hint, hint in header
  let best = 0
  for (const hint of hintsN) {
    if (!hint) continue
    if (headerN.includes(hint) || hint.includes(headerN)) {
      const overlap = Math.min(headerN.length, hint.length) / Math.max(headerN.length, hint.length)
      const score = 50 + Math.round(overlap * 20) // 50..70
      if (score > best) best = score
    }
  }
  if (headerN.includes(keyN) || keyN.includes(headerN)) {
    const overlap = Math.min(headerN.length, keyN.length) / Math.max(headerN.length, keyN.length)
    const score = 50 + Math.round(overlap * 20)
    if (score > best) best = score
  }
  return best
}

export interface MappingSuggestion {
  /** csv header → field key (or null if no confident match) */
  mapping: Record<string, string | null>
  /** scores for debugging/UX hints */
  scores: Record<string, number>
}

export function suggestMapping(csvHeaders: string[], fields: FieldSpec[]): MappingSuggestion {
  const mapping: Record<string, string | null> = {}
  const scores: Record<string, number> = {}
  const claimedFields = new Set<string>()

  // Compute all (header, field) scores then assign greedily by score.
  type Cell = { header: string; field: string; score: number }
  const cells: Cell[] = []
  for (const h of csvHeaders) {
    const hn = normalise(h)
    for (const f of fields) {
      const score = pairScore(hn, f)
      if (score >= 50) cells.push({ header: h, field: f.key, score })
    }
    mapping[h] = null
    scores[h] = 0
  }
  cells.sort((a, b) => b.score - a.score)

  for (const c of cells) {
    if (mapping[c.header] != null) continue
    if (claimedFields.has(c.field)) continue
    mapping[c.header] = c.field
    scores[c.header] = c.score
    claimedFields.add(c.field)
  }
  return { mapping, scores }
}

/**
 * Minimal RFC-4180-ish CSV parser. Handles:
 *  - quoted values containing commas, quotes (escaped as ""), and newlines
 *  - CRLF + LF line endings
 *  - BOM stripping
 *  - empty trailing rows
 *
 * No dependencies — keeping bulk import self-contained.
 */
export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

export function parseCsv(text: string): ParsedCsv {
  if (!text) return { headers: [], rows: [] }

  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const records: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      // swallow optional LF
      if (text[i + 1] === '\n') i++
      row.push(field)
      records.push(row)
      field = ''
      row = []
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      records.push(row)
      field = ''
      row = []
      i++
      continue
    }
    field += ch
    i++
  }
  // flush last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    records.push(row)
  }

  // Drop entirely-empty trailing rows
  while (records.length > 0) {
    const last = records[records.length - 1]
    if (last.length === 1 && last[0] === '') records.pop()
    else if (last.every((v) => v === '')) records.pop()
    else break
  }

  if (records.length === 0) return { headers: [], rows: [] }

  const headers = records[0].map((h) => h.trim())
  const rows: Record<string, string>[] = []
  for (let r = 1; r < records.length; r++) {
    const rec = records[r]
    const obj: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (rec[c] ?? '').trim()
    }
    // skip rows where every value is empty
    if (Object.values(obj).every((v) => v === '')) continue
    rows.push(obj)
  }
  return { headers, rows }
}

/** Build a CSV from headers + rows. Quotes values containing commas/quotes/newlines. */
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v)
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const lines: string[] = []
  lines.push(headers.map(escape).join(','))
  for (const r of rows) lines.push(r.map(escape).join(','))
  return lines.join('\r\n')
}

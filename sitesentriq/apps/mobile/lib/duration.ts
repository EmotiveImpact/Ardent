// Parse a free-text duration like "90", "1h30", "1:30", "2h", "1h30m", "45m"
// into minutes. Returns null if it can't be parsed to a positive duration.
//
// The grammar must accept every shape advertised in the time-entry UI's
// placeholder/help text — in particular bare-minute "1h30" (no trailing 'm'),
// which an earlier regex rejected, blocking engineers from logging time using
// the literally-documented format.
export function parseDurationMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  // h:mm or h:m
  const colon = s.match(/^(\d+):(\d{1,2})$/)
  if (colon) {
    const mins = parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10)
    return mins > 0 ? mins : null
  }
  // "1h30" / "2h 15" — hours then BARE minutes (no trailing 'm').
  const hBareMin = s.match(/^(\d+)\s*h\s*(\d{1,2})$/)
  if (hBareMin) {
    const mins = parseInt(hBareMin[1], 10) * 60 + parseInt(hBareMin[2], 10)
    return mins > 0 ? mins : null
  }
  // 1h30m / 1h / 30m forms
  const hm = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/)
  if (hm && (hm[1] || hm[2])) {
    const mins = (hm[1] ? parseInt(hm[1], 10) * 60 : 0) + (hm[2] ? parseInt(hm[2], 10) : 0)
    return mins > 0 ? mins : null
  }
  // plain number = minutes
  const n = Number(s)
  if (Number.isFinite(n) && n > 0) return Math.round(n)
  return null
}

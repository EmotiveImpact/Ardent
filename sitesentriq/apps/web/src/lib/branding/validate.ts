// Branding validation helpers (Wave 12 / Task 109).
//
// We keep these client-side only; the migration also enforces a hex
// CHECK constraint at the database level.

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isValidHex(value: string | null | undefined): boolean {
  if (!value) return false
  return HEX_RE.test(value.trim())
}

/** Convert "#rrggbb" → { h, s, l } (each 0–360 / 0–100 / 0–100). Returns null if invalid. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  if (!isValidHex(hex)) return null
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

/** Convert { h, s, l } → "#rrggbb". */
export function hslToHex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(100, s)) / 100
  l = Math.max(0, Math.min(100, l)) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Returns a "darker" sibling of a hex colour by dropping its lightness
 * by 10 points (clamped to 0). Used to derive the hover/active accent
 * automatically so the form only asks for one input.
 */
export function deriveDarkAccent(hex: string): string | null {
  const hsl = hexToHsl(hex)
  if (!hsl) return null
  return hslToHex(hsl.h, hsl.s, Math.max(0, hsl.l - 10))
}

/** Relative luminance (WCAG formula). 0 = black, 1 = white. */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const adjust = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b)
}

/** Contrast ratio (1–21). 4.5+ passes WCAG AA for normal text. */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = luminance(hexA)
  const lb = luminance(hexB)
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

/** Returns true if the accent has enough contrast against white text (≥4.5). */
export function passesContrastOnWhiteText(accent: string): boolean {
  if (!isValidHex(accent)) return false
  return contrastRatio(accent, '#ffffff') >= 4.5
}

// Apply org branding to the live DOM (Wave 12 / Task 109).
//
// Sets CSS custom properties on the <html> element so any
// element under the portal layout can pick them up via:
//   style={{ background: 'var(--portal-accent)' }}
// or
//   className="bg-[var(--portal-accent)]"
//
// We deliberately scope to the PORTAL only — the dashboard side
// always uses the original Haumea brand tokens. Callers should
// invoke `clearOrgBranding()` when leaving the portal context.

import type { OrgBranding } from './types'
import { deriveDarkAccent, isValidHex } from './validate'

const DEFAULT_ACCENT = '#e8772e' // brand-500 fallback (warm orange — matches @theme in index.css)
const DEFAULT_ACCENT_DARK = '#d06420' // brand-600 fallback

export function applyOrgBranding(branding: OrgBranding | null | undefined): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const enabled = !!branding?.branding_enabled

  if (enabled && isValidHex(branding!.accent_color)) {
    const accent = branding!.accent_color!
    const dark =
      isValidHex(branding!.accent_color_dark)
        ? branding!.accent_color_dark!
        : deriveDarkAccent(accent) ?? DEFAULT_ACCENT_DARK
    root.style.setProperty('--portal-accent', accent)
    root.style.setProperty('--portal-accent-dark', dark)
  } else {
    root.style.setProperty('--portal-accent', DEFAULT_ACCENT)
    root.style.setProperty('--portal-accent-dark', DEFAULT_ACCENT_DARK)
  }
}

export function clearOrgBranding(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.removeProperty('--portal-accent')
  root.style.removeProperty('--portal-accent-dark')
}

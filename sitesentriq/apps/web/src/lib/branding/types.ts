// White-label branding types (Wave 12 / Task 109).
//
// These fields live on the `organisations` table (see migration 00034).
// `branding_enabled = false` makes the portal fall back to the default
// Haumea look & feel.

export interface OrgBranding {
  logo_url: string | null
  accent_color: string | null
  accent_color_dark: string | null
  support_email: string | null
  support_phone: string | null
  portal_welcome_message: string | null
  portal_terms_url: string | null
  branding_enabled: boolean
}

export interface UpdateBrandingInput {
  organisation_id: string
  logo_url?: string | null
  accent_color?: string | null
  accent_color_dark?: string | null
  support_email?: string | null
  support_phone?: string | null
  portal_welcome_message?: string | null
  portal_terms_url?: string | null
  branding_enabled?: boolean
}

/** Curated set of preset accent colours surfaced as swatches. */
export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: 'Teal',    value: '#14b89a' },
  { name: 'Blue',    value: '#2563eb' },
  { name: 'Indigo',  value: '#4f46e5' },
  { name: 'Violet',  value: '#7c3aed' },
  { name: 'Rose',    value: '#e11d48' },
  { name: 'Orange',  value: '#ea580c' },
  { name: 'Amber',   value: '#d97706' },
  { name: 'Emerald', value: '#059669' },
]

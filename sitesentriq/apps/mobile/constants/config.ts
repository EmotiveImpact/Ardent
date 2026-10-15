import packageJson from '../package.json'

export const APP_CONFIG = {
  name: 'Haumea',
  version: packageJson.version,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const

export const COLORS = {
  navy: '#0f1225',
  navyLight: '#161a35',
  // App-chrome background (top header + bottom tab bar) — the original brand
  // navy. Kept matched top/bottom.
  chrome: '#0f1225',
  brand: '#e8772e',
  brandDark: '#cf6321',
  danger: '#ef4444',
  warning: '#f59e0b',
  success: '#10b981',
  successDark: '#059669',
  background: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
} as const

// Keys must be real jobs.status values (00001 CHECK). `on_hold` never existed;
// scheduled/due/incomplete/failed_access/revisit were missing → unstyled gray badge.
export const JOB_STATUS_COLORS: Record<string, string> = {
  not_ready: '#94a3b8',
  ready: '#3b82f6',
  scheduled: '#3b82f6',
  due: '#f59e0b',
  pending: '#f59e0b',
  pending_external: '#f59e0b',
  in_progress: '#6366f1',
  contractor_review: '#6366f1',
  performed: '#10b981',
  completed: '#10b981',
  incomplete: '#f59e0b',
  failed_access: '#ef4444',
  revisit: '#8b5cf6',
  rejected: '#ef4444',
  cancelled: '#ef4444',
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  not_ready: 'Not Ready',
  ready: 'Ready',
  scheduled: 'Scheduled',
  due: 'Due',
  pending: 'Pending',
  pending_external: 'Pending External',
  in_progress: 'In Progress',
  contractor_review: 'Contractor Review',
  performed: 'Performed',
  completed: 'Completed',
  incomplete: 'Incomplete',
  failed_access: 'No Access',
  revisit: 'Revisit',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

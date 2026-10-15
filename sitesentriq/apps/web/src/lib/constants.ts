export const APP_NAME = 'Haumea'

// Sprint 3 / D5 — product-level brand name for the customer-facing
// portal. ServiceTitan calls theirs the "Owner Portal", Jobber the
// "Client Hub". A name (not just "Portal") gives the surface its own
// gravity in marketing + sales conversations.
//
// Per-org branding always wins: when an organisation has set
// branding_enabled + a custom name, the layout shows the org's name
// instead. CLIENT_HUB_NAME is the default fallback when nothing is
// customised.
export const CLIENT_HUB_NAME = 'Client Hub'

// Build-time injected by Vite — see vite.config.ts `define`. Used to
// version the persisted query cache so deploys invalidate stale client
// state automatically. Fallback only applies in tests where the
// define isn't injected; production always has a real value.
declare const __APP_VERSION__: string
export const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'haumea@dev'

export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ORG_ADMIN: 'org_admin',
  SCHEDULER: 'scheduler',
  FINANCE: 'finance',
  ENGINEER: 'engineer',
  CLIENT_ADMIN: 'client_admin',
  AUDITOR: 'auditor',
} as const

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES]

export const JOB_STATUSES = {
  NOT_READY: 'not_ready',
  READY: 'ready',
  SCHEDULED: 'scheduled',
  DUE: 'due',
  IN_PROGRESS: 'in_progress',
  PENDING_EXTERNAL: 'pending_external',
  CONTRACTOR_REVIEW: 'contractor_review',
  REVISIT: 'revisit',
  PERFORMED: 'performed',
  COMPLETED: 'completed',
  INCOMPLETE: 'incomplete',
  FAILED_ACCESS: 'failed_access',
  REJECTED: 'rejected',
} as const

/** Display labels for every job status (V1 #1). */
export const JOB_STATUS_LABELS: Record<string, string> = {
  not_ready: 'Not Ready',
  ready: 'Ready',
  scheduled: 'Scheduled',
  due: 'Due',
  in_progress: 'In Progress',
  pending: 'Pending',
  pending_external: 'Pending External',
  contractor_review: 'Contractor Review',
  revisit: 'Revisit',
  performed: 'Performed',
  completed: 'Completed',
  incomplete: 'Incomplete',
  failed_access: 'Failed Access',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

/** Statuses that count as "closed/terminal" — excluded from open/overdue KPIs. */
export const CLOSED_JOB_STATUSES: string[] = [
  'completed', 'performed', 'rejected', 'cancelled', 'failed_access',
]

export const COMPLIANCE_STATUSES = {
  COMPLIANT: 'compliant',
  DUE_SOON: 'due_soon',
  OVERDUE: 'overdue',
  NON_COMPLIANT: 'non_compliant',
} as const

export const COMPLIANCE_TYPES = {
  FIRE_SAFETY: 'fire_safety',
  GAS_SAFETY: 'gas_safety',
  ELECTRICAL: 'electrical',
  HVAC: 'hvac',
  WATER_HYGIENE: 'water_hygiene',
  PEST_CONTROL: 'pest_control',
  HACCP: 'haccp',
  DOORS: 'doors',
  LIGHTING: 'lighting',
  ALARMS: 'alarms',
  FIRE_EXTINGUISHERS: 'fire_extinguishers',
  EMERGENCY_LIGHTING: 'emergency_lighting',
  PAT_TESTING: 'pat_testing',
  LEGIONELLA: 'legionella',
  ASBESTOS: 'asbestos',
  OTHER: 'other',
} as const

export type ComplianceType = (typeof COMPLIANCE_TYPES)[keyof typeof COMPLIANCE_TYPES]

export const COMPLIANCE_TYPE_LABELS: Record<string, string> = {
  fire_safety: 'Fire Safety',
  gas_safety: 'Gas Safety',
  electrical: 'Electrical',
  hvac: 'HVAC',
  water_hygiene: 'Water Hygiene',
  pest_control: 'Pest Control',
  haccp: 'HACCP',
  doors: 'Doors',
  lighting: 'Lighting',
  alarms: 'Alarms',
  fire_extinguishers: 'Fire Extinguishers',
  emergency_lighting: 'Emergency Lighting',
  pat_testing: 'PAT Testing',
  legionella: 'Legionella',
  asbestos: 'Asbestos',
  other: 'Other',
}

export const ACTION_STATUSES = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const

export const ACTION_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const

export const FREQUENCIES = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  SIX_MONTHLY: 'six_monthly',
  ANNUAL: 'annual',
} as const

export const NOTIFICATION_TYPES = {
  COMPLIANCE_DUE: 'compliance_due',
  COMPLIANCE_OVERDUE: 'compliance_overdue',
  VISIT_BOOKED: 'visit_booked',
  VISIT_REMINDER: 'visit_reminder',
  REPORT_UPLOADED: 'report_uploaded',
  QUOTE_AWAITING: 'quote_awaiting_approval',
  QUOTE_APPROVED: 'quote_approved',
  QUOTE_REJECTED: 'quote_rejected',
  INVOICE_DUE: 'invoice_due_soon',
  INVOICE_OVERDUE: 'invoice_overdue',
  CERTIFICATE_EXPIRING: 'certificate_expiring',
  ACTION_OVERDUE: 'action_overdue',
  CALLOUT_RAISED: 'callout_raised',
  JOB_COMPLETED: 'job_completed',
  DOCUMENT_UPLOADED: 'document_uploaded',
} as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES]

export const TIMELINE_EVENT_TYPES = {
  VISIT_COMPLETED: 'visit_completed',
  REPORT_UPLOADED: 'report_uploaded',
  INVOICE_ISSUED: 'invoice_issued',
  QUOTE_SENT: 'quote_sent',
  QUOTE_APPROVED: 'quote_approved',
  QUOTE_REJECTED: 'quote_rejected',
  CERTIFICATE_EXPIRED: 'certificate_expired',
  CERTIFICATE_ISSUED: 'certificate_issued',
  ACTION_RAISED: 'action_raised',
  ACTION_RESOLVED: 'action_resolved',
  DOCUMENT_UPLOADED: 'document_uploaded',
  COMPLIANCE_UPDATED: 'compliance_updated',
} as const

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[keyof typeof TIMELINE_EVENT_TYPES]

// ── Engineers & Subcontractors ──────────────────────

export const ACCREDITATION_TYPES: Record<string, string> = {
  qqi_level_5: 'QQI Level 5',
  qqi_level_6: 'QQI Level 6',
  qqi_level_7: 'QQI Level 7',
  gas_safe: 'Gas Safe',
  rgii_gas_installer: 'RGII Gas Installer',
  domestic_gas: 'Domestic Gas',
  commercial_gas: 'Commercial Gas',
  lpg_gas: 'LPG Gas',
  niceic: 'NICEIC',
  part_p: 'Part P',
  f_gas: 'F-Gas',
  oftec: 'OFTEC',
  ciphe: 'CIPHE',
  bpec: 'BPEC',
  city_guilds: 'City & Guilds',
  other: 'Other',
}

export const ENGINEER_DOC_TYPES: Record<string, string> = {
  dbs: 'DBS Check',
  right_to_work: 'Right to Work',
  insurance: 'Insurance',
  qualification: 'Qualification',
  certification: 'Certification',
  other: 'Other',
}

export const SUBCONTRACTOR_DOC_TYPES: Record<string, string> = {
  risk_assessment: 'Risk Assessment',
  insurance: 'Insurance',
  certification: 'Certification',
  qualification: 'Qualification',
  method_statement: 'Method Statement',
  other: 'Other',
}

export const JOB_OUTCOMES: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  incomplete: 'Incomplete',
  revisit: 'Revisit',
  n_a: 'N/A',
}

export const VISIT_FREQUENCIES: Record<string, { label: string; months: number }> = {
  weekly: { label: 'Weekly', months: 0.25 },
  monthly: { label: 'Monthly', months: 1 },
  quarterly: { label: 'Quarterly', months: 3 },
  biannual: { label: 'Bi-Annual', months: 6 },
  annual: { label: 'Annual', months: 12 },
}

// ── Client Feedback: SLA Priorities ──────────────────────

export const SLA_PRIORITIES: Record<string, { label: string; response: string; color: string }> = {
  p1: { label: 'P1 — Emergency', response: '4 hours', color: '#dc2626' },
  p2: { label: 'P2 — Urgent', response: '2 days', color: '#f59e0b' },
  p3: { label: 'P3 — Standard', response: '5 days', color: '#3b82f6' },
  p4: { label: 'P4 — Low', response: '7–10 days', color: '#6366f1' },
  p5: { label: 'P5 — Planned', response: '10–14 days', color: '#8b5cf6' },
  p6: { label: 'P6 — PPM', response: '4–6 weeks', color: '#64748b' },
}

export const JOB_TYPES: Record<string, string> = {
  reactive: 'Reactive',
  ppm: 'PPM',
  service: 'Service',
}

/**
 * Service groups / disciplines a job/task can be categorised under (V1 #4).
 * Used for the "Service Group" column + filter on the task list. Free-text in
 * the DB, but the UI offers this known list.
 */
export const SERVICE_GROUPS: string[] = [
  'Fire Detection, Alarms & Components',
  'Emergency & Exit Lighting',
  'Fire Extinguishers',
  'Fire Doors',
  'Sprinklers & Suppression',
  'Access Control',
  'Intruder Alarm & CCTV',
  'Electrical (Fixed Wire / PAT)',
  'HVAC & Ventilation',
  'Water Hygiene',
  'Gas Safety',
  'Lifts & Hoists',
  'General / Reactive',
]

export const ROUTINE_CHECK_TYPES: Record<string, string> = {
  '30_mins': '30 Minutes',
  '3_hrs': '3 Hours',
  isolate: 'Isolate',
}

export const QUOTE_TYPES: Record<string, string> = {
  service_quote: 'Service Quote',
  defect_quote: 'Defect Quote',
  service: 'Service Quote',
  reactive: 'Defect Quote',
}

export const TASK_OUTCOMES: Record<string, string> = {
  complete: 'Complete',
  incomplete: 'Incomplete',
  revisit: 'Revisit',
}

export const KB_CATEGORIES: Record<string, string> = {
  training: 'Training',
  procedures: 'Procedures',
  qa: 'Quality Assurance',
  safety: 'Safety',
  general: 'General',
}

export const ENGINEER_TYPES: Record<string, string> = {
  general: 'General',
  electrical: 'Electrical',
  plumber: 'Plumber',
  gas_certified: 'Gas Certified',
  specialist: 'Specialist',
}

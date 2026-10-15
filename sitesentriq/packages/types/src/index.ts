export interface Organisation {
  id: string
  name: string
  slug: string
  created_at: string
  // White-label branding (Wave 12 / Task 109). Nullable when the org
  // hasn't filled the branding form in yet.
  logo_url?: string | null
  accent_color?: string | null
  accent_color_dark?: string | null
  support_email?: string | null
  support_phone?: string | null
  portal_welcome_message?: string | null
  portal_terms_url?: string | null
  branding_enabled?: boolean
}

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: string
  organisation_id: string
  // For client_admin portal users: the single client they're scoped to
  // (migration 00096). NULL/undefined for staff. Used to scope portal queries.
  client_id?: string | null
  avatar_url?: string
  phone?: string | null
  created_at: string
}

/**
 * Wave 14 / Task 114 — Tenant portal user mapping.
 * A property_contact is a site-level end-user (pub manager,
 * school facilities lead) attached to ONE property.
 */
export interface PropertyContact {
  id: string
  organisation_id: string
  client_id: string
  property_id: string
  user_id?: string | null
  email: string
  full_name: string
  role_at_site: string
  invited_at: string
  accepted_at?: string | null
  invited_by_user_id?: string | null
  invite_token?: string | null
  invite_token_expires_at?: string | null
  status: 'invited' | 'active' | 'disabled'
  created_at: string
  updated_at?: string
}

export interface PropertyContactWithRelations extends PropertyContact {
  properties?: { name: string; address?: string } | null
  clients?: { name: string } | null
}

export interface Client {
  id: string
  organisation_id: string
  client_code?: string | null
  name: string
  contact_email?: string
  contact_phone?: string
  /** Named primary contact at the client (migration 00098). */
  primary_contact_name?: string | null
  primary_contact_phone?: string | null
  address?: string
  billing_email?: string | null
  billing_address?: string | null
  billing_terms?: string | null
  tax_number?: string | null
  notes?: string
  archived_at?: string
  created_at: string
}

export interface Property {
  id: string
  client_id: string
  organisation_id: string
  property_code?: string | null
  /** Auto per-org property number, e.g. "P-123" (migration 00102). */
  property_number?: string | null
  name: string
  address: string
  site_type?: string
  operating_hours?: string
  access_notes?: string
  emergency_details?: string
  site_manager?: string
  /** On-site access manager phone + a primary technician (migration 00098). */
  site_manager_name?: string | null
  site_manager_phone?: string | null
  primary_technician_id?: string | null
  region?: string | null
  takeover_date?: string | null
  latitude?: number | null
  longitude?: number | null
  archived_at?: string
  created_at: string
}

export interface Area {
  id: string
  property_id: string
  name: string
  floor?: string
  description?: string
}

export interface Asset {
  id: string
  property_id: string
  area_id?: string
  organisation_id: string
  name: string
  category: string
  make?: string
  model?: string
  serial_number?: string
  install_date?: string
  status: string
  created_at: string
}

export interface ComplianceItem {
  id: string
  property_id: string
  asset_id?: string
  organisation_id: string
  name: string
  compliance_type: string
  frequency: string
  last_completed?: string
  next_due?: string
  status: string
  created_at: string
}

export interface MaintenancePlan {
  id: string
  property_id: string
  asset_id?: string
  organisation_id: string
  contract_id?: string | null
  name: string
  description?: string
  maintenance_category?: 'routine' | 'reactive' | 'statutory' | 'other' | string
  maintenance_type?: string | null
  frequency: string
  schedule_mode: 'fixed' | 'rolling'
  starts_at?: string | null
  last_completed?: string
  next_due?: string
  is_active: boolean
  // SFG20 alignment (00123) — operator tags the plan with its SFG20 schedule
  // reference; the credibility marker for UK FM tenders.
  sfg20_aligned?: boolean
  sfg20_schedule_ref?: string | null
  sfg20_last_reviewed?: string | null
  created_at: string
}

export interface Job {
  id: string
  /** Human-readable per-org job number, e.g. "H-101" (migration 00097). */
  job_number?: string | null
  /** Service-group/discipline category, e.g. "Fire Detection, Alarms & Components" (00099). */
  service_group?: string | null
  /** Parent task — links a defect/remedial task to its source visit (00101). */
  parent_job_id?: string | null
  property_id: string
  organisation_id: string
  maintenance_plan_id?: string
  /** Source compliance item when this job was generated from a compliance
   *  schedule (column exists since migration 00081; FK in 00041). Used to
   *  dedup generated jobs so regeneration doesn't create duplicates. */
  compliance_item_id?: string
  title: string
  description?: string
  status: string
  priority: string
  sla_priority?: string
  job_type?: 'reactive' | 'ppm' | 'service'
  scheduled_date?: string
  completed_date?: string
  time_start?: string
  time_end?: string
  outcome?: 'pass' | 'fail' | 'incomplete' | 'n_a' | 'revisit'
  // Customer signature lives in signature_url (captured at customer_signature_at).
  // The engineer signature has its own column so the two no longer collide.
  signature_url?: string | null
  engineer_signature_url?: string | null
  is_callout?: boolean
  is_out_of_hours?: boolean
  routine_check_type?: string
  engineer_record_id?: string
  subcontractor_id?: string
  // Subcontractor compliance-gate override trail (00116, W2-T5): set when an
  // org admin dispatched past a failing compliance check, with the reason.
  subcontractor_override_reason?: string | null
  subcontractor_override_by?: string | null
  subcontractor_override_at?: string | null
  // Permit-to-work (00121, W3-T10): flagged jobs cannot enter in_progress
  // without an issued/active permit (DB-enforced gate).
  requires_permit?: boolean
  // SLA engine (00117, W2-T6): targets stamped at creation by trigger from the
  // matching active contract policy; met-times stamped from field activity.
  sla_contract_id?: string | null
  target_response_at?: string | null
  target_fix_at?: string | null
  sla_response_met_at?: string | null
  sla_fix_met_at?: string | null
  // Portal call-out metadata (Phase 5C)
  created_via?: 'portal' | 'internal' | 'api'
  created_by_user_id?: string
  client_id?: string
  expected_arrival_at?: string
  // Sprint 3 / D3 — customer-facing arrival window (start + end).
  // Surfaced on the public ETA page; nullable until set by dispatcher.
  eta_earliest_at?: string | null
  eta_latest_at?: string | null
  callout_metadata?: CalloutMetadata | null
  archived_at?: string
  created_at: string
}

/** Metadata captured when a client raises a call-out from the portal. */
export interface CalloutMetadata {
  category?: string
  asset_id?: string | null
  contact_name?: string
  contact_phone?: string
  best_access_time?: string
  photo_urls?: string[]
}

export interface EngineerAssignment {
  id: string
  job_id: string
  engineer_id: string
  assigned_at: string
}

export interface ServiceReport {
  id: string
  job_id: string
  organisation_id: string
  notes?: string
  outcome?: string
  submitted_at: string
}

export interface Document {
  id: string
  organisation_id: string
  property_id?: string
  asset_id?: string
  job_id?: string
  compliance_item_id?: string
  name: string
  file_url: string
  file_size?: number
  mime_type?: string
  document_type?: string
  tags?: string[]
  expiry_date?: string
  version: number
  uploaded_by?: string
  uploaded_at: string
}

export interface Action {
  id: string
  organisation_id: string
  property_id?: string
  job_id?: string
  title: string
  description?: string
  status: string
  priority: string
  due_date?: string
  resolution_notes?: string
  created_by?: string
  created_at: string
}

export interface Quote {
  id: string
  organisation_id: string
  client_id: string
  property_id?: string
  /** Source job/task this quote was raised from (migration 00104). */
  job_id?: string | null
  quote_number: string
  quote_type?: 'service_quote' | 'defect_quote' | 'reactive' | 'service'
  status: string
  subtotal?: number
  tax?: number
  total: number
  valid_until?: string
  notes?: string
  created_by?: string | null
  created_at: string
}

export interface Invoice {
  id: string
  organisation_id: string
  client_id: string
  quote_id?: string
  property_id?: string
  invoice_number: string
  status: string
  subtotal?: number
  tax?: number
  total: number
  due_date?: string
  paid_date?: string
  notes?: string
  created_by?: string
  tags?: string[]
  created_at: string
  updated_at?: string
}

export type JobPhotoType = 'before' | 'after' | 'issue' | 'general'

export interface JobPhoto {
  id: string
  job_id: string
  organisation_id: string
  file_url: string
  caption?: string
  photo_type: JobPhotoType
  uploaded_by?: string
  uploaded_at: string
}

export interface TimelineEvent {
  id: string
  organisation_id: string
  property_id?: string
  client_id?: string
  event_type: string
  description: string
  user_id?: string
  created_at: string
}

export interface QuoteLine {
  id: string
  quote_id: string
  description: string
  quantity: number
  cost_price?: number | null
  markup_percent?: number | null
  tax_rate?: number | null
  unit_price: number
  total: number
  sort_order: number
}

export interface QuoteRevision {
  id: string
  organisation_id: string
  quote_id: string
  revision_number: number
  reason?: string | null
  status_snapshot?: string | null
  total_snapshot?: number | null
  payload?: Record<string, unknown>
  created_by?: string | null
  created_at: string
}

export interface Supplier {
  id: string
  organisation_id: string
  name: string
  account_number?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  website?: string | null
  default_tax_rate?: number | null
  payment_terms?: string | null
  status: 'active' | 'inactive'
  notes?: string | null
  created_at: string
}

export interface SupplierItem {
  id: string
  organisation_id: string
  supplier_id: string
  sku?: string | null
  name: string
  description?: string | null
  unit_cost: number
  tax_rate: number
  unit: string
  status: 'active' | 'inactive'
  last_used_at?: string | null
  created_at: string
}

export interface PurchaseOrder {
  id: string
  organisation_id: string
  supplier_id: string
  property_id?: string | null
  job_id?: string | null
  quote_id?: string | null
  po_number: string
  status: 'draft' | 'sent' | 'approved' | 'received' | 'cancelled'
  order_date?: string | null
  expected_date?: string | null
  subtotal: number
  tax: number
  total: number
  delivery_address?: string | null
  notes?: string | null
  supplier_email?: string | null
  supplier_reference?: string | null
  sent_at?: string | null
  approved_at?: string | null
  received_at?: string | null
  cancelled_at?: string | null
  emailed_to?: string | null
  last_emailed_at?: string | null
  created_by?: string | null
  created_at: string
}

export interface PurchaseOrderLine {
  id: string
  purchase_order_id: string
  description: string
  sku?: string | null
  quantity: number
  unit_cost: number
  tax_rate: number
  line_subtotal: number
  line_tax: number
  line_total: number
  sort_order: number
}

export interface PurchaseOrderWithRelations extends PurchaseOrder {
  suppliers?: { name: string; contact_email?: string | null } | null
  properties?: { name: string; address?: string | null } | null
  jobs?: { title: string } | null
  purchase_order_lines?: PurchaseOrderLine[]
}

export interface InvoiceLine {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  sort_order: number
}

export interface Payment {
  id: string
  invoice_id: string
  amount: number
  payment_method?: string
  reference?: string
  paid_at: string
}

export interface Notification {
  id: string
  user_id: string
  organisation_id: string
  title: string
  message: string
  read: boolean
  notification_type: string
  created_at: string
}

export interface Contract {
  id: string
  organisation_id: string
  client_id: string
  // NOT NULL in the DB (00001_initial_schema.sql).
  title: string
  start_date?: string | null
  end_date?: string | null
  value?: number | null
  services_included?: string
  // Real column is SINGULAR — the DB never had `frequency_commitments` or a
  // `renewal_reminder` boolean (renewals are driven by the notify-renewals cron).
  frequency_commitment?: string
  sla_notes?: string
  status: string
  created_at: string
  updated_at?: string
}

export interface ContractRoutineTemplate {
  id: string
  organisation_id: string
  contract_id: string
  property_id: string
  asset_id?: string | null
  name: string
  maintenance_type: string
  frequency: string
  schedule_mode: 'fixed' | 'rolling'
  starts_at: string
  description?: string | null
  created_at: string
}

// ── Extended types for Supabase join queries ──────────────────────

/** Job with joined property and engineer assignment data */
export interface JobWithRelations extends Job {
  properties?: { name: string; address?: string } | null
  engineer_assignments?: EngineerAssignmentWithProfile[]
  service_reports?: ServiceReport[]
}

/** Engineer assignment with joined profile data */
export interface EngineerAssignmentWithProfile extends EngineerAssignment {
  profiles?: { full_name: string; email?: string } | null
}

/** Quote with joined client, property, and line data */
export interface QuoteWithRelations extends Quote {
  clients?: { name: string } | null
  properties?: { name: string } | null
  quote_lines?: QuoteLine[]
}

/** Invoice with joined client, line, and payment data */
export interface InvoiceWithRelations extends Invoice {
  clients?: { name: string } | null
  invoice_lines?: InvoiceLine[]
  payments?: Payment[]
}

/** Action with joined property and job data */
export interface ActionWithRelations extends Action {
  properties?: { name: string } | null
  jobs?: { title: string; id?: string } | null
}

/** Contract with joined client data */
export interface ContractWithRelations extends Contract {
  clients?: { name: string } | null
}

/** Document with joined property data */
export interface DocumentWithRelations extends Document {
  properties?: { name: string } | null
}

/** Property with joined client data */
export interface PropertyWithRelations extends Property {
  clients?: { name: string } | null
  site_manager?: string
}

/** Compliance item with joined property data */
export interface ComplianceItemWithRelations extends ComplianceItem {
  properties?: { name: string } | null
}

/** Service report with job and profile data */
export interface ServiceReportWithRelations extends ServiceReport {
  jobs?: { title: string; properties?: { name: string } | null } | null
  profiles?: { full_name: string } | null
}

/** User profile for settings/admin views */
export interface UserProfileRow {
  id: string
  full_name: string | null
  email: string
  role: string
}

// ── Engineers & Subcontractors ──────────────────────

export interface Engineer {
  id: string
  organisation_id: string
  profile_id?: string
  name: string
  email?: string
  phone?: string
  trade?: string
  skills?: string[]
  status: 'active' | 'inactive'
  notes?: string
  /** PNG signature used when rendering compliance certificates. */
  signature_image_url?: string | null
  created_at: string
}

export interface EngineerAccreditation {
  id: string
  engineer_id: string
  organisation_id: string
  accreditation_type: string
  registration_number?: string
  qqi_level?: string | null
  issuing_body?: string | null
  issue_date?: string
  expiry_date?: string
  document_url?: string
  status: string
  created_at: string
}

export interface EngineerDocument {
  id: string
  engineer_id: string
  organisation_id: string
  name: string
  document_type: string
  file_url: string
  file_size?: number
  mime_type?: string
  expiry_date?: string
  uploaded_at: string
}

export interface Subcontractor {
  id: string
  organisation_id: string
  company_name: string
  contact_person?: string
  email?: string
  phone?: string
  trade?: string
  status: 'approved' | 'pending' | 'suspended'
  notes?: string
  created_at: string
}

export interface SubcontractorDocument {
  id: string
  subcontractor_id: string
  organisation_id: string
  name: string
  document_type: string
  file_url: string
  file_size?: number
  mime_type?: string
  expiry_date?: string
  uploaded_at: string
}

// ── Subcontractor compliance (00116, trust wave W2-T5) ──────────

export type InsurancePolicyType =
  | 'public_liability'
  | 'employers_liability'
  | 'professional_indemnity'
  | 'contractors_all_risk'
  | 'other'

export type AccreditationScheme =
  | 'ssip'
  | 'chas'
  | 'safecontractor'
  | 'constructionline'
  | 'niceic'
  | 'gas_safe'
  | 'other'

export interface SubcontractorInsurancePolicy {
  id: string
  organisation_id: string
  subcontractor_id: string
  policy_type: InsurancePolicyType
  insurer?: string | null
  policy_number?: string | null
  cover_amount?: number | null
  start_date?: string | null
  expiry_date: string
  subcontractor_document_id?: string | null
  created_at: string
  updated_at: string
}

export interface SubcontractorAccreditation {
  id: string
  organisation_id: string
  subcontractor_id: string
  scheme: AccreditationScheme
  reference?: string | null
  expiry_date?: string | null
  subcontractor_document_id?: string | null
  created_at: string
  updated_at: string
}

export interface SubcontractorRams {
  id: string
  organisation_id: string
  subcontractor_id: string
  job_id?: string | null
  title: string
  subcontractor_document_id?: string | null
  approval_status: 'pending' | 'approved' | 'rejected'
  approved_by?: string | null
  approved_at?: string | null
  valid_until?: string | null
  created_at: string
  updated_at: string
}

export interface SubcontractorComplianceStatus {
  compliant: boolean
  failures: string[]
}

// ── Custom fields (00124) ────────────────────────────────────────

export type CustomFieldEntity =
  | 'client'
  | 'property'
  | 'asset'
  | 'job'
  | 'subcontractor'
  | 'contract'

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean'

export interface CustomFieldDefinition {
  id: string
  organisation_id: string
  entity: CustomFieldEntity
  field_key: string
  label: string
  field_type: CustomFieldType
  options?: string[] | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── Permit-to-work (00121, trust wave W3-T10) ────────────────────

export type PermitType =
  | 'hot_works'
  | 'confined_space'
  | 'working_at_height'
  | 'electrical_isolation'
  | 'roof_access'
  | 'excavation'
  | 'general'

export type PermitStatus = 'requested' | 'issued' | 'active' | 'closed' | 'cancelled' | 'rejected'

export interface Permit {
  id: string
  organisation_id: string
  job_id: string
  property_id: string
  permit_type: PermitType
  status: PermitStatus
  rams_id?: string | null
  requested_by?: string | null
  issued_by?: string | null
  closed_by?: string | null
  issued_at?: string | null
  valid_from?: string | null
  valid_to?: string | null
  closed_at?: string | null
  conditions?: string | null
  created_at: string
  updated_at: string
}

export const PERMIT_TYPE_LABELS: Record<PermitType, string> = {
  hot_works: 'Hot works',
  confined_space: 'Confined space',
  working_at_height: 'Working at height',
  electrical_isolation: 'Electrical isolation',
  roof_access: 'Roof access',
  excavation: 'Excavation',
  general: 'General permit',
}

// ── SLA engine (00117, trust wave W2-T6) ─────────────────────────

export interface ContractSlaPolicy {
  id: string
  organisation_id: string
  contract_id: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  response_minutes: number
  fix_minutes: number
  credit_per_breach: number
  created_at: string
  updated_at: string
}

export interface SlaContractPeriodSummary {
  jobs_total: number
  response_breaches: number
  fix_breaches: number
  credits: number
}

export interface EngineerWithRelations extends Engineer {
  engineer_accreditations?: EngineerAccreditation[]
  engineer_documents?: EngineerDocument[]
}

export interface SubcontractorWithRelations extends Subcontractor {
  subcontractor_documents?: SubcontractorDocument[]
}

export interface ScheduledVisit {
  date: string
  compliance_item_id?: string
  maintenance_plan_id?: string
  label: string
  compliance_type?: string
  frequency: string
  status: 'completed' | 'upcoming' | 'overdue'
  job_id?: string
}

// ── Client Feedback Features ──────────────────────

export interface JobTask {
  id: string
  job_id: string
  organisation_id: string
  description?: string
  outcome?: 'complete' | 'incomplete' | 'revisit'
  visit_details?: string
  is_out_of_hours?: boolean
  completed_at?: string
  created_at: string
}

export interface Note {
  id: string
  organisation_id: string
  property_id?: string
  asset_id?: string
  job_id?: string
  client_id?: string
  content: string
  user_id?: string
  user_name?: string
  created_at: string
}

export interface TravelRecord {
  id: string
  engineer_id: string
  job_id?: string
  organisation_id: string
  from_postcode?: string
  to_postcode?: string
  distance_miles?: number
  travel_time_mins?: number
  travel_date?: string
  created_at: string
}

export interface TravelRecordWithRelations extends TravelRecord {
  jobs?: { title: string } | null
}

export interface Favourite {
  id: string
  user_id: string
  organisation_id: string
  entity_type: 'client' | 'property' | 'asset' | 'job'
  entity_id: string
  created_at: string
}

export interface KBArticle {
  id: string
  organisation_id: string
  title: string
  content: string
  category?: string
  tags?: string[]
  author_id?: string
  author_name?: string
  is_published: boolean
  qa_status?: 'not_reviewed' | 'under_review' | 'approved' | 'rejected'
  qa_reviewed_by?: string
  qa_reviewed_at?: string
  created_at: string
  updated_at: string
}

// ── Compliance certificate forms (V1 #9) ───────────────────────────────
// Engineer-completable checklists per discipline. Answers persist to
// cert_completions.answers (jsonb) keyed by field.key. Shared by web + mobile.
export type CertFieldType = 'pass_fail' | 'text'
export interface CertField {
  key: string
  label: string
  type: CertFieldType
}
export interface CertTemplate {
  key: string
  label: string
  fields: CertField[]
}
export interface CertCompletion {
  id: string
  organisation_id: string
  job_id?: string | null
  asset_id?: string | null
  cert_type: string
  answers: Record<string, string>
  outcome?: 'pass' | 'fail' | 'remedial' | 'n_a' | null
  notes?: string | null
  completed_by?: string | null
  completed_at: string
  created_at: string
}

const FAULTS: CertField = { key: 'faults_found', label: 'Faults / observations', type: 'text' }

export const CERT_FORM_TEMPLATES: CertTemplate[] = [
  {
    key: 'fire_alarm',
    label: 'Fire & Alarm System',
    fields: [
      { key: 'panel_operational', label: 'Control panel operational', type: 'pass_fail' },
      { key: 'zones_tested', label: 'All zones tested', type: 'pass_fail' },
      { key: 'call_points', label: 'Manual call points functional', type: 'pass_fail' },
      { key: 'sounders', label: 'Sounders audible throughout', type: 'pass_fail' },
      { key: 'battery_backup', label: 'Battery / standby supply OK', type: 'pass_fail' },
      FAULTS,
    ],
  },
  {
    key: 'emergency_lighting',
    label: 'Emergency Lighting',
    fields: [
      { key: 'all_luminaires', label: 'All luminaires illuminate on test', type: 'pass_fail' },
      { key: 'duration_test', label: 'Holds full-duration (3hr) test', type: 'pass_fail' },
      { key: 'exit_signs', label: 'Exit signs clear & lit', type: 'pass_fail' },
      { key: 'charge_indicators', label: 'Charge indicators healthy', type: 'pass_fail' },
      FAULTS,
    ],
  },
  {
    key: 'fire_extinguisher',
    label: 'Fire Extinguisher',
    fields: [
      { key: 'correct_type', label: 'Correct type for the risk', type: 'pass_fail' },
      { key: 'pressure_ok', label: 'Gauge in green / pressure OK', type: 'pass_fail' },
      { key: 'seal_intact', label: 'Safety pin & seal intact', type: 'pass_fail' },
      { key: 'mounted_signed', label: 'Correctly mounted & signed', type: 'pass_fail' },
      { key: 'service_label', label: 'Service label up to date', type: 'pass_fail' },
      FAULTS,
    ],
  },
  {
    key: 'access_control',
    label: 'Access Control',
    fields: [
      { key: 'readers_working', label: 'All readers operational', type: 'pass_fail' },
      { key: 'fire_release', label: 'Door release on fire alarm', type: 'pass_fail' },
      { key: 'rex_buttons', label: 'Request-to-exit buttons work', type: 'pass_fail' },
      { key: 'backup_power', label: 'Backup power tested', type: 'pass_fail' },
      FAULTS,
    ],
  },
  // ── UK statutory cert library (Wave 3 / W3-T12) ──────────────────────
  // Readings are captured in text fields — the renderer supports only
  // pass_fail | text by design (both apps + both test suites enforce it).
  {
    key: 'eicr',
    label: 'EICR (BS 7671)',
    fields: [
      { key: 'consumer_unit', label: 'Consumer unit / distribution board condition OK', type: 'pass_fail' },
      { key: 'rcd_test', label: 'RCD operation within limits', type: 'pass_fail' },
      { key: 'earthing_bonding', label: 'Earthing & bonding adequate', type: 'pass_fail' },
      { key: 'no_c1_c2', label: 'No C1 / C2 observations', type: 'pass_fail' },
      { key: 'observation_codes', label: 'Observations (C1/C2/C3/FI with details)', type: 'text' },
      { key: 'circuits_tested', label: 'Circuits tested', type: 'text' },
      FAULTS,
    ],
  },
  {
    key: 'fire_alarm_weekly',
    label: 'Fire Alarm Weekly Test (BS 5839)',
    fields: [
      { key: 'call_point_tested', label: 'Manual call point tested (rotate weekly)', type: 'pass_fail' },
      { key: 'zone_indicated', label: 'Correct zone indicated at panel', type: 'pass_fail' },
      { key: 'sounders_heard', label: 'Sounders heard throughout', type: 'pass_fail' },
      { key: 'log_book_updated', label: 'Fire log book updated', type: 'pass_fail' },
      { key: 'call_point_location', label: 'Call point location tested', type: 'text' },
      FAULTS,
    ],
  },
  {
    key: 'fire_alarm_quarterly',
    label: 'Fire Alarm Quarterly Service (BS 5839)',
    fields: [
      { key: 'panel_healthy', label: 'Panel healthy — no faults displayed', type: 'pass_fail' },
      { key: 'batteries_standby', label: 'Batteries / standby supply tested', type: 'pass_fail' },
      { key: 'devices_tested_pct', label: '% of devices tested this visit', type: 'text' },
      { key: 'false_alarm_review', label: 'False alarm record reviewed', type: 'pass_fail' },
      FAULTS,
    ],
  },
  {
    key: 'gas_safety_cp12',
    label: 'Gas Safety Record CP12 (Gas Safe)',
    fields: [
      { key: 'appliance_safe', label: 'Appliance safe to use', type: 'pass_fail' },
      { key: 'flue_flow', label: 'Flue flow & spillage tests pass', type: 'pass_fail' },
      { key: 'ventilation', label: 'Ventilation provision adequate', type: 'pass_fail' },
      { key: 'operating_pressure', label: 'Operating pressure / heat input', type: 'text' },
      { key: 'gas_safe_number', label: 'Engineer Gas Safe reg. number', type: 'text' },
      FAULTS,
    ],
  },
  {
    key: 'loler',
    label: 'LOLER Lifting Equipment',
    fields: [
      { key: 'swl_marked', label: 'SWL clearly marked', type: 'pass_fail' },
      { key: 'defect_examination', label: 'No defects affecting safe operation', type: 'pass_fail' },
      { key: 'safety_devices', label: 'Safety devices functional', type: 'pass_fail' },
      { key: 'next_examination', label: 'Next thorough examination due', type: 'text' },
      FAULTS,
    ],
  },
  {
    key: 'legionella_monthly',
    label: 'Legionella Monthly Checks (ACoP L8)',
    fields: [
      { key: 'sentinel_hot', label: 'Sentinel hot outlets ≥ 50°C', type: 'pass_fail' },
      { key: 'sentinel_cold', label: 'Sentinel cold outlets ≤ 20°C', type: 'pass_fail' },
      { key: 'recorded_temps', label: 'Recorded temperatures (outlet: °C)', type: 'text' },
      { key: 'outlets_flushed', label: 'Infrequently-used outlets flushed', type: 'pass_fail' },
      FAULTS,
    ],
  },
  {
    key: 'legionella_quarterly',
    label: 'Legionella Quarterly (ACoP L8)',
    fields: [
      { key: 'shower_heads', label: 'Shower heads cleaned & descaled', type: 'pass_fail' },
      { key: 'tmv_checks', label: 'TMV fail-safe checks pass', type: 'pass_fail' },
      { key: 'monthly_records', label: 'Monthly temperature records reviewed', type: 'pass_fail' },
      FAULTS,
    ],
  },
]

export const CERT_TEMPLATE_BY_KEY: Record<string, CertTemplate> = Object.fromEntries(
  CERT_FORM_TEMPLATES.map((t) => [t.key, t]),
)

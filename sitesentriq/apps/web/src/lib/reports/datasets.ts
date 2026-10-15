/**
 * Custom Report Builder — Dataset definitions
 * Each dataset maps to a Supabase table and exposes a list of fields
 * that the user can drag into Filters / Columns / Sort / Group zones.
 */

export type FieldType = 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'relation' | 'enum'

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'in'
  | 'not_in'
  | 'between'
  | 'before'
  | 'after'
  | 'gte'
  | 'lte'
  | 'is_null'
  | 'is_not_null'

export interface DatasetField {
  /** Column name in the Supabase table. May contain a `:` for a related select (eg `properties:property_id(name)`). */
  key: string
  /** Display label shown in the builder. */
  label: string
  type: FieldType
  /** Operators supported when this field is dropped into the Filters zone. */
  filter_operators: FilterOperator[]
  /** Optional: if `type === 'relation'`, the related table & display column. */
  relation?: { table: string; display: string }
  /** Optional: if `type === 'enum'`, the allowed values. */
  enum_values?: string[]
}

export interface Dataset {
  /** Stable identifier — what gets stored in `report_templates.dataset`. */
  key: string
  label: string
  description: string
  /** Supabase table name. */
  table: string
  /** RBAC permission required to read this dataset. */
  permission: string
  fields: DatasetField[]
}

const TEXT_OPS: FilterOperator[] = ['equals', 'not_equals', 'contains', 'in', 'is_null', 'is_not_null']
const NUM_OPS: FilterOperator[] = ['equals', 'not_equals', 'gte', 'lte', 'between', 'is_null', 'is_not_null']
const DATE_OPS: FilterOperator[] = ['equals', 'before', 'after', 'between', 'is_null', 'is_not_null']
const ENUM_OPS: FilterOperator[] = ['equals', 'not_equals', 'in', 'not_in']
const BOOL_OPS: FilterOperator[] = ['equals']

export const DATASETS: Dataset[] = [
  {
    key: 'jobs',
    label: 'Jobs',
    description: 'Scheduled and completed work orders',
    table: 'jobs',
    permission: 'jobs:read',
    fields: [
      { key: 'title', label: 'Title', type: 'text', filter_operators: TEXT_OPS },
      { key: 'description', label: 'Description', type: 'text', filter_operators: TEXT_OPS },
      { key: 'status', label: 'Status', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['scheduled', 'due', 'in_progress', 'completed', 'incomplete', 'failed_access', 'revisit', 'cancelled'] },
      { key: 'priority', label: 'Priority', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['low', 'medium', 'high', 'urgent', 'critical'] },
      { key: 'sla_priority', label: 'SLA priority', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] },
      { key: 'job_type', label: 'Job type', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['reactive', 'ppm', 'service'] },
      { key: 'scheduled_date', label: 'Scheduled date', type: 'datetime', filter_operators: DATE_OPS },
      { key: 'completed_date', label: 'Completed date', type: 'datetime', filter_operators: DATE_OPS },
      { key: 'is_out_of_hours', label: 'Out of hours', type: 'boolean', filter_operators: BOOL_OPS },
      { key: 'created_at', label: 'Created at', type: 'datetime', filter_operators: DATE_OPS },
      { key: 'property_id', label: 'Property', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'properties', display: 'name' } },
    ],
  },
  {
    key: 'compliance_items',
    label: 'Compliance Items',
    description: 'Compliance obligations against properties and assets',
    table: 'compliance_items',
    permission: 'compliance:read',
    fields: [
      { key: 'name', label: 'Name', type: 'text', filter_operators: TEXT_OPS },
      { key: 'compliance_type', label: 'Compliance type', type: 'text', filter_operators: TEXT_OPS },
      { key: 'frequency', label: 'Frequency', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['daily', 'weekly', 'monthly', 'quarterly', 'six_monthly', 'annual'] },
      { key: 'status', label: 'Status', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['compliant', 'due_soon', 'overdue', 'non_compliant'] },
      { key: 'last_completed', label: 'Last completed', type: 'datetime', filter_operators: DATE_OPS },
      { key: 'next_due', label: 'Next due', type: 'datetime', filter_operators: DATE_OPS },
      { key: 'property_id', label: 'Property', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'properties', display: 'name' } },
      { key: 'asset_id', label: 'Asset', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'assets', display: 'name' } },
      { key: 'created_at', label: 'Created at', type: 'datetime', filter_operators: DATE_OPS },
    ],
  },
  {
    key: 'properties',
    label: 'Properties',
    description: 'Sites managed in the platform',
    table: 'properties',
    permission: 'properties:read',
    fields: [
      { key: 'name', label: 'Name', type: 'text', filter_operators: TEXT_OPS },
      { key: 'address', label: 'Address', type: 'text', filter_operators: TEXT_OPS },
      { key: 'site_type', label: 'Site type', type: 'text', filter_operators: TEXT_OPS },
      { key: 'client_id', label: 'Client', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'clients', display: 'name' } },
      { key: 'archived_at', label: 'Archived at', type: 'datetime', filter_operators: DATE_OPS },
      { key: 'created_at', label: 'Created at', type: 'datetime', filter_operators: DATE_OPS },
    ],
  },
  {
    key: 'engineers',
    label: 'Engineers',
    description: 'Field engineers and technicians',
    table: 'engineers',
    permission: 'users:read',
    fields: [
      { key: 'name', label: 'Name', type: 'text', filter_operators: TEXT_OPS },
      { key: 'email', label: 'Email', type: 'text', filter_operators: TEXT_OPS },
      // Real engineers columns are `trade` + `status` (the previous engineer_type /
      // is_active never existed → PostgREST 400 broke the whole report).
      { key: 'trade', label: 'Trade', type: 'text', filter_operators: TEXT_OPS },
      { key: 'status', label: 'Status', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['active', 'inactive'] },
      { key: 'created_at', label: 'Created at', type: 'datetime', filter_operators: DATE_OPS },
    ],
  },
  {
    key: 'invoices',
    label: 'Invoices',
    description: 'Issued and outstanding invoices',
    table: 'invoices',
    permission: 'invoices:read',
    fields: [
      { key: 'invoice_number', label: 'Invoice number', type: 'text', filter_operators: TEXT_OPS },
      { key: 'status', label: 'Status', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['draft', 'sent', 'paid', 'overdue', 'cancelled', 'partially_paid'] },
      { key: 'subtotal', label: 'Subtotal', type: 'number', filter_operators: NUM_OPS },
      { key: 'tax', label: 'Tax', type: 'number', filter_operators: NUM_OPS },
      { key: 'total', label: 'Total', type: 'number', filter_operators: NUM_OPS },
      { key: 'due_date', label: 'Due date', type: 'date', filter_operators: DATE_OPS },
      { key: 'paid_date', label: 'Paid date', type: 'date', filter_operators: DATE_OPS },
      { key: 'client_id', label: 'Client', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'clients', display: 'name' } },
      { key: 'created_at', label: 'Created at', type: 'datetime', filter_operators: DATE_OPS },
    ],
  },
  {
    key: 'quotes',
    label: 'Quotes',
    description: 'Sales quotes issued to clients',
    table: 'quotes',
    permission: 'quotes:read',
    fields: [
      { key: 'quote_number', label: 'Quote number', type: 'text', filter_operators: TEXT_OPS },
      { key: 'status', label: 'Status', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['draft', 'sent', 'approved', 'rejected', 'expired', 'converted'] },
      { key: 'quote_type', label: 'Quote type', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['service_quote', 'defect_quote'] },
      { key: 'subtotal', label: 'Subtotal', type: 'number', filter_operators: NUM_OPS },
      { key: 'total', label: 'Total', type: 'number', filter_operators: NUM_OPS },
      { key: 'valid_until', label: 'Valid until', type: 'date', filter_operators: DATE_OPS },
      { key: 'client_id', label: 'Client', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'clients', display: 'name' } },
      { key: 'created_at', label: 'Created at', type: 'datetime', filter_operators: DATE_OPS },
    ],
  },
  {
    key: 'actions',
    label: 'Actions / Defects',
    description: 'Defects, follow-ups and remediation tasks',
    table: 'actions',
    permission: 'compliance:read',
    fields: [
      { key: 'title', label: 'Title', type: 'text', filter_operators: TEXT_OPS },
      { key: 'description', label: 'Description', type: 'text', filter_operators: TEXT_OPS },
      { key: 'status', label: 'Status', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['open', 'in_progress', 'resolved', 'closed'] },
      { key: 'priority', label: 'Priority', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['low', 'medium', 'high', 'urgent', 'critical'] },
      { key: 'due_date', label: 'Due date', type: 'date', filter_operators: DATE_OPS },
      { key: 'property_id', label: 'Property', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'properties', display: 'name' } },
      { key: 'created_at', label: 'Created at', type: 'datetime', filter_operators: DATE_OPS },
    ],
  },
  {
    // Registers the dataset the seeded "PPM due in next 30 days" built-in report
    // points at — without it that template opened to "Unknown dataset".
    key: 'maintenance_plans',
    label: 'PPM / Maintenance Plans',
    description: 'Planned preventative maintenance schedules',
    table: 'maintenance_plans',
    permission: 'compliance:read',
    fields: [
      { key: 'name', label: 'Plan name', type: 'text', filter_operators: TEXT_OPS },
      { key: 'frequency', label: 'Frequency', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['daily', 'weekly', 'monthly', 'quarterly', 'six_monthly', 'annual'] },
      { key: 'maintenance_category', label: 'Category', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['routine', 'reactive', 'statutory', 'other'] },
      { key: 'schedule_mode', label: 'Schedule mode', type: 'enum', filter_operators: ENUM_OPS, enum_values: ['fixed', 'rolling'] },
      { key: 'next_due', label: 'Next due', type: 'date', filter_operators: DATE_OPS },
      { key: 'last_completed', label: 'Last completed', type: 'date', filter_operators: DATE_OPS },
      { key: 'is_active', label: 'Active', type: 'boolean', filter_operators: BOOL_OPS },
      { key: 'property_id', label: 'Property', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'properties', display: 'name' } },
      { key: 'created_at', label: 'Created at', type: 'datetime', filter_operators: DATE_OPS },
    ],
  },
  {
    key: 'audit_log',
    label: 'Audit Log',
    description: 'System events and entity changes (timeline)',
    table: 'timeline_events',
    permission: 'reports:read',
    fields: [
      { key: 'event_type', label: 'Event type', type: 'text', filter_operators: TEXT_OPS },
      { key: 'description', label: 'Description', type: 'text', filter_operators: TEXT_OPS },
      { key: 'property_id', label: 'Property', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'properties', display: 'name' } },
      { key: 'client_id', label: 'Client', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'clients', display: 'name' } },
      { key: 'job_id', label: 'Job', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'jobs', display: 'title' } },
      { key: 'user_id', label: 'User', type: 'relation', filter_operators: TEXT_OPS, relation: { table: 'profiles', display: 'full_name' } },
      { key: 'created_at', label: 'Created at', type: 'datetime', filter_operators: DATE_OPS },
    ],
  },
]

export function getDataset(key: string): Dataset | undefined {
  return DATASETS.find((d) => d.key === key)
}

export function getField(datasetKey: string, fieldKey: string): DatasetField | undefined {
  return getDataset(datasetKey)?.fields.find((f) => f.key === fieldKey)
}

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  contains: 'contains',
  in: 'is in (comma list)',
  not_in: 'is not in (comma list)',
  between: 'is between',
  before: 'is before',
  after: 'is after',
  gte: '≥',
  lte: '≤',
  is_null: 'is empty',
  is_not_null: 'is not empty',
}

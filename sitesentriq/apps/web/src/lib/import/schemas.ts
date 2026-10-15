/**
 * Field schemas for bulk-import-able entities.
 *
 * Each entity defines:
 *  - the database fields users can populate from CSV
 *  - per-field validation + transform
 *  - "match hints" for the auto-mapping fuzzy match (`./match.ts`)
 */

export type ImportEntity =
  | 'clients'
  | 'properties'
  | 'assets'
  | 'engineers'
  | 'compliance_items'
  | 'contracts'
  | 'subcontractors'
  | 'maintenance_plans'

export interface FieldSpec {
  /** DB column key. Some are virtual (`client_name`, `property_name`) — resolved via FK lookup. */
  key: string
  label: string
  required: boolean
  /** Returns error string if invalid, null otherwise. */
  validate?: (value: string, row: Record<string, string>) => string | null
  /** Convert raw CSV string to DB value. Empty inputs return null/undefined. */
  transform?: (value: string) => unknown
  /** Used for fuzzy auto-mapping. Lowercase/alphanum-normalised at match time. */
  matchHints: string[]
  /** Optional human hint shown next to the field in the mapping UI. */
  helperText?: string
}

export interface EntitySchema {
  entity: ImportEntity
  label: string
  description: string
  /** Visual emoji-free icon name from lucide. Resolved at render time. */
  icon: 'Users' | 'Building2' | 'Package' | 'HardHat' | 'ShieldCheck' | 'FileText' | 'Wrench'
  /** All fields available for mapping. Order = display order in mapping UI. */
  fields: FieldSpec[]
  /** Path users see imported records at, e.g. `/dashboard/clients`. */
  viewPath: string
  /** "Foreign-key" virtual fields whose values are looked up by name → id. */
  fkLookups?: { fieldKey: string; targetEntity: ImportEntity; targetIdField: string }[]
}

// ── Validators (small set, reused) ───────────────────────────────────────────

const trim = (v: string) => (v ?? '').trim()
const required = (label: string) => (v: string) => (trim(v) ? null : `${label} is required`)
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ukPostcodeRe = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i
const validEmail = (label = 'Email') => (v: string) => {
  const s = trim(v)
  if (!s) return null
  return emailRe.test(s) ? null : `${label} not a valid email`
}
const validNumber = (label: string) => (v: string) => {
  const s = trim(v)
  if (!s) return null
  return isNaN(Number(s)) ? `${label} not a number` : null
}
const validDate = (label: string) => (v: string) => {
  const s = trim(v)
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? `${label} not a valid date (use YYYY-MM-DD)` : null
}
const validPostcode = (v: string) => {
  const s = trim(v)
  if (!s) return null
  return ukPostcodeRe.test(s) ? null : 'Postcode invalid format (e.g. SW1A 1AA)'
}
const oneOf = (label: string, opts: readonly string[]) => (v: string) => {
  const s = trim(v).toLowerCase().replace(/\s+/g, '_')
  if (!s) return null
  return opts.includes(s) ? null : `${label} must be one of: ${opts.join(', ')}`
}

const toLower = (v: string) => trim(v).toLowerCase() || null
const toBool = (v: string): boolean => ['yes', 'true', '1', 'y', 'active'].includes(trim(v).toLowerCase())
const toStringOrNull = (v: string) => (trim(v) ? trim(v) : null)
const toNumberOrNull = (v: string) => {
  const s = trim(v)
  if (!s) return null
  const n = Number(s)
  return isNaN(n) ? null : n
}
const toIsoDateOrNull = (v: string) => {
  const s = trim(v)
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
const toIsoTimestampOrNull = (v: string) => {
  const s = trim(v)
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}
const toCommaArray = (v: string) => {
  const s = trim(v)
  if (!s) return null
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

// ── Allowed value sets (mirrored from DB CHECK constraints) ──────────────────

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'six_monthly', 'annual'] as const

// ── Schemas ──────────────────────────────────────────────────────────────────

const clientsSchema: EntitySchema = {
  entity: 'clients',
  label: 'Clients',
  description: 'Companies you do work for.',
  icon: 'Users',
  viewPath: '/dashboard/clients',
  fields: [
    {
      key: 'name', label: 'Name', required: true,
      validate: required('Name'),
      transform: toStringOrNull,
      matchHints: ['name', 'client', 'client name', 'company', 'company name', 'organisation', 'organization'],
    },
    {
      key: 'contact_email', label: 'Contact email', required: false,
      validate: validEmail('Contact email'),
      transform: toLower,
      matchHints: ['email', 'contact email', 'e-mail', 'mail'],
    },
    {
      key: 'contact_phone', label: 'Contact phone', required: false,
      transform: toStringOrNull,
      matchHints: ['phone', 'contact phone', 'tel', 'telephone', 'mobile'],
    },
    {
      key: 'address', label: 'Address', required: false,
      transform: toStringOrNull,
      matchHints: ['address', 'street', 'location', 'postal address'],
    },
    {
      key: 'notes', label: 'Notes', required: false,
      transform: toStringOrNull,
      matchHints: ['notes', 'comments', 'description'],
    },
  ],
}

const propertiesSchema: EntitySchema = {
  entity: 'properties',
  label: 'Properties',
  description: 'Sites/buildings under management.',
  icon: 'Building2',
  viewPath: '/dashboard/properties',
  fkLookups: [{ fieldKey: 'client_name', targetEntity: 'clients', targetIdField: 'client_id' }],
  fields: [
    {
      key: 'name', label: 'Name', required: true,
      validate: required('Name'),
      transform: toStringOrNull,
      matchHints: ['name', 'property name', 'site', 'site name', 'building', 'building name'],
    },
    {
      key: 'client_name', label: 'Client name', required: true,
      validate: required('Client name'),
      transform: toStringOrNull,
      helperText: 'Must match an existing client by name.',
      matchHints: ['client', 'client name', 'company', 'customer'],
    },
    {
      key: 'address', label: 'Address', required: false,
      transform: toStringOrNull,
      matchHints: ['address', 'street', 'address line 1'],
    },
    {
      key: 'postcode', label: 'Postcode', required: false,
      validate: validPostcode,
      transform: (v) => (trim(v) ? trim(v).toUpperCase() : null),
      helperText: 'UK format (e.g. SW1A 1AA).',
      matchHints: ['postcode', 'post code', 'zip', 'zipcode', 'postal code'],
    },
    {
      key: 'city', label: 'City / Town', required: false,
      transform: toStringOrNull,
      matchHints: ['city', 'town', 'locality'],
    },
    {
      key: 'latitude', label: 'Latitude', required: false,
      validate: validNumber('Latitude'),
      transform: toNumberOrNull,
      matchHints: ['latitude', 'lat'],
    },
    {
      key: 'longitude', label: 'Longitude', required: false,
      validate: validNumber('Longitude'),
      transform: toNumberOrNull,
      matchHints: ['longitude', 'long', 'lng', 'lon'],
    },
    {
      key: 'property_type', label: 'Property type', required: false,
      transform: toStringOrNull,
      helperText: 'Free text — e.g. Office, Retail, Warehouse.',
      matchHints: ['type', 'property type', 'site type', 'category', 'building type'],
    },
    {
      key: 'access_notes', label: 'Notes', required: false,
      transform: toStringOrNull,
      matchHints: ['notes', 'comments', 'access notes', 'description'],
    },
  ],
}

const assetsSchema: EntitySchema = {
  entity: 'assets',
  label: 'Assets',
  description: 'Equipment tracked at properties.',
  icon: 'Package',
  viewPath: '/dashboard/assets',
  fkLookups: [{ fieldKey: 'property_name', targetEntity: 'properties', targetIdField: 'property_id' }],
  fields: [
    {
      key: 'name', label: 'Name', required: true,
      validate: required('Name'),
      transform: toStringOrNull,
      matchHints: ['name', 'asset name', 'asset', 'equipment', 'item'],
    },
    {
      key: 'property_name', label: 'Property name', required: true,
      validate: required('Property name'),
      transform: toStringOrNull,
      helperText: 'Must match an existing property by name.',
      matchHints: ['property', 'property name', 'site', 'site name', 'location'],
    },
    {
      key: 'category', label: 'Category', required: false,
      transform: (v) => (trim(v) ? trim(v) : 'Equipment'),
      matchHints: ['category', 'type', 'asset type', 'class'],
    },
    {
      key: 'make', label: 'Manufacturer', required: false,
      transform: toStringOrNull,
      matchHints: ['manufacturer', 'make', 'brand', 'oem'],
    },
    {
      key: 'model', label: 'Model', required: false,
      transform: toStringOrNull,
      matchHints: ['model', 'model number', 'model no'],
    },
    {
      key: 'serial_number', label: 'Serial number', required: false,
      transform: toStringOrNull,
      matchHints: ['serial', 'serial number', 'serial no', 's/n', 'sn'],
    },
    {
      key: 'install_date', label: 'Install date', required: false,
      validate: validDate('Install date'),
      transform: toIsoDateOrNull,
      helperText: 'YYYY-MM-DD',
      matchHints: ['install date', 'installed', 'installation date', 'commissioned'],
    },
    {
      key: 'location', label: 'Location', required: false,
      transform: toStringOrNull,
      helperText: 'Free-text location within the property (stored in notes).',
      matchHints: ['location', 'area', 'room', 'floor', 'zone'],
    },
    {
      key: 'notes', label: 'Notes', required: false,
      transform: toStringOrNull,
      matchHints: ['notes', 'comments', 'description'],
    },
  ],
}

const engineersSchema: EntitySchema = {
  entity: 'engineers',
  label: 'Engineers',
  description: 'Field staff records (auth invites are separate).',
  icon: 'HardHat',
  viewPath: '/dashboard/engineers',
  fields: [
    {
      key: 'name', label: 'Name', required: true,
      validate: required('Name'),
      transform: toStringOrNull,
      matchHints: ['name', 'full name', 'engineer name', 'first last'],
    },
    {
      key: 'email', label: 'Email', required: true,
      validate: (v) => required('Email')(v) ?? validEmail('Email')(v),
      transform: toLower,
      matchHints: ['email', 'e-mail', 'contact email', 'mail'],
    },
    {
      key: 'phone', label: 'Phone', required: false,
      transform: toStringOrNull,
      matchHints: ['phone', 'mobile', 'tel', 'telephone', 'contact phone'],
    },
    {
      key: 'trade', label: 'Trade', required: false,
      transform: toStringOrNull,
      helperText: 'e.g. Plumber, Electrician, HVAC',
      matchHints: ['trade', 'role', 'discipline', 'speciality', 'specialty'],
    },
    {
      key: 'skills', label: 'Skills', required: false,
      transform: toCommaArray,
      helperText: 'Comma-separated, e.g. "gas safe, electrical"',
      matchHints: ['skills', 'tags', 'competencies', 'capabilities'],
    },
    {
      key: 'home_postcode', label: 'Home postcode', required: false,
      validate: validPostcode,
      transform: (v) => (trim(v) ? trim(v).toUpperCase() : null),
      matchHints: ['home postcode', 'postcode', 'home post code', 'base postcode'],
    },
    {
      key: 'weekly_capacity_hours', label: 'Weekly capacity (hours)', required: false,
      validate: validNumber('Weekly capacity'),
      transform: (v) => {
        const n = toNumberOrNull(v)
        return n == null ? 40 : n
      },
      matchHints: ['weekly capacity', 'hours per week', 'capacity', 'weekly hours'],
    },
  ],
}

const complianceSchema: EntitySchema = {
  entity: 'compliance_items',
  label: 'Compliance items',
  description: 'Recurring compliance tasks tied to assets.',
  icon: 'ShieldCheck',
  viewPath: '/dashboard/compliance',
  fkLookups: [
    { fieldKey: 'property_name', targetEntity: 'properties', targetIdField: 'property_id' },
    { fieldKey: 'asset_name', targetEntity: 'assets', targetIdField: 'asset_id' },
  ],
  fields: [
    {
      key: 'asset_name', label: 'Asset name', required: true,
      validate: required('Asset name'),
      transform: toStringOrNull,
      helperText: 'Must match an existing asset by name.',
      matchHints: ['asset', 'asset name', 'equipment'],
    },
    {
      key: 'property_name', label: 'Property name', required: true,
      validate: required('Property name'),
      transform: toStringOrNull,
      helperText: 'Must match an existing property by name.',
      matchHints: ['property', 'property name', 'site', 'site name'],
    },
    {
      key: 'name', label: 'Item name', required: false,
      transform: toStringOrNull,
      helperText: 'Defaults to the type if blank.',
      matchHints: ['name', 'item name', 'check name', 'inspection name'],
    },
    {
      key: 'compliance_type', label: 'Type', required: true,
      validate: required('Type'),
      transform: toStringOrNull,
      helperText: 'e.g. Gas Safety, Fire Risk, EICR',
      matchHints: ['type', 'compliance type', 'category', 'check type', 'inspection type'],
    },
    {
      key: 'frequency', label: 'Frequency', required: true,
      validate: (v) => required('Frequency')(v) ?? oneOf('Frequency', FREQUENCIES)(v),
      transform: (v) => trim(v).toLowerCase().replace(/\s+/g, '_') || null,
      helperText: FREQUENCIES.join(', '),
      matchHints: ['frequency', 'recurrence', 'cadence', 'interval'],
    },
    {
      key: 'last_completed', label: 'Last inspection date', required: false,
      validate: validDate('Last inspection date'),
      transform: toIsoTimestampOrNull,
      matchHints: ['last inspection', 'last inspection date', 'last completed', 'last done', 'last check'],
    },
    {
      key: 'next_due', label: 'Next due date', required: false,
      validate: validDate('Next due date'),
      transform: toIsoTimestampOrNull,
      matchHints: ['next due', 'next due date', 'next inspection', 'due date', 'due'],
    },
    {
      key: 'notes', label: 'Notes', required: false,
      transform: toStringOrNull,
      matchHints: ['notes', 'comments', 'description'],
    },
  ],
}

const contractsSchema: EntitySchema = {
  entity: 'contracts',
  label: 'Contracts',
  description: 'Service agreements with clients.',
  icon: 'FileText',
  viewPath: '/dashboard/contracts',
  fkLookups: [{ fieldKey: 'client_name', targetEntity: 'clients', targetIdField: 'client_id' }],
  fields: [
    {
      key: 'title', label: 'Title', required: true,
      validate: required('Title'), transform: toStringOrNull,
      matchHints: ['title', 'name', 'contract', 'contract name', 'agreement'],
    },
    {
      key: 'client_name', label: 'Client name', required: true,
      validate: required('Client name'), transform: toStringOrNull,
      helperText: 'Must match an existing client by name.',
      matchHints: ['client', 'client name', 'customer', 'account'],
    },
    {
      key: 'start_date', label: 'Start date', required: false,
      validate: validDate('Start date'), transform: toIsoDateOrNull,
      helperText: 'YYYY-MM-DD', matchHints: ['start', 'start date', 'from', 'commencement'],
    },
    {
      key: 'end_date', label: 'End date', required: false,
      validate: validDate('End date'), transform: toIsoDateOrNull,
      helperText: 'YYYY-MM-DD', matchHints: ['end', 'end date', 'to', 'expiry', 'renewal'],
    },
    {
      key: 'value', label: 'Value (£)', required: false,
      validate: validNumber('Value'), transform: toNumberOrNull,
      matchHints: ['value', 'amount', 'annual value', 'contract value', 'price'],
    },
    {
      key: 'services_included', label: 'Services included', required: false,
      transform: toStringOrNull, matchHints: ['services', 'scope', 'services included', 'description'],
    },
    {
      key: 'status', label: 'Status', required: false,
      validate: oneOf('Status', ['draft', 'active', 'expired', 'cancelled']),
      transform: (v) => toLower(v) ?? 'active',
      helperText: 'draft / active / expired / cancelled (default active).',
      matchHints: ['status', 'state'],
    },
  ],
}

const subcontractorsSchema: EntitySchema = {
  entity: 'subcontractors',
  label: 'Subcontractors',
  description: 'External contractors you assign work to.',
  icon: 'HardHat',
  viewPath: '/dashboard/subcontractors',
  fields: [
    {
      key: 'company_name', label: 'Company name', required: true,
      validate: required('Company name'), transform: toStringOrNull,
      matchHints: ['company', 'company name', 'name', 'contractor', 'firm'],
    },
    {
      key: 'contact_person', label: 'Contact person', required: false,
      transform: toStringOrNull, matchHints: ['contact', 'contact person', 'contact name', 'representative'],
    },
    {
      key: 'email', label: 'Email', required: false,
      validate: validEmail('Email'), transform: toLower,
      matchHints: ['email', 'e-mail', 'contact email'],
    },
    {
      key: 'phone', label: 'Phone', required: false,
      transform: toStringOrNull, matchHints: ['phone', 'tel', 'telephone', 'mobile', 'contact number'],
    },
    {
      key: 'trade', label: 'Trade', required: false,
      transform: toStringOrNull, matchHints: ['trade', 'discipline', 'speciality', 'specialty', 'service'],
    },
    {
      key: 'status', label: 'Status', required: false,
      validate: oneOf('Status', ['approved', 'pending', 'suspended']),
      transform: (v) => toLower(v) ?? 'pending',
      helperText: 'approved / pending / suspended (default pending).',
      matchHints: ['status', 'state', 'approval'],
    },
  ],
}

const maintenancePlansSchema: EntitySchema = {
  entity: 'maintenance_plans',
  label: 'Maintenance plans',
  description: 'Planned (PPM) schedules at properties.',
  icon: 'Wrench',
  viewPath: '/dashboard/maintenance',
  fkLookups: [{ fieldKey: 'property_name', targetEntity: 'properties', targetIdField: 'property_id' }],
  fields: [
    {
      key: 'name', label: 'Name', required: true,
      validate: required('Name'), transform: toStringOrNull,
      matchHints: ['name', 'plan', 'plan name', 'task', 'service'],
    },
    {
      key: 'property_name', label: 'Property name', required: true,
      validate: required('Property name'), transform: toStringOrNull,
      helperText: 'Must match an existing property by name.',
      matchHints: ['property', 'property name', 'site', 'location'],
    },
    {
      key: 'frequency', label: 'Frequency', required: true,
      validate: oneOf('Frequency', ['daily', 'weekly', 'monthly', 'quarterly', 'six_monthly', 'annual']),
      // Match the validator's normalisation ("Six Monthly" -> "six_monthly"),
      // else a space-containing value passes preview but fails the DB CHECK
      // and kills the whole insert chunk.
      transform: (v) => trim(v).toLowerCase().replace(/\s+/g, '_') || null,
      helperText: 'daily / weekly / monthly / quarterly / six_monthly / annual.',
      matchHints: ['frequency', 'interval', 'recurrence', 'schedule', 'cycle'],
    },
    {
      key: 'schedule_mode', label: 'Schedule mode', required: false,
      validate: oneOf('Schedule mode', ['fixed', 'rolling']),
      transform: (v) => toLower(v) ?? 'fixed',
      helperText: 'fixed (calendar) or rolling (from completion). Default fixed.',
      matchHints: ['schedule mode', 'mode', 'fixed', 'rolling'],
    },
    {
      key: 'maintenance_type', label: 'Type', required: false,
      transform: (v) => (trim(v) ? trim(v) : 'Service'),
      matchHints: ['type', 'maintenance type', 'category'],
    },
    {
      key: 'next_due', label: 'Next due', required: false,
      validate: validDate('Next due'), transform: toIsoDateOrNull,
      helperText: 'YYYY-MM-DD', matchHints: ['next due', 'due', 'next service', 'due date'],
    },
    {
      key: 'sfg20_schedule_ref', label: 'SFG20 reference', required: false,
      transform: toStringOrNull,
      helperText: 'Your SFG20 schedule reference (optional).',
      matchHints: ['sfg20', 'sfg20 ref', 'sfg20 reference', 'schedule ref'],
    },
    {
      key: 'sfg20_aligned', label: 'SFG20 aligned', required: false,
      transform: toBool,
      helperText: 'yes / true / 1 to mark SFG20-aligned.',
      matchHints: ['sfg20 aligned', 'sfg20', 'aligned'],
    },
    {
      key: 'description', label: 'Description', required: false,
      transform: toStringOrNull, matchHints: ['description', 'notes', 'detail'],
    },
  ],
}

export const SCHEMAS: Record<ImportEntity, EntitySchema> = {
  clients: clientsSchema,
  properties: propertiesSchema,
  assets: assetsSchema,
  engineers: engineersSchema,
  compliance_items: complianceSchema,
  contracts: contractsSchema,
  subcontractors: subcontractorsSchema,
  maintenance_plans: maintenancePlansSchema,
}

export const ENTITY_LIST: ImportEntity[] = [
  'clients',
  'properties',
  'assets',
  'engineers',
  'compliance_items',
  'contracts',
  'subcontractors',
  'maintenance_plans',
]

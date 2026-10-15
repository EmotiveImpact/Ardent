import { Fragment } from 'react'
import { Chip } from '@haumea/ui'
import { AppCard, PageHeader } from '@haumea/ui'
import { Shield, Check, X, Info } from 'lucide-react'

type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

const ROLES = [
  { id: 'super_admin', name: 'Super Admin', description: 'Full system access including multi-tenant management' },
  { id: 'org_admin', name: 'Admin', description: 'Full access to all organisation features and settings' },
  { id: 'scheduler', name: 'Scheduler', description: 'Manages job scheduling, engineers, and maintenance plans' },
  { id: 'finance', name: 'Finance', description: 'Manages quotes, invoices, payments, and financial reports' },
  { id: 'engineer', name: 'Engineer', description: 'Views and updates assigned jobs and service reports' },
  { id: 'client_admin', name: 'Client Admin', description: 'Client portal access to view properties and jobs' },
  { id: 'auditor', name: 'Auditor', description: 'Read-only access to compliance and reporting data' },
]

const PERMISSION_GROUPS = [
  {
    group: 'Organisation',
    permissions: [
      { id: 'manage_users', name: 'Manage Users', description: 'Invite, edit, and remove team members' },
      { id: 'manage_roles', name: 'Manage Roles', description: 'View and configure role permissions' },
      { id: 'edit_settings', name: 'Edit Settings', description: 'Modify organisation profile and preferences' },
    ],
  },
  {
    group: 'Operations',
    permissions: [
      { id: 'manage_clients', name: 'Manage Clients', description: 'Create and edit client records' },
      { id: 'manage_properties', name: 'Manage Properties', description: 'Create and edit property details' },
      { id: 'manage_assets', name: 'Manage Assets', description: 'Create and edit asset records' },
      { id: 'create_jobs', name: 'Create Jobs', description: 'Schedule and assign work orders' },
      { id: 'manage_maintenance', name: 'Manage Maintenance', description: 'Configure PPM plans and schedules' },
    ],
  },
  {
    group: 'Compliance',
    permissions: [
      { id: 'manage_compliance', name: 'Manage Compliance', description: 'Track and update compliance items' },
      { id: 'upload_documents', name: 'Upload Documents', description: 'Upload certificates and documents' },
    ],
  },
  {
    group: 'Finance',
    permissions: [
      { id: 'manage_quotes', name: 'Manage Quotes', description: 'Create and send quotations' },
      { id: 'manage_invoices', name: 'Manage Invoices', description: 'Generate and track invoices' },
      { id: 'view_payments', name: 'View Payments', description: 'View payment history and records' },
    ],
  },
  {
    group: 'Reporting',
    permissions: [
      { id: 'view_reports', name: 'View Reports', description: 'Access operational reports' },
      { id: 'view_analytics', name: 'View Analytics', description: 'Access analytics dashboards' },
      { id: 'export_data', name: 'Export Data', description: 'Export reports and data' },
    ],
  },
]

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id)),
  org_admin: PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id)),
  scheduler: [
    'manage_clients', 'manage_properties', 'manage_assets', 'create_jobs', 'manage_maintenance',
    'manage_compliance', 'upload_documents', 'view_reports', 'view_analytics',
  ],
  finance: [
    'manage_quotes', 'manage_invoices', 'view_payments', 'view_reports', 'view_analytics', 'export_data',
  ],
  engineer: [
    'create_jobs', 'upload_documents', 'view_reports',
  ],
  client_admin: [
    'view_reports', 'manage_compliance', 'upload_documents',
  ],
  auditor: [
    'view_reports', 'view_analytics', 'manage_compliance',
  ],
}

const ROLE_CHIP_COLOR: Record<string, ChipColor> = {
  super_admin: 'accent',
  org_admin: 'accent',
  scheduler: 'accent',
  finance: 'warning',
  engineer: 'success',
  client_admin: 'accent',
  auditor: 'default',
}

export default function RolesPage() {
  const allPermissions = PERMISSION_GROUPS.flatMap(g => g.permissions)

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="Roles & Permissions" subtitle="Permission matrix showing what each role can access. Roles are code-defined and cannot be edited." />
      </div>

      {/* Role cards summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ROLES.filter(r => r.id !== 'super_admin').map(role => {
          const permCount = ROLE_PERMISSIONS[role.id]?.length ?? 0
          return (
            <AppCard key={role.id} padding="sm">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={15} className="text-text-muted" />
                <Chip variant="soft" color={ROLE_CHIP_COLOR[role.id] ?? 'default'} size="sm">
                  {role.name}
                </Chip>
              </div>
              <p className="text-caption text-text-muted leading-relaxed">{role.description}</p>
              <p className="text-micro text-text-muted mt-2">
                {permCount} of {allPermissions.length} permissions
              </p>
            </AppCard>
          )
        })}
      </div>

      {/* Full permission matrix */}
      <AppCard padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
          <Info size={15} className="text-text-muted" />
          <div>
            <h2 className="text-body font-semibold text-text-primary">Permission Matrix</h2>
            <p className="text-caption text-text-muted mt-0.5">Detailed view of permissions by role</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-card">
              <tr className="border-b border-border-subtle">
                <th className="text-left py-3 px-4 text-micro font-medium text-text-muted uppercase tracking-[0.04em] min-w-[200px] sticky left-0 bg-surface-card">
                  Permission
                </th>
                {ROLES.filter(r => r.id !== 'super_admin').map(role => (
                  <th key={role.id} className="text-center py-3 px-3 text-micro font-medium text-text-muted uppercase tracking-[0.04em] min-w-[90px]">
                    <Chip variant="soft" color={ROLE_CHIP_COLOR[role.id] ?? 'default'} size="sm">
                      {role.name}
                    </Chip>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map(group => (
                <Fragment key={group.group}>
                  <tr className="bg-surface-page/30">
                    <td
                      colSpan={ROLES.length}
                      className="py-2 px-4 text-micro font-semibold text-text-muted uppercase tracking-[0.06em]"
                    >
                      {group.group}
                    </td>
                  </tr>
                  {group.permissions.map(perm => (
                    <tr key={perm.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-page transition-colors">
                      <td className="py-2.5 px-4 sticky left-0 bg-surface-card">
                        <span className="text-label text-text-secondary block">{perm.name}</span>
                        <span className="text-micro text-text-muted">{perm.description}</span>
                      </td>
                      {ROLES.filter(r => r.id !== 'super_admin').map(role => {
                        const hasAccess = ROLE_PERMISSIONS[role.id]?.includes(perm.id)
                        return (
                          <td key={role.id} className="py-2.5 px-3 text-center">
                            {hasAccess ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-status-compliant/10">
                                <Check size={14} className="text-status-compliant" />
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-page">
                                <X size={14} className="text-text-muted" />
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </AppCard>
    </div>
  )
}

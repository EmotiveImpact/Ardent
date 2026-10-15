import { lazy, Suspense, type ComponentType } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { Spinner } from '@haumea/ui'
import { Toaster } from 'sonner'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { PublicRoute } from '@/components/auth/public-route'
import { RoleRoute } from '@/components/auth/role-route'
import { ErrorBoundary } from '@/components/shared/error-boundary'
import { DevStatusBadge } from '@/components/dev/dev-status-badge'
import { SpaNavigationGuard } from '@/components/layout/spa-navigation-guard'
import { SWUpdatePrompt } from '@/components/shared/sw-update-prompt'
import DashboardLayout from '@/routes/dashboard/layout'

/**
 * Wrap a lazy import with a single retry. After a deploy, an open tab that
 * holds a stale `index.html` reference will try to load a chunk hash that no
 * longer exists. Vite's default lazy() throws ChunkLoadError on first miss
 * with no recovery; this wrapper retries once after 350ms, then lets the
 * ErrorBoundary's chunk-error detection do the hard reload. The result is
 * "transient network failure" no longer manifests as "page does not load."
 */
function lazyRetry<T extends { default: ComponentType<unknown> }>(
  importer: () => Promise<T>,
): ReturnType<typeof lazy<T['default']>> {
  return lazy(() =>
    importer().catch(
      (firstError) =>
        new Promise<T>((resolve, reject) => {
          setTimeout(() => {
            importer().then(resolve).catch(() => reject(firstError))
          }, 350)
        }),
    ),
  )
}

// Layouts
import { PortalLayout } from '@/components/layout/portal-layout'

// Marketing pages — moved to apps/marketing as its own Vite app.
// The web app now redirects "/" to /login. When you wire up a
// separate Vercel project for haumea-marketing on the apex domain,
// remove the redirect below or keep it as a fallback.

// Auth — use lazyRetry on the entry-point pages so a transient chunk-load
// failure on /login (the very first page everyone hits) auto-retries once
// before falling through to the ErrorBoundary's hard-reload recovery.
const LoginPage = lazyRetry(() => import('@/routes/auth/login'))
const RegisterPage = lazyRetry(() => import('@/routes/auth/register'))
const InvitePage = lazyRetry(() => import('@/routes/auth/invite'))
const ForgotPasswordPage = lazyRetry(() => import('@/routes/auth/forgot-password'))
const ResetPasswordPage = lazyRetry(() => import('@/routes/auth/reset-password'))
const SsoCallbackPage = lazyRetry(() => import('@/routes/auth/sso/callback'))

// Integrations
const SsoSettingsPage = lazy(() => import('@/routes/dashboard/integrations/sso/index'))

// Dashboard
const DashboardPage = lazy(() => import('@/routes/dashboard/index'))

// Onboarding
const OnboardingPage = lazy(() => import('@/routes/onboarding/index'))
const PublicEtaPage = lazy(() => import('@/routes/track/[token]'))
const PublicTrustPage = lazy(() => import('@/routes/trust/[slug]'))
const SubbieWorkPage = lazy(() => import('@/routes/subbie/[token]'))

// Clients
const ClientsPage = lazy(() => import('@/routes/clients/index'))
const ClientDetailPage = lazy(() => import('@/routes/clients/[id]'))
const NewClientPage = lazy(() => import('@/routes/clients/new'))
const EditClientPage = lazy(() => import('@/routes/clients/edit'))

// Properties
const PropertiesPage = lazy(() => import('@/routes/properties/index'))
const PropertyDetailPage = lazy(() => import('@/routes/properties/[id]'))
const NewPropertyPage = lazy(() => import('@/routes/properties/new'))

// Assets
const AssetsPage = lazy(() => import('@/routes/assets/index'))
const AssetDetailPage = lazy(() => import('@/routes/assets/[id]'))
const NewAssetPage = lazy(() => import('@/routes/assets/new'))
const EditAssetPage = lazy(() => import('@/routes/assets/edit'))

// Compliance
const CompliancePage = lazy(() => import('@/routes/compliance/index'))
const ComplianceDetailPage = lazy(() => import('@/routes/compliance/[id]'))
const NewCompliancePage = lazy(() => import('@/routes/compliance/new'))
// Strategic 1 follow-up — monthly Statement of Compliance history page.
// Lives at /dashboard/compliance/statements; route registered BEFORE
// the ":id" pattern so the static segment wins the match.
const StatementsOfCompliancePage = lazy(() => import('@/routes/dashboard/compliance/statements'))

// Maintenance
const MaintenancePage = lazy(() => import('@/routes/maintenance/index'))
const NewMaintenancePage = lazy(() => import('@/routes/maintenance/new'))

// Scheduler
const SchedulerPage = lazy(() => import('@/routes/scheduler/index'))

// Field engineer mobile view
const FieldPage = lazy(() => import('@/routes/field/index'))

// Jobs
const JobsPage = lazy(() => import('@/routes/jobs/index'))
const JobDetailPage = lazy(() => import('@/routes/jobs/[id]'))
const NewJobPage = lazy(() => import('@/routes/jobs/new'))
const EngineerTrackerPage = lazy(() => import('@/routes/engineer-tracker/index'))

// Reports
const ReportsPage = lazy(() => import('@/routes/reports/index'))
const ReportDetailPage = lazy(() => import('@/routes/reports/[id]'))
const AdvancedReportsPage = lazy(() => import('@/routes/reports/advanced'))
const ReportBuilderPage = lazy(() => import('@/routes/reports/builder'))
const RiskAssessmentsPage = lazy(() => import('@/routes/reports/risk-assessments'))
const LogBooksPage = lazy(() => import('@/routes/reports/log-books'))

// Documents
const DocumentsPage = lazy(() => import('@/routes/documents/index'))

// Quotes
const QuotesPage = lazy(() => import('@/routes/quotes/index'))
const QuoteDetailPage = lazy(() => import('@/routes/quotes/[id]'))
const NewQuotePage = lazy(() => import('@/routes/quotes/new'))

// Invoices
const InvoicesPage = lazy(() => import('@/routes/invoices/index'))
const InvoiceDetailPage = lazy(() => import('@/routes/invoices/[id]'))
const NewInvoicePage = lazy(() => import('@/routes/invoices/new'))

// Purchase Orders
const PurchaseOrdersPage = lazy(() => import('@/routes/purchase-orders/index'))
const PurchaseOrderDetailPage = lazy(() => import('@/routes/purchase-orders/[id]'))
const NewPurchaseOrderPage = lazy(() => import('@/routes/purchase-orders/new'))
const SuppliersPage = lazy(() => import('@/routes/suppliers/index'))
const SupplierDetailPage = lazy(() => import('@/routes/suppliers/[id]'))
const NewSupplierPage = lazy(() => import('@/routes/suppliers/new'))

// Actions / Defects
const ActionsPage = lazy(() => import('@/routes/actions/index'))
const ActionDetailPage = lazy(() => import('@/routes/actions/[id]'))
const NewActionPage = lazy(() => import('@/routes/actions/new'))

// Contracts
const ContractsPage = lazy(() => import('@/routes/contracts/index'))
const ContractDetailPage = lazy(() => import('@/routes/contracts/[id]'))
const NewContractPage = lazy(() => import('@/routes/contracts/new'))

// Engineers
const EngineersPage = lazy(() => import('@/routes/engineers/index'))
const EngineerDetailPage = lazy(() => import('@/routes/engineers/[id]'))
const NewEngineerPage = lazy(() => import('@/routes/engineers/new'))

// Subcontractors
const SubcontractorsPage = lazy(() => import('@/routes/subcontractors/index'))
const SubcontractorDetailPage = lazy(() => import('@/routes/subcontractors/[id]'))
const NewSubcontractorPage = lazy(() => import('@/routes/subcontractors/new'))
const EditSubcontractorPage = lazy(() => import('@/routes/subcontractors/edit'))

// Schedule
const SchedulePage = lazy(() => import('@/routes/schedule/index'))

// Analytics
const AnalyticsPage = lazy(() => import('@/routes/analytics/index'))

// Insights
const InsightsPage = lazy(() => import('@/routes/insights/index'))

// Archives
const ArchivesPage = lazy(() => import('@/routes/archives/index'))

// Knowledge Base
const KnowledgeBasePage = lazy(() => import('@/routes/knowledge-base/index'))
const NewKBArticlePage = lazy(() => import('@/routes/knowledge-base/new'))
const KBArticleDetailPage = lazy(() => import('@/routes/knowledge-base/[id]'))

// Integrations
const IntegrationsHubPage = lazy(() => import('@/routes/dashboard/integrations/index'))
const CalendarIntegrationPage = lazy(() => import('@/routes/dashboard/integrations/calendar/index'))
const SlackIntegrationPage = lazy(() => import('@/routes/dashboard/integrations/slack/index'))
const XeroIntegrationPage = lazy(() => import('@/routes/dashboard/integrations/xero/index'))
const QuickBooksIntegrationPage = lazy(() => import('@/routes/dashboard/integrations/quickbooks/index'))

// Auto-assign
const AutoAssignAdminPage = lazy(() => import('@/routes/dashboard/auto-assign/index'))

// SLA Policies (Wave 10 — Task 105)
const SlaPoliciesPage = lazy(() => import('@/routes/dashboard/settings/sla/index'))
const ComplianceRequirementsPage = lazy(() => import('@/routes/settings/compliance/index'))
const CustomFieldsSettingsPage = lazy(() => import('@/routes/settings/custom-fields/index'))

// Bulk CSV Import (Wave 11 — Task 106)
const ImportWizardPage = lazy(() => import('@/routes/dashboard/import/index'))

// Timesheet — engineer time tracking (Wave 12 — Task 107)
const TimesheetPage = lazy(() => import('@/routes/dashboard/timesheet/index'))

// White-label branding (Wave 12 — Task 109)
const BrandingSettingsPage = lazy(() => import('@/routes/dashboard/settings/branding/index'))

// GDPR Data & Privacy (Wave 12 — Task 108)
const DataPrivacyAdminPage = lazy(() => import('@/routes/dashboard/settings/data/index'))
const PrivacyPage = lazy(() => import('@/routes/dashboard/settings/privacy/index'))

// Stock / Parts
const StockListPage = lazy(() => import('@/routes/dashboard/stock/index'))
const NewStockItemPage = lazy(() => import('@/routes/dashboard/stock/new'))
const StockItemDetailPage = lazy(() => import('@/routes/dashboard/stock/[id]'))

// Settings
const SettingsPage = lazy(() => import('@/routes/settings/index'))
const ProfileSettingsPage = lazy(() => import('@/routes/settings/profile'))
const UsersSettingsPage = lazy(() => import('@/routes/settings/users'))
const RolesSettingsPage = lazy(() => import('@/routes/settings/roles'))
const OrgSettingsPage = lazy(() => import('@/routes/settings/organisation'))
const BillingSettingsPage = lazy(() => import('@/routes/settings/billing'))
const SettingsHealthPage = lazy(() => import('@/routes/settings/health'))

// Diagnostics / Health
const HealthPage = lazy(() => import('@/routes/health/index'))

// Audit log (org-wide search/filter)
const AuditLogPage = lazy(() => import('@/routes/dashboard/audit/index'))

// Notifications (full history page)
const NotificationsPage = lazy(() => import('@/routes/notifications/index'))

// Site portal (Wave 14 / Task 114) — single-property tenant portal
const SiteLayout = lazy(() => import('@/components/layout/site-layout').then(m => ({ default: m.SiteLayout })))
const SiteOverviewPage = lazy(() => import('@/routes/site/index'))
const SiteRaiseCalloutPage = lazy(() => import('@/routes/site/raise-callout'))
const SiteVisitsPage = lazy(() => import('@/routes/site/visits'))
const SiteCompliancePage = lazy(() => import('@/routes/site/compliance'))
const SiteQuotesPage = lazy(() => import('@/routes/site/quotes'))
const SiteContactsPage = lazy(() => import('@/routes/site/contacts'))
const SiteAcceptInvitePage = lazy(() => import('@/routes/site/accept-invite'))

// Portal
const PortalDashboardPage = lazy(() => import('@/routes/portal/index'))
const PortalCompliancePage = lazy(() => import('@/routes/portal/compliance'))
const PortalVisitsPage = lazy(() => import('@/routes/portal/visits'))
const PortalDocumentsPage = lazy(() => import('@/routes/portal/documents'))
const PortalInvoicesPage = lazy(() => import('@/routes/portal/invoices'))
const PortalInvoiceDetailPage = lazy(() => import('@/routes/portal/invoice-detail'))
const PortalActionsPage = lazy(() => import('@/routes/portal/actions'))
const PortalQuotesPage = lazy(() => import('@/routes/portal/quotes'))
const PortalQuoteDetailPage = lazy(() => import('@/routes/portal/quote-detail'))
const PortalContactPage = lazy(() => import('@/routes/portal/contact'))
const PortalRaiseCallOutPage = lazy(() => import('@/routes/portal/raise-call-out'))
const PortalPortfolioPage = lazy(() => import('@/routes/portal/portfolio'))

// Global 404 — rendered by the `path="*"` catch-all so unmatched URLs get a
// friendly page instead of a blank Suspense screen.
const NotFoundPage = lazy(() => import('@/components/shared/not-found'))

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner size="lg" />
    </div>
  )
}

export default function App() {
  return (
    <>
    <BrowserRouter>
      <SpaNavigationGuard />
      <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Marketing site has moved to apps/marketing — its own Vite app
              + its own Vercel project. The web app's "/" now redirects
              straight to /login (signed-out) or /dashboard (signed-in,
              handled by the auth-guarded routes below). */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/features" element={<Navigate to="/login" replace />} />
          <Route path="/pricing" element={<Navigate to="/login" replace />} />
          <Route path="/about" element={<Navigate to="/login" replace />} />
          <Route path="/contact" element={<Navigate to="/login" replace />} />

          {/* Auth routes (public) */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          {/* NOT wrapped in PublicRoute: invited users arrive via Supabase's
              magic link with a live session already established, so PublicRoute
              would bounce them to /dashboard before they can set a password.
              The page guards its own state (live session ↔ set password). */}
          <Route path="/invite" element={<InvitePage />} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
          {/* NOT PublicRoute — the recovery link establishes a session, which
              PublicRoute would bounce into the app before the user can reset. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* SSO callback (public — Supabase auth-js processes the OAuth code) */}
          <Route path="/auth/sso/callback" element={<SsoCallbackPage />} />

          {/* Site portal — tenant invite acceptance (public, token-gated) */}
          <Route path="/site/accept-invite" element={<SiteAcceptInvitePage />} />

          {/* Sprint 3 / D2 — Public ETA tracking page. Customers tap an
              SMS link, no login. Token-gated by the public-job-eta
              edge function (verify_jwt: false). */}
          <Route path="/track/:token" element={<PublicEtaPage />} />
          {/* W2-T7 — per-use subcontractor work link (no login). */}
          <Route path="/subbie/:token" element={<SubbieWorkPage />} />

          {/* Strategic 1 follow-up — Public Trust URL (Vanta-style
              continuous-compliance verification). No login. Slug-gated
              by the public-trust-score edge function. */}
          <Route path="/trust/:slug" element={<PublicTrustPage />} />

          {/* Site portal — single-property tenant_user routes (Wave 14 / Task 114).
              Auth + role checks handled inside SiteLayout. */}
          <Route path="/site" element={<SiteLayout />}>
            <Route index element={<SiteOverviewPage />} />
            <Route path="raise-callout" element={<SiteRaiseCalloutPage />} />
            <Route path="visits" element={<SiteVisitsPage />} />
            <Route path="compliance" element={<SiteCompliancePage />} />
            <Route path="quotes" element={<SiteQuotesPage />} />
            <Route path="contacts" element={<SiteContactsPage />} />
          </Route>

          {/* First-run onboarding (protected, full-screen) */}
          <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />

          {/* Client portal (protected) */}
          <Route path="/portal" element={<ProtectedRoute><PortalLayout /></ProtectedRoute>}>
            <Route index element={<PortalDashboardPage />} />
            <Route path="compliance" element={<PortalCompliancePage />} />
            <Route path="visits" element={<PortalVisitsPage />} />
            <Route path="documents" element={<PortalDocumentsPage />} />
            <Route path="invoices" element={<PortalInvoicesPage />} />
            <Route path="invoices/:id" element={<PortalInvoiceDetailPage />} />
            <Route path="actions" element={<PortalActionsPage />} />
            <Route path="quotes" element={<PortalQuotesPage />} />
            <Route path="quotes/:id" element={<PortalQuoteDetailPage />} />
            <Route path="contact" element={<PortalContactPage />} />
            <Route path="raise-call-out" element={<PortalRaiseCallOutPage />} />
            <Route path="portfolio" element={<PortalPortfolioPage />} />
          </Route>

          {/* Main app routes (protected) — now under /dashboard */}
          <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />

            <Route path="clients" element={<RoleRoute requiredPermissions={['clients:read']}><ClientsPage /></RoleRoute>} />
            <Route path="clients/new" element={<RoleRoute requiredPermissions={['clients:write']}><NewClientPage /></RoleRoute>} />
            <Route path="clients/:id/edit" element={<RoleRoute requiredPermissions={['clients:write']}><EditClientPage /></RoleRoute>} />
            <Route path="clients/:id" element={<RoleRoute requiredPermissions={['clients:read']}><ClientDetailPage /></RoleRoute>} />

            <Route path="properties" element={<RoleRoute requiredPermissions={['properties:read']}><PropertiesPage /></RoleRoute>} />
            <Route path="properties/new" element={<RoleRoute requiredPermissions={['properties:write']}><NewPropertyPage /></RoleRoute>} />
            <Route path="properties/:id" element={<RoleRoute requiredPermissions={['properties:read']}><PropertyDetailPage /></RoleRoute>} />

            <Route path="assets" element={<RoleRoute requiredPermissions={['assets:read']}><AssetsPage /></RoleRoute>} />
            <Route path="assets/new" element={<RoleRoute requiredPermissions={['assets:write']}><NewAssetPage /></RoleRoute>} />
            <Route path="assets/:id/edit" element={<RoleRoute requiredPermissions={['assets:write']}><EditAssetPage /></RoleRoute>} />
            <Route path="assets/:id" element={<RoleRoute requiredPermissions={['assets:read']}><AssetDetailPage /></RoleRoute>} />

            <Route path="compliance" element={<RoleRoute requiredPermissions={['compliance:read']}><CompliancePage /></RoleRoute>} />
            <Route path="compliance/new" element={<RoleRoute requiredPermissions={['compliance:write']}><NewCompliancePage /></RoleRoute>} />
            {/* Static "statements" must precede ":id" so the route matcher picks it. */}
            <Route path="compliance/statements" element={<RoleRoute requiredPermissions={['compliance:read']}><StatementsOfCompliancePage /></RoleRoute>} />
            <Route path="compliance/:id" element={<RoleRoute requiredPermissions={['compliance:read']}><ComplianceDetailPage /></RoleRoute>} />

            <Route path="maintenance" element={<RoleRoute requiredPermissions={['maintenance:read']}><MaintenancePage /></RoleRoute>} />
            <Route path="maintenance/new" element={<RoleRoute requiredPermissions={['maintenance:write']}><NewMaintenancePage /></RoleRoute>} />

            <Route path="scheduler" element={<RoleRoute requiredPermissions={['scheduler:read']}><SchedulerPage /></RoleRoute>} />

            <Route path="field" element={<RoleRoute requiredPermissions={['jobs:read']}><FieldPage /></RoleRoute>} />

            <Route path="jobs" element={<RoleRoute requiredPermissions={['jobs:read']}><JobsPage /></RoleRoute>} />
            <Route path="jobs/new" element={<RoleRoute requiredPermissions={['jobs:write']}><NewJobPage /></RoleRoute>} />
            <Route path="jobs/:id" element={<RoleRoute requiredPermissions={['jobs:read']}><JobDetailPage /></RoleRoute>} />
            <Route path="engineer-tracker" element={<RoleRoute requiredPermissions={['scheduler:read']}><EngineerTrackerPage /></RoleRoute>} />

            <Route path="reports" element={<RoleRoute requiredPermissions={['reports:read']}><ReportsPage /></RoleRoute>} />
            <Route path="reports/advanced" element={<RoleRoute requiredPermissions={['reports:read']}><AdvancedReportsPage /></RoleRoute>} />
            <Route path="reports/builder" element={<RoleRoute requiredPermissions={['reports:read']}><ReportBuilderPage /></RoleRoute>} />
            <Route path="reports/risk-assessments" element={<RoleRoute requiredPermissions={['reports:read']}><RiskAssessmentsPage /></RoleRoute>} />
            <Route path="reports/log-books" element={<RoleRoute requiredPermissions={['reports:read']}><LogBooksPage /></RoleRoute>} />
            <Route path="reports/:id" element={<RoleRoute requiredPermissions={['reports:read']}><ReportDetailPage /></RoleRoute>} />

            <Route path="documents" element={<RoleRoute requiredPermissions={['documents:read']}><DocumentsPage /></RoleRoute>} />

            <Route path="quotes" element={<RoleRoute requiredPermissions={['quotes:read']}><QuotesPage /></RoleRoute>} />
            <Route path="quotes/new" element={<RoleRoute requiredPermissions={['quotes:write']}><NewQuotePage /></RoleRoute>} />
            <Route path="quotes/:id" element={<RoleRoute requiredPermissions={['quotes:read']}><QuoteDetailPage /></RoleRoute>} />

            <Route path="invoices" element={<RoleRoute requiredPermissions={['invoices:read']}><InvoicesPage /></RoleRoute>} />
            <Route path="invoices/new" element={<RoleRoute requiredPermissions={['invoices:write']}><NewInvoicePage /></RoleRoute>} />
            <Route path="invoices/:id" element={<RoleRoute requiredPermissions={['invoices:read']}><InvoiceDetailPage /></RoleRoute>} />

            <Route path="purchase-orders" element={<RoleRoute requiredPermissions={['invoices:read']}><PurchaseOrdersPage /></RoleRoute>} />
            <Route path="purchase-orders/new" element={<RoleRoute requiredPermissions={['invoices:write']}><NewPurchaseOrderPage /></RoleRoute>} />
            <Route path="purchase-orders/:id" element={<RoleRoute requiredPermissions={['invoices:read']}><PurchaseOrderDetailPage /></RoleRoute>} />

            {/* Sprint 3 / B3 — standalone Suppliers module. */}
            <Route path="suppliers" element={<RoleRoute requiredPermissions={['invoices:read']}><SuppliersPage /></RoleRoute>} />
            <Route path="suppliers/new" element={<RoleRoute requiredPermissions={['invoices:write']}><NewSupplierPage /></RoleRoute>} />
            <Route path="suppliers/:id" element={<RoleRoute requiredPermissions={['invoices:read']}><SupplierDetailPage /></RoleRoute>} />

            <Route path="contracts" element={<RoleRoute requiredPermissions={['invoices:read']}><ContractsPage /></RoleRoute>} />
            <Route path="contracts/new" element={<RoleRoute requiredPermissions={['invoices:write']}><NewContractPage /></RoleRoute>} />
            <Route path="contracts/:id" element={<RoleRoute requiredPermissions={['invoices:read']}><ContractDetailPage /></RoleRoute>} />

            <Route path="actions" element={<RoleRoute requiredPermissions={['compliance:read']}><ActionsPage /></RoleRoute>} />
            <Route path="actions/new" element={<RoleRoute requiredPermissions={['compliance:write']}><NewActionPage /></RoleRoute>} />
            <Route path="actions/:id" element={<RoleRoute requiredPermissions={['compliance:read']}><ActionDetailPage /></RoleRoute>} />

            <Route path="engineers" element={<RoleRoute requiredPermissions={['users:read']}><EngineersPage /></RoleRoute>} />
            <Route path="engineers/new" element={<RoleRoute requiredPermissions={['users:write']}><NewEngineerPage /></RoleRoute>} />
            <Route path="engineers/:id" element={<RoleRoute requiredPermissions={['users:read']}><EngineerDetailPage /></RoleRoute>} />

            <Route path="subcontractors" element={<RoleRoute requiredPermissions={['users:read']}><SubcontractorsPage /></RoleRoute>} />
            <Route path="subcontractors/new" element={<RoleRoute requiredPermissions={['users:write']}><NewSubcontractorPage /></RoleRoute>} />
            <Route path="subcontractors/:id" element={<RoleRoute requiredPermissions={['users:read']}><SubcontractorDetailPage /></RoleRoute>} />
            <Route path="subcontractors/:id/edit" element={<RoleRoute requiredPermissions={['users:write']}><EditSubcontractorPage /></RoleRoute>} />

            <Route path="schedule" element={<RoleRoute requiredPermissions={['scheduler:read']}><SchedulePage /></RoleRoute>} />

            <Route path="analytics" element={<RoleRoute requiredPermissions={['analytics:read']}><AnalyticsPage /></RoleRoute>} />

            <Route path="insights" element={<RoleRoute requiredPermissions={['analytics:read']}><InsightsPage /></RoleRoute>} />

            <Route path="archives" element={<ArchivesPage />} />

            <Route path="auto-assign" element={<RoleRoute requiredPermissions={['settings:read']}><AutoAssignAdminPage /></RoleRoute>} />

            <Route path="stock" element={<RoleRoute requiredPermissions={['assets:read']}><StockListPage /></RoleRoute>} />
            <Route path="stock/new" element={<RoleRoute requiredPermissions={['assets:write']}><NewStockItemPage /></RoleRoute>} />
            <Route path="stock/:id" element={<RoleRoute requiredPermissions={['assets:read']}><StockItemDetailPage /></RoleRoute>} />

            <Route path="knowledge-base" element={<KnowledgeBasePage />} />
            <Route path="knowledge-base/new" element={<NewKBArticlePage />} />
            <Route path="knowledge-base/:id" element={<KBArticleDetailPage />} />

            <Route path="integrations" element={<ProtectedRoute><IntegrationsHubPage /></ProtectedRoute>} />
            <Route path="integrations/calendar" element={<ProtectedRoute><CalendarIntegrationPage /></ProtectedRoute>} />
            <Route path="integrations/slack" element={<RoleRoute requiredPermissions={['settings:write']}><SlackIntegrationPage /></RoleRoute>} />
            <Route path="integrations/xero" element={<RoleRoute requiredPermissions={['settings:write']}><XeroIntegrationPage /></RoleRoute>} />
            <Route path="integrations/quickbooks" element={<RoleRoute requiredPermissions={['settings:write']}><QuickBooksIntegrationPage /></RoleRoute>} />

            <Route path="settings" element={<RoleRoute requiredPermissions={['settings:read']}><SettingsPage /></RoleRoute>} />
            <Route path="settings/sla" element={<RoleRoute requiredPermissions={['settings:write']}><SlaPoliciesPage /></RoleRoute>} />
            <Route path="settings/compliance" element={<RoleRoute requiredPermissions={['settings:write']}><ComplianceRequirementsPage /></RoleRoute>} />
            <Route path="settings/custom-fields" element={<RoleRoute requiredPermissions={['settings:write']}><CustomFieldsSettingsPage /></RoleRoute>} />
            <Route path="settings/branding" element={<RoleRoute requiredPermissions={['branding:write']}><BrandingSettingsPage /></RoleRoute>} />
            <Route path="settings/profile" element={<ProtectedRoute><ProfileSettingsPage /></ProtectedRoute>} />
            <Route path="settings/users" element={<RoleRoute requiredPermissions={['users:read']}><UsersSettingsPage /></RoleRoute>} />
            <Route path="settings/roles" element={<RoleRoute requiredPermissions={['settings:read']}><RolesSettingsPage /></RoleRoute>} />
            <Route path="settings/organisation" element={<RoleRoute requiredPermissions={['settings:write']}><OrgSettingsPage /></RoleRoute>} />
            <Route path="settings/billing" element={<RoleRoute requiredPermissions={['settings:write']}><BillingSettingsPage /></RoleRoute>} />
            <Route path="settings/health" element={<RoleRoute requiredPermissions={['settings:read']}><SettingsHealthPage /></RoleRoute>} />

            {/* GDPR — Wave 12 / Task 108 */}
            <Route path="settings/data" element={<RoleRoute requiredPermissions={['data:export']}><DataPrivacyAdminPage /></RoleRoute>} />
            <Route path="settings/privacy" element={<RoleRoute requiredPermissions={['privacy:read']}><PrivacyPage /></RoleRoute>} />

            {/* Integrations — SSO admin (Microsoft Entra + Google Workspace) */}
            <Route path="integrations/sso" element={<RoleRoute requiredPermissions={['settings:write']}><SsoSettingsPage /></RoleRoute>} />

            <Route path="health" element={<RoleRoute requiredPermissions={['users:read']}><HealthPage /></RoleRoute>} />

            <Route path="audit" element={<RoleRoute requiredPermissions={['audit:read']}><AuditLogPage /></RoleRoute>} />

            <Route path="notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />

            <Route path="import" element={<RoleRoute requiredPermissions={['import:write']}><ImportWizardPage /></RoleRoute>} />

            {/* Timesheet — Wave 12 / Task 107 — any authenticated user. */}
            <Route path="timesheet" element={<ProtectedRoute><TimesheetPage /></ProtectedRoute>} />
          </Route>

          {/* Global catch-all — MUST be last. Any URL that matched no route
              above (including unmatched paths under /portal, /site, /dashboard
              since those nested groups have no own catch-all) renders the
              friendly 404 instead of a blank Suspense screen. */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
      <DevStatusBadge />
      {/*
       * SW update + registration is mounted here at the App root rather than
       * inside DashboardLayout so it works on every screen — including portal,
       * site, login, register, onboarding, and the public /trust + /track
       * pages. Previously these screens never re-registered the SW after the
       * boot-script eviction, leaving them stuck on whatever index.html the
       * CDN happened to serve.
       */}
      <SWUpdatePrompt />
    </BrowserRouter>
    <Toaster
      richColors
      closeButton
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--color-surface-card)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border-default)',
        },
      }}
    />
    </>
  )
}

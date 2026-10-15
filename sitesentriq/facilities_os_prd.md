# Facilities OS - Product Requirements Document

## 1. Product summary

Facilities OS is a multi-tenant compliance, service operations, and billing platform for facilities management companies and their clients. It gives facilities teams, engineers, finance teams, and site managers a single place to manage properties, planned maintenance, compliance records, engineer visits, service reports, quotes, invoices, training, and audit readiness.

The platform replaces fragmented workflows spread across folders, spreadsheets, phone calls, email chains, paper logs, and disconnected invoicing tools.

### Core promise
One place to manage every site, every service, every deadline, every report, and every invoice.

---

## 2. Product vision

To become the operating system for facilities compliance and service delivery, giving facilities companies a scalable, client-facing platform that improves visibility, reduces admin, strengthens audit readiness, and creates new revenue streams through training, reporting, and data services.

---

## 3. Problem statement

Facilities companies and regulated businesses often manage critical information across too many disconnected tools and manual processes.

This leads to:
- missed compliance dates
- poor audit readiness
- difficulty retrieving service reports and certificates quickly
- repeated admin work
- manual scheduling and follow-up
- poor visibility for clients
- delayed quote approvals and invoice payments
- inconsistent engineer workflows
- weak evidence trails
- limited ability to scale across multiple sites

Clients need autonomy and instant visibility.
Service providers need control, proof, and operational efficiency.

---

## 4. Goals

### Business goals
- Create a sellable SaaS platform for facilities management companies
- Increase client retention through transparency and self-service
- Reduce admin burden around scheduling, compliance tracking, and reporting
- Improve invoice collection and quote approval speed
- Create expansion revenue through training, accreditation, analytics, and premium modules

### User goals
- Let clients instantly find reports, certificates, invoices, and service history
- Let operations teams manage maintenance schedules, engineer allocation, and compliance at scale
- Let engineers complete jobs and submit evidence from the field
- Let finance teams manage quotes, invoices, payment status, and reminders in one place
- Let auditors and inspectors access evidence quickly

### Product goals
- Deliver a clear compliance dashboard per site and per client
- Provide reliable recurring maintenance scheduling
- Support full site-level timelines and document history
- Enable role-based access for all parties
- Support future expansion into learning, development, and accredited training

---

## 5. Non-goals for MVP

The MVP will not initially focus on:
- complex procurement and stock management
- advanced route optimisation
- full IoT sensor integrations
- deep accounting sync beyond basic exports or limited integrations
- marketplace functionality for external contractors
- full custom BI modelling comparable to enterprise Power BI implementations
- desktop offline software
- advanced permit-to-work workflows

These can be added in later phases.

---

## 6. Target users

### 6.1 Platform owner / Super admin
The software operator or internal leadership team managing platform-wide settings, subscriptions, companies, and permissions.

### 6.2 Facilities company admin / Operations manager
The main service provider user managing clients, properties, assets, compliance obligations, scheduling, reports, and engineers.

### 6.3 Scheduler / Back-office coordinator
The user responsible for assigning jobs, planning future visits, and confirming appointment windows.

### 6.4 Finance / Accounts user
The user responsible for quotes, invoices, payment status, reminders, and financial reporting.

### 6.5 Engineer / Field operative
The user completing site visits, inspections, maintenance, and service reports from mobile.

### 6.6 Client admin / Site manager
The customer-facing user viewing compliance status, reports, invoices, visit history, and upcoming work.

### 6.7 Auditor / Inspector
A limited-access user or temporary viewer reviewing service history, certificates, logs, and compliance evidence.

### 6.8 Trainee / Staff learner
A user accessing training modules, completing assessments, and maintaining accredited training records.

---

## 7. Tech stack

### Frontend
- Build tool: Vite
- Framework: React 19 with React Router for SPA routing
- UI component library: HeroUI (formerly NextUI) — Tailwind-based component system
- Styling: Tailwind CSS v4
- Data fetching and caching: TanStack Query (React Query)
- Tables: TanStack Table
- Forms: React Hook Form + Zod validation
- Charts: Recharts
- Date handling: date-fns
- Icons: Lucide React

### Backend (Supabase as BaaS)
- Database: Postgres via Supabase
- Auth: Supabase Auth (email/password, magic link, OAuth)
- File storage: Supabase Storage (reports, certificates, photos, documents)
- Realtime: Supabase Realtime for live updates and notifications
- Row Level Security: multi-tenant data isolation at the database level
- Edge Functions: Supabase Edge Functions for server-side logic (webhooks, cron, PDF generation)

### Infra and services
- Hosting: Vercel or Netlify for static SPA deployment
- Background jobs: Supabase Edge Functions + pg_cron for recurring tasks (reminders, schedule generation)
- Email: Resend for transactional notifications
- SMS / messaging: Twilio (phase 2)
- Payments: Stripe for card payments and recurring billing
- Analytics: PostHog for product analytics
- Monitoring: Sentry for error tracking

### Mobile (Phase 2)
- Expo React Native for engineer mobile workflows
- Shared Supabase backend — same auth, same database, same storage

---

## 8. Product principles

- Clear over clever
- Compliance must be visible in seconds
- Every important action needs proof and traceability
- Clients should not have to chase reports or invoices
- Engineers should be able to complete jobs simply from mobile
- The platform should reduce admin, not create more of it
- Modules should expand naturally into training, analytics, and premium services

---

## 9. Product pillars

### Pillar 1 - Compliance visibility
A real-time view of what is compliant, due soon, overdue, or at risk.

### Pillar 2 - Service operations
Scheduling, engineer assignment, recurring maintenance planning, and job completion.

### Pillar 3 - Proof and documentation
Reports, certificates, signatures, photos, logs, and full audit trails.

### Pillar 4 - Commercial control
Quotes, invoices, payment reminders, contracts, and billing clarity.

### Pillar 5 - Client self-service
A client portal that reduces friction and increases trust.

### Pillar 6 - Training and growth
Learning, accreditation, and compliance training as future expansion.

---

## 10. Core product modules

## 10.1 Multi-tenant account structure

### Description
Supports multiple facilities companies, each with their own clients, sites, staff, and permissions.

### Requirements
- Create and manage organisation accounts
- Support multiple clients per facilities company
- Support multiple properties per client
- Separate data securely by tenant
- Role-based access by organisation and site

### MVP priority
Must have

---

## 10.2 Client and property management

### Description
Create and manage client accounts, properties, buildings, zones, contacts, and service metadata.

### Requirements
- Create client profile
- Add one or more sites / properties
- Store address, contact details, site type, operating hours
- Assign site managers and contacts
- Store access notes, emergency details, and site-specific instructions
- Support property grouping by client and region

### Future enhancements
- Building and floor hierarchy
- Site maps and floorplans
- Site risk profile
- Region and portfolio segmentation

### MVP priority
Must have

---

## 10.3 Asset register

### Description
Track all assets requiring maintenance, servicing, inspection, or certification.

### Requirements
- Create asset records linked to site and area
- Store category, make, model, serial number, install date, status
- View asset history
- Attach documents and photos to assets
- Link assets to maintenance plans and service records

### Future enhancements
- QR code or NFC tagging
- Warranty tracking
- asset lifecycle forecasting
- spare parts linkage

### MVP priority
Must have

---

## 10.4 Compliance management

### Description
A dashboard and underlying engine that tracks compliance obligations per site, asset, and client.

### Requirements
- Support compliance item types such as fire extinguishers, alarms, lighting, gas, electrical, HVAC, water hygiene, doors, pest control, HACCP, and training
- Record last completed date
- Generate next due date based on frequency
- Show status as compliant, due soon, overdue, non-compliant
- Allow upload of proof documents and certificates
- Enable filtering by site, client, compliance type, and status

### Future enhancements
- Compliance scoring
- non-conformance workflows
- corrective actions
- portfolio heatmaps
- inspection readiness packs

### MVP priority
Must have

---

## 10.5 Planned preventative maintenance engine

### Description
Create recurring maintenance schedules and service plans from rules and frequencies.

### Requirements
- Set frequencies such as annual, six-monthly, quarterly, monthly, weekly, daily
- Generate next due date automatically from last completed visit or fixed schedule
- Allow plan creation at site level or asset level
- Create visit tasks from due dates
- Show upcoming work calendar

### Future enhancements
- holiday rules
- blackout windows
- grouped service visits
- SLA-based scheduling
- missed visit recovery logic

### MVP priority
Must have

---

## 10.6 Scheduler and dispatch

### Description
A back-office scheduling module for assigning work to engineers and confirming visits.

### Requirements
- Calendar and list views
- Assign engineer to a visit or job
- Track job status: scheduled, in progress, completed, failed access, follow-up required
- Define time windows
- Surface engineer availability
- Show client-facing upcoming visit information

### Future enhancements
- drag-and-drop board
- route optimisation
- engineer skill matching
- subcontractor support
- client self-booking windows

### MVP priority
Must have

---

## 10.7 Engineer mobile workflow

### Description
A mobile-first experience for engineers to view jobs and complete service records from the field.

### Requirements
- Secure mobile login
- View assigned jobs
- Access site details and asset history
- Complete service checklist
- Add notes
- Upload photos
- capture digital signature
- mark job outcome
- submit service report
- raise follow-up actions or defects

### Future enhancements
- offline mode
- voice notes
- QR scanning
- GPS proof of attendance
- van stock
- instant PDF generation

### MVP priority
Should have for launch if engineer workflows are part of v1, otherwise phase 2

---

## 10.8 Reports and document repository

### Description
A secure digital repository for reports, certificates, risk assessments, invoices, quotes, logs, and site evidence.

### Requirements
- Upload and store documents at site, asset, and job level
- Download documents quickly
- Tag by document type
- Track upload date and version
- Search and filter documents
- Set document expiry dates where relevant

### Future enhancements
- OCR text extraction
- approval workflow
- bulk document packs
- e-signature support
- document comparison

### MVP priority
Must have

---

## 10.9 Timeline and audit trail

### Description
A full activity feed per site and client showing what has happened over time.

### Requirements
- Show events such as visit completed, report uploaded, invoice issued, quote approved, certificate expired, action raised, training completed
- Filter by date and event type
- Record user actions for audit and accountability

### MVP priority
Must have

---

## 10.10 Quotes and invoicing

### Description
A commercial module that allows service providers to raise quotes, issue invoices, and track payment status.

### Requirements
- Create quote
- Send quote to client
- Allow client approval or rejection
- Convert accepted quote into job or follow-up work
- Create invoice
- set due date
- show paid, unpaid, overdue status
- send reminders
- generate PDF output

### Future enhancements
- online payments
- recurring invoices
- deposits
- partial payments
- purchase order tracking
- credit notes
- debtor ageing dashboard

### MVP priority
Must have

---

## 10.11 Contracts and service agreements

### Description
Track service agreement terms between provider and client.

### Requirements
- Contract start and end dates
- services included
- service frequency commitments
- SLA notes
- renewal reminders

### Future enhancements
- margin analysis
- auto-renewals
- service bundles
- upsell triggers

### MVP priority
Should have

---

## 10.12 Client portal

### Description
A client-facing portal where customers can self-serve reports, compliance status, invoices, upcoming visits, and historical records.

### Requirements
- Dashboard showing compliance overview
- upcoming and past visits
- reports and certificates
- quotes and invoices
- open actions and defects
- contact / support view
- site and portfolio switching for multi-site clients

### Future enhancements
- branded portal
- benchmarking views
- downloadable audit packs
- shared comments and approvals
- self-service requests

### MVP priority
Must have

---

## 10.13 Forms, logs, and daily operational records

### Description
Digitise paper records such as temperature checks, HACCP logs, cleaning schedules, and inspection sheets.

### Requirements
- Create form templates
- support daily, weekly, monthly logs
- capture date, user, values, comments, and attachments
- store records by site
- make records audit-ready

### Future enhancements
- anomaly alerts
- manager sign-off
- industry template packs
- trend analysis
- tamper-evident log records

### MVP priority
Could have if targeting hospitality / food / regulated sites early

---

## 10.14 Training and learning module

### Description
A future expansion module for mandatory training, accredited learning, and staff compliance.

### Requirements
- Host training modules
- Assign courses by user or site
- track completion
- issue completion certificates
- set renewal reminders

### Future enhancements
- accredited external trainers
- SCORM support
- quizzes and assessments
- manager reporting
- fire warden training packs
- monetised learning marketplace

### MVP priority
Phase 2 or Phase 3

---

## 10.15 Analytics and dashboards

### Description
Portfolio-wide analytics for compliance, service delivery, billing, and growth.

### Requirements
- Compliance summary by site and client
- visits completed vs overdue
- upcoming renewals
- quote to approval conversion
- invoice status dashboard
- engineer workload summary
- document and action counts

### Future enhancements
- revenue analytics
- SLA performance
- risk forecasting
- client health scoring
- BI exports and scheduled reports

### MVP priority
Must have in basic form

---

## 10.16 Notifications and automations

### Description
Automated reminders and workflow triggers to reduce manual follow-up.

### Requirements
- Remind users when compliance is due soon
- remind clients of upcoming visits
- remind clients of unpaid invoices
- remind staff of expiring training
- notify operations team of failed visits or overdue actions

### Future enhancements
- webhook automation
- quote generation from defects
- invoice creation from signed-off jobs
- escalation ladders
- monthly compliance digest emails

### MVP priority
Must have in basic form

---

## 10.17 Permissions and security

### Description
Fine-grained access control across company, client, site, and module level.

### Requirements
- role-based access control
- tenant isolation
- secure auth
- activity logging
- password reset and invite flows
- GDPR-compliant data handling

### Future enhancements
- SSO
- 2FA
- audit export logs
- IP restrictions

### MVP priority
Must have

---

## 11. User stories

### Super admin
- As a super admin, I want to create and manage facilities company accounts so the platform can support multiple paying organisations.
- As a super admin, I want to control modules and permissions so each tenant only sees what they need.

### Operations manager
- As an operations manager, I want to set up a new client and their sites so I can onboard them quickly.
- As an operations manager, I want to see all compliance due dates in one dashboard so nothing is missed.
- As an operations manager, I want to assign jobs to engineers so planned maintenance is completed on time.
- As an operations manager, I want follow-up defects turned into actions or quotes so work can continue without delays.

### Finance user
- As a finance user, I want to issue invoices and send reminders so I can reduce late payments.
- As a finance user, I want clients to approve quotes online so I can speed up conversion to paid work.

### Engineer
- As an engineer, I want to see my daily schedule on mobile so I know where I need to be.
- As an engineer, I want to upload photos, notes, and signatures from site so the office has proof immediately.
- As an engineer, I want to flag issues from site so follow-up work can be quoted and scheduled.

### Client admin
- As a client admin, I want to log into a portal and see whether my site is compliant so I can prepare for inspections.
- As a client admin, I want to download reports, certificates, and invoices instantly so I do not have to chase the service provider.
- As a client admin, I want to see upcoming visits and overdue actions so I understand what is happening at my sites.

### Auditor / Inspector
- As an auditor, I want quick access to recent records and certificates so I can verify compliance without delay.

### Trainee
- As a staff member, I want to complete mandatory training and receive a certificate so my employer can prove compliance.

---

## 12. Key workflows

## 12.1 Onboard a new client
1. Create client account
2. Add property or site
3. Add site contacts and access notes
4. Add assets and compliance items
5. Upload historical certificates and reports
6. Set maintenance frequencies
7. Invite client users
8. Activate dashboard and portal access

## 12.2 Schedule recurring compliance work
1. Create service plan
2. Set recurring frequency
3. Generate upcoming visit
4. Assign engineer
5. Notify client
6. Engineer attends and completes job
7. Upload report and proof
8. Generate next due date automatically

## 12.3 Turn engineer issue into paid work
1. Engineer flags defect during visit
2. Office reviews issue
3. Office creates quote
4. Client approves quote
5. Follow-up job scheduled
6. Work completed
7. Invoice issued
8. Payment tracked

## 12.4 Prepare for inspection
1. Client opens site portal
2. Reviews compliance dashboard
3. Downloads required certificates and logs
4. Identifies missing items
5. Creates urgent follow-up tasks if needed

## 12.5 Training compliance
1. Assign training module to staff
2. Staff completes module
3. Completion certificate stored
4. Renewal reminder scheduled
5. Manager sees compliance summary

---

## 13. Functional requirements by surface

## 13.1 Web admin app
Primary users: operations, scheduling, finance, platform admins, client admins

Must support:
- dashboards
- account and site setup
- compliance management
- asset management
- document uploads
- scheduling and dispatch
- quote and invoice management
- portal access and permissions
- analytics
- settings

## 13.2 Mobile app
Primary users: engineers, future client or manager workflows

Must support:
- authentication
- assigned jobs
- job details
- checklists
- notes, photos, signatures
- report submission
- defect raising
- offline-friendly architecture if phase 2

---

## 14. Information architecture

### Main navigation
- Dashboard
- Clients
- Properties
- Assets
- Compliance
- Scheduler
- Jobs
- Reports
- Documents
- Quotes
- Invoices
- Analytics
- Training
- Settings

### Site-level navigation
- Overview
- Compliance
- Assets
- Visits
- Reports
- Documents
- Actions
- Billing
- Timeline
- Training

---

## 15. Data model overview

Core entities:
- Organisation
- User
- Role
- Client
- Property / Site
- Area / Zone
- Asset
- ComplianceItem
- MaintenancePlan
- Job / Visit
- EngineerAssignment
- ServiceReport
- Document
- Action / Defect
- Quote
- Invoice
- Payment
- Contract
- TrainingCourse
- TrainingAssignment
- TrainingCertificate
- TimelineEvent
- Notification

Key relationships:
- Organisation has many clients
- Client has many sites
- Site has many assets, jobs, documents, and compliance items
- Asset has many service records and compliance items
- Maintenance plans generate jobs
- Jobs produce reports, actions, and billing events
- Users belong to organisations and can be restricted to specific sites or modules

---

## 16. Integrations

### Priority integrations
- Stripe for payments and subscription billing
- Xero / QuickBooks / Sage for accounting sync or export
- email provider for notifications
- SMS provider for reminders
- calendar sync for scheduling
- cloud storage for document management

### Later integrations
- Power BI export layer
- Teams / Slack notifications
- e-signature provider
- sensor / IoT feeds
- building management systems
- access control systems

---

## 17. Reporting and analytics requirements

### Operational dashboards
- compliance status by site
- upcoming due work
- overdue visits
- job completion rate
- engineer utilisation
- defects raised vs resolved

### Commercial dashboards
- quote pipeline
- invoice ageing
- revenue by client
- recurring service contract value
- upsell opportunities

### Client dashboards
- site compliance score
- upcoming work
- open actions
- downloadable document summary

---

## 18. Notifications

Notification types:
- upcoming maintenance due
- compliance overdue
- engineer visit booked
- engineer arriving soon
- report uploaded
- quote awaiting approval
- invoice due soon
- invoice overdue
- training expiring
- certificate expiring
- action overdue

Channels:
- in-app
- email
- SMS in later phases

---

## 19. Success metrics

### Product KPIs
- number of active organisations
- number of active sites
- number of jobs completed through platform
- number of documents uploaded
- percentage of recurring schedules auto-generated
- client portal logins per month

### Outcome KPIs
- reduction in missed compliance dates
- reduction in admin time spent retrieving records
- faster quote approval time
- faster invoice collection time
- higher client retention
- increased training revenue per client

### Engagement KPIs
- weekly active admin users
- engineer mobile completion rate
- percentage of sites with full compliance setup
- document retrieval frequency

---

## 20. MVP scope

### Included in MVP
- multi-tenant organisation structure
- client and property setup
- asset register
- compliance dashboard
- recurring maintenance scheduling
- basic scheduler and job assignment
- report and document repository
- timeline / audit trail
- quote management
- invoice management
- client portal
- notifications and reminders
- basic analytics
- role-based permissions

### Excluded from MVP
- advanced route optimisation
- full offline mobile support
- advanced IoT integrations
- accredited training marketplace
- deep accounting integrations beyond basic sync or export
- procurement and stock management
- sophisticated AI features

---

## 21. Phased roadmap

## Phase 1 - MVP foundation
- tenant structure
- user roles and invites
- clients and sites
- assets
- compliance items
- recurring schedules
- scheduler
- documents
- reports
- quotes and invoices
- client portal
- reminders
- core dashboards

## Phase 2 - operational depth
- engineer mobile app
- digital signatures
- defects and corrective actions
- contract management
- online payments
- better analytics
- exports and integrations

## Phase 3 - expansion and monetisation
- training and accreditation
- white-label portals
- premium analytics suite
- compliance packs
- route optimisation
- predictive maintenance
- AI summaries and recommendations

---

## 22. Risks and considerations

- Compliance categories vary by industry, so templates must be configurable
- Multi-tenant security must be handled carefully from day one
- Scheduling logic can become complex quickly if overbuilt too early
- Mobile field workflows must remain simple or engineers will resist adoption
- Document storage and retrieval speed are critical for perceived product quality
- Finance and operations permissions need clear separation
- The client portal must feel simple even if the admin side is complex

---

## 23. Open product questions

- Which vertical should be targeted first: general FM, hospitality, fire safety, or mixed compliance?
- Does the first release need a dedicated engineer app, or can mobile web cover it initially?
- Which accounting platform matters most for the first customers?
- Is training a near-term upsell or a later platform expansion?
- Do clients need online payments in v1, or is invoice visibility enough?
- Should the first dashboard emphasise compliance risk or operational task flow?
- Will there be white-labeling for facilities companies from day one?

---

## 24. Suggested next documents

After PRD approval, create:
- sitemap and screen list
- database schema draft
- user roles matrix
- MVP backlog with epics and stories
- design system direction
- admin dashboard wireframes
- engineer mobile flow
- client portal flow
- notification and automation map
- go-to-market packaging and pricing

---

---

## 25. Phase 7 — Field Engineer Experience (PWA + Core Field Features)

> Priority: HIGHEST — this is what separates SiteSentriq from spreadsheets and legacy tools.

### 7.1 Progressive Web App (PWA)
- Add `manifest.json` with app name, icons, theme colour (#14b89a brand teal)
- Service worker for offline caching via Workbox (`vite-plugin-pwa`)
- "Add to Home Screen" install prompt on mobile browsers
- Offline queue for form submissions — sync automatically when back online
- Visual indicator: "X changes pending sync"

### 7.2 Digital Signatures
- Canvas-based signature pad on job completion screen
- Signature stored as PNG in Supabase Storage (`job-signatures` bucket)
- Rendered on service reports and invoice PDFs
- Dual signature support: customer sign-off + engineer confirmation
- Database: `jobs.customer_signature_url`, `jobs.engineer_signature_url`

### 7.3 Photo Annotation & Markup
- Draw on job photos: arrows, circles, rectangles, text labels
- Before/after photo pairing on job detail
- Photo gallery with lightbox view and zoom
- Canvas overlay editor with undo/redo
- Stored alongside original photo in Supabase Storage

### 7.4 Offline Job Completion
- Cache today's assigned jobs for offline access (IndexedDB)
- Queue job updates, photos, and signatures for background sync
- Conflict resolution: last-write-wins with server timestamp
- Service worker intercepts API calls when offline

### 7.5 GPS Location Capture
- Auto-capture engineer lat/lng on job check-in and check-out
- Store coordinates on job record
- Optional: show check-in location on property map
- Database: `jobs.checkin_lat`, `jobs.checkin_lng`, `jobs.checkout_lat`, `jobs.checkout_lng`, `jobs.checkin_at`, `jobs.checkout_at`

### 7.6 Web Push Notifications
- Web Push API for job assignments, schedule changes, urgent alerts
- Notification permission prompt on first login
- Supabase Edge Function sends push via `web-push` library
- Fallback to in-app notifications if push is denied

---

## 26. Phase 8 — Revenue & Payments

> Make the platform generate revenue and close the billing loop.

### 8.1 Stripe Integration
- Connect Stripe account from org settings page
- "Pay Now" button on invoices → Stripe Checkout session
- Stripe webhook → auto-update invoice status (paid/partially paid/failed)
- Payment history timeline on invoice detail
- Supabase Edge Function: `stripe-webhook/index.ts`
- Database: `invoices.stripe_payment_intent_id`, `invoices.stripe_checkout_url`

### 8.2 Resend Email Integration
- Wire existing `send-email` Edge Function with `RESEND_API_KEY` secret
- Invoice email reminders with PDF attachment
- Job confirmation emails to customers
- Engineer assignment notification emails
- Quote approval request emails to client contacts
- Overdue compliance alert emails (weekly digest)

### 8.3 Job Costing & Profitability
- Track materials, labour hours, and travel costs per job
- Cost vs revenue comparison on job detail page
- Profitability reports per client, per engineer, per job type
- Database: `job_costs` table (id, job_id, cost_type, description, quantity, unit_cost, total)

### 8.4 Recurring Jobs
- Auto-create jobs on a recurring schedule (weekly, fortnightly, monthly, quarterly, annually)
- Separate from PPM plans — simple "repeat this job" feature for ad-hoc recurring work
- Calendar view shows future recurring instances as ghost entries
- Database: `jobs.recurring_frequency`, `jobs.recurring_parent_id`

### 8.5 Parts & Inventory
- Parts database: name, SKU, unit cost, stock level, reorder threshold
- Link parts used to individual jobs with quantity
- Stock alerts when parts fall below reorder threshold
- Inventory value report
- Database: `parts` table, `job_parts` junction table

---

## 27. Phase 9 — Native Mobile App (Expo React Native)

> Full native experience for field engineers — camera, biometrics, true offline.

### 9.1 Expo Project Setup
- New `/mobile` directory with Expo SDK 52+
- Shared Supabase client configuration
- Auth flow with biometric login support (FaceID / fingerprint)
- React Navigation for screen routing
- Same design tokens (brand teal, navy, surfaces)

### 9.2 Engineer Job View
- Today's jobs list sorted by time, with map pins
- Job detail screen: checklist, notes, photos, signatures
- Swipe actions: check in → complete → flag issue
- Pull-to-refresh + real-time job updates

### 9.3 Camera & Media
- Native camera for job photos with flash control
- Photo annotation with drawing overlay (expo-drawing)
- Barcode/QR scanning for asset identification
- Video capture for complex issue documentation

### 9.4 Offline-First Architecture
- SQLite local database (expo-sqlite) for job data
- Background sync queue with retry logic
- Conflict resolution: server timestamp authority
- Offline indicator with pending sync count

### 9.5 Push Notifications
- `expo-notifications` for native push (APNs + FCM)
- Deep linking to specific job from notification tap
- Notification categories: urgent, assignment, reminder, update

---

## 28. Phase 10 — Intelligence & AI

> Differentiation features that no competitor in the FM space offers yet.

### 10.1 AI Scheduling Suggestions
- Analyse engineer skills, certifications, location proximity, and availability
- Suggest optimal engineer assignment for new jobs
- "Auto-schedule this week's unassigned jobs" one-click action
- Skill-gap warnings: "No certified gas engineer available for this date"

### 10.2 Natural Language Reports
- "Show me all failed gas inspections last quarter"
- AI parses natural language → generates Supabase query → renders results
- Claude API via Supabase Edge Function
- Saved report templates from successful queries

### 10.3 Predictive Compliance Alerts
- Analyse compliance expiry patterns across all clients
- Predict which items will likely be missed based on scheduling gaps
- Proactive alerts: "3 fire risk assessments due next month, only 1 is scheduled"
- Risk score per property

### 10.4 Automated Report Generation
- Monthly compliance summary per client (auto-generated PDF)
- Engineer performance reports with KPIs
- AI-written narrative sections explaining trends and anomalies
- Auto-email to client contacts on schedule

---

## 29. Phase 11 — Advanced Integrations

> Enterprise readiness and ecosystem connectivity.

### 11.1 Accounting Sync (Xero / QuickBooks)
- OAuth connection from org settings
- Two-way invoice sync: create in SiteSentriq → appears in accounting software
- Payment status sync back from accounting
- Chart of accounts mapping

### 11.2 SMS Notifications (Twilio)
- "Engineer on the way" SMS to customers with ETA
- Appointment reminder SMS (24h before)
- Urgent compliance alert SMS
- SMS delivery status tracking

### 11.3 Calendar Sync
- Engineer jobs → Google Calendar / Outlook Calendar (CalDAV)
- Two-way sync: calendar changes reflect in scheduler
- Colour-coded by job type/priority

### 11.4 Webhook API
- Outbound webhooks on key events: job completed, invoice paid, compliance expired
- Webhook management UI in settings (URL, events, secret)
- Retry logic with exponential backoff
- Zapier / Make / n8n compatible

### 11.5 White-Label Portal
- Custom domain per organisation (CNAME)
- Custom logo, colours, and branding on client portal
- Branded email templates
- Removable "Powered by SiteSentriq" badge on premium plan

---

## 30. Marketing Website

### Structure
- **Home** (`/`) — Hero with product screenshot, feature highlights, how it works, social proof, CTA
- **Features** (`/features`) — Feature grid with all 12+ modules, comparison vs manual processes
- **Pricing** (`/pricing`) — 3 tiers (Starter £29/user, Professional £49/user, Enterprise custom), feature comparison table, FAQ
- **About** (`/about`) — Mission, vision, team, company story
- **Contact** (`/contact`) — Contact form, email, social links

### Pricing Tiers (Suggested)
| Feature | Starter | Professional | Enterprise |
|---------|---------|-------------|------------|
| Users | Up to 5 | Up to 25 | Unlimited |
| Properties | Up to 20 | Up to 100 | Unlimited |
| Client portal | ✓ | ✓ | ✓ |
| Compliance tracking | ✓ | ✓ | ✓ |
| PPM scheduling | ✓ | ✓ | ✓ |
| Digital signatures | — | ✓ | ✓ |
| Stripe payments | — | ✓ | ✓ |
| Job costing | — | ✓ | ✓ |
| AI reports | — | — | ✓ |
| Xero/QuickBooks sync | — | — | ✓ |
| White-label portal | — | — | ✓ |
| Support | Email | Priority | Dedicated |

---

## 31. Mobile Strategy

### Phase 1: PWA (Immediate — Phase 7)
- Service worker + manifest for installability
- Offline caching of app shell + API data
- Background sync for field submissions
- Works on any mobile browser without app store

### Phase 2: Native App (Phase 9)
- Expo React Native for iOS + Android
- Native camera, biometrics, push notifications
- App Store + Google Play distribution
- Offline-first with SQLite local database

---

## 32. Competitive Positioning

### Advantages over ServiceM8, Jobber, Simpro, Commusoft, BigChange
- Modern UI/UX (Cal.com + Amplitude design system) vs dated competitor interfaces
- Built on Supabase (realtime, RLS, edge functions) vs legacy backends
- Multi-tenant from day 1 with proper RLS isolation
- Compliance-first approach (proof storage, audit trails, type categories)
- Contracts & service agreements module (rare among competitors)
- Actions/defects tracking (not standard in field service tools)

### Key Differentiators to Market
1. **Compliance proof storage** — not just checkboxes, actual documents and photos
2. **Client portal with real-time visibility** — clients see everything, approve quotes, pay invoices
3. **AI-powered reporting and scheduling** — no competitor in this space has this yet
4. **Modern developer-grade infrastructure** — fast, secure, scalable from day one

---

## 33. Summary

SiteSentriq (Facilities OS) is a serious B2B SaaS opportunity with a strong operational core and multiple future monetisation paths. The MVP (Phases 1-5) is complete with full CRUD for all modules, RBAC, multi-tenancy, realtime notifications, and a client portal. Phases 7-11 add field engineer tools (PWA, signatures, GPS), revenue features (Stripe, email), a native mobile app, AI intelligence, and enterprise integrations. The marketing website and pricing tiers support go-to-market. The platform is positioned to compete with established players by leading with compliance, modern UX, and AI capabilities.


---
---

# PART B — Implementation Status (April 2026)

> This section is the **single source of truth** for what's shipped, what's deferred,
> and what's next. Updated every wave. Sections 1-33 above describe the original
> product vision; Part B describes the live product as of `v0.12.0`.

## B1. Where we are

- **Live URL:** https://site-sentriq.vercel.app/
- **Version:** `0.12.0` (semver — `0.X.0` per wave, `0.X.Y` for inter-wave fixes; `1.0.0` = first paid customer + ICO compliance cert)
- **Build pipeline:** GitHub → Vercel auto-deploy on master push (working since `74a121a`)
- **Database:** Supabase (`vphjwvleffuwwgbjxups`), 34 migrations applied, RLS on every table
- **Edge functions deployed:** 21
- **Total tasks shipped:** 110+ across 12 waves
- **Production-ready features:** 16
- **Real users:** 2 (founder + 1 collaborator) on the SiteSentriq org

## B2. Module-by-module shipped status

Map of every PRD module (sections 10.x and Phase 7-11) to its current state. **Status legend:** `✅ shipped` · `🟡 partial` · `🔴 not started` · `⏸ deferred`.

### Multi-tenancy & access (PRD §10.1, §6)
| Item | Status | Notes |
|---|---|---|
| Multi-tenant isolation via Supabase RLS | ✅ | Every table has org-scoped policies |
| 7 user roles defined | ✅ | super_admin · org_admin · scheduler · engineer · finance · client_admin · auditor |
| Permission system (`hasPermission`) | ✅ | 35+ permission strings |
| RoleRoute guard | ✅ | Auth-loading-aware (fixed v0.12.0+1) |
| SSO (Microsoft Entra + Google Workspace) | ✅ | Wave 7C — JIT provisioning by domain |
| 2FA on login | ⏸ **Deferred** | TOTP/WebAuthn — future build |

### Compliance management (PRD §10.4)
| Item | Status | Notes |
|---|---|---|
| Compliance items CRUD | ✅ | UK types: CP12, EICR, FRA, legionella, etc |
| Auto-renewal alerts (30/14/3 days) | ✅ | Wave 4 notifications |
| Proof upload via Supabase Storage | ✅ | Phase 2 |
| Compliance type categories | ✅ | 16 predefined types |
| **AI compliance suggester** | ✅ | Wave 9A — Claude Haiku 4.5, audit-logged |
| **Auto-generated PDF certificates** | ✅ | Wave 8B — 4 templates (Gas Safety / EICR / FRA / Generic). Real PDF rendering deferred to ops (templates ship as printable HTML; drop a Browserless/Playwright into the edge function to upgrade) |

### Maintenance & scheduling (PRD §10.5, §10.6)
| Item | Status | Notes |
|---|---|---|
| PPM auto-job generation | ✅ | Phase 5 — fixed/rolling modes |
| Visual scheduler (drag-drop) | ✅ | Phase 2 |
| Engineer availability + time windows | ✅ | Phase 2 |
| **Auto-assignment rules engine** | ✅ | Wave 8D — skill × distance × availability × familiarity scoring |
| Route optimisation | 🟡 | Single-engineer view only; multi-engineer route optimiser deferred |

### Job lifecycle (PRD §10.7)
| Item | Status | Notes |
|---|---|---|
| Job CRUD + status workflow | ✅ | Phase 1 |
| Photo capture + storage | ✅ | Phase 2 |
| **GPS check-in** | ✅ | Wave 8A — Haversine 200m radius |
| **On-site signature capture** | ✅ | Wave 8A — pen-on-glass canvas |
| **Mobile field-engineer mode** | ✅ | Phase 6 — offline queue |
| **SLA tracking** | ✅ | Wave 10 — per-priority response/completion targets, breach detection |
| **Time tracking on jobs** | ✅ | Wave 12 — travel/on-site/admin/break, billable rates, week timesheet |
| **Stock/parts tracking** | ✅ | Wave 9D — auto-deduct on job complete |
| Auto-quote on defect detection | 🟡 | Manual flow only; auto-quote deferred |

### Workforce (PRD §10.8)
| Item | Status | Notes |
|---|---|---|
| Engineers + subcontractors | ✅ | Phase 5 |
| Accreditations (Gas Safe, NICEIC, F-Gas, etc) | ✅ | Phase 5 |
| Skills + capacity hours | ✅ | Wave 8D |
| Engineer signature image | ✅ | Wave 8B — for certificates |

### Finance (PRD §10.9, §10.10)
| Item | Status | Notes |
|---|---|---|
| Quotes → jobs conversion | ✅ | Phase 2 |
| Invoice CRUD + PDF | ✅ | Phase 2 — print-style PDF |
| Stripe billing (subscriptions, customer portal) | ✅ | Wave 6B |
| **Xero + QuickBooks accounting push** | ✅ | Wave 7B — OAuth, paid status sync |
| **Pull from time entries on invoice** | ✅ | Wave 12 |
| Bulk send invoices | 🔴 | Single-invoice send only |
| Multi-currency | 🔴 | GBP only — future |

### Client experience (PRD §10.11)
| Item | Status | Notes |
|---|---|---|
| Client portal (read-only) | ✅ | Phase 2 |
| Site switcher | ✅ | Phase 2 |
| Quote approval flow | ✅ | Phase 2 |
| **White-label per-org branding** | ✅ | Wave 12 — logo, accent colour, support email/phone, welcome message. Plan-gated to Growth+ |
| **Tenant portal (clients-of-clients)** | 🔴 **High-value future build** | See §B5 below |

### Reporting & data (PRD §10.12)
| Item | Status | Notes |
|---|---|---|
| Dashboards | ✅ | Phase 2 + Phase 6 hero |
| **Insights** (compliance rate, SLA performance, capacity, at-risk clients) | ✅ | Wave 6 — plan-gated to Growth |
| **Custom report builder** (drag-drop, 8 datasets) | ✅ | Wave 9B |
| Scheduled report dispatch | 🟡 | Schedules persist; runner needs pg_cron wiring (deferred to ops) |
| **Org-wide audit log search** | ✅ | Wave 8C |

### Communication (PRD §10.13)
| Item | Status | Notes |
|---|---|---|
| In-app notifications + bell | ✅ | Phase 2 |
| Email digest (Resend) | ✅ | Phase 7 |
| **Slack notifications** | ✅ | Wave 9C — Block Kit, per-channel rules |
| Calendar sync (iCal + Google) | ✅ | Wave 7A |
| **WhatsApp Business** | ⏸ **Deferred** | UK FM standard channel — future build |
| SMS notifications | ⏸ Deferred | Twilio integration — future build |

### Compliance + privacy (NEW — not in original PRD)
| Item | Status | Notes |
|---|---|---|
| **GDPR data export + right-to-be-forgotten** | ✅ | Wave 12 — admin Data & Privacy panel + user self-service. Soft anonymisation preserves audit trail. (Backend live, UI integration pending HeroUI prop fixes — deferred 1 commit) |
| ICO registration | 🔴 | Required before commercial launch |
| Cookie consent banner | 🔴 | Required for marketing site |

### Operational tooling
| Item | Status | Notes |
|---|---|---|
| Test suite (Vitest + Playwright) | ✅ | Wave 6A — 65/71 passing (6 cmd-K palette tests deferred) |
| Sentry observability | ✅ | Wave 6D |
| Onboarding wizard | ✅ | Wave 6C |
| **Bulk CSV import wizard** | ✅ | Wave 11 — 5 entity types, fuzzy auto-mapping |
| **Deploy status DX panel** | ✅ | Wave 12 — surfaces failed Vercel deploys |
| Diagnostics dashboard (`/health`) | ✅ | Phase 6 |

### Intelligence
| Item | Status | Notes |
|---|---|---|
| AI compliance type suggestion | ✅ | Wave 9A |
| AI report drafting | 🟡 | Custom report builder is rule-based; AI drafting on roadmap |
| **Predictive maintenance ML** | ⏸ **Deferred** | Asset failure prediction from history — future build |
| AI-powered scheduling | 🟡 | Auto-assignment is rule-based, not ML — sufficient for now |

## B3. Architecture as built

```
React 19 + Vite 8 + Tailwind v4 + HeroUI v3
├── /                    Marketing (home/features/pricing/about/contact)
├── /login, /register, /forgot-password, /invite, /onboarding
├── /portal              Client portal (white-labelable)
└── /dashboard           App
    ├── /                Dashboard hero + KPI strip
    ├── /clients         CRM
    ├── /properties      Site portfolio
    ├── /assets          Asset register
    ├── /compliance      Compliance items + AI suggester
    ├── /maintenance     PPM plans
    ├── /scheduler       Drag-drop calendar
    ├── /jobs            Job board + detail (with SLA chip + Time card)
    ├── /field           Engineer mobile mode
    ├── /reports         Reports + custom report builder
    ├── /documents       Document store
    ├── /analytics       Analytics
    ├── /insights        Plan-gated insights (Growth+)
    ├── /audit           Org-wide audit log search
    ├── /auto-assign     Rules engine admin
    ├── /stock           Stock & parts
    ├── /timesheet       Engineer's own timesheet
    ├── /import          Bulk CSV import wizard
    ├── /integrations    Hub — Calendar/Xero/QB/SSO/Slack
    ├── /actions         Defects/actions module
    ├── /contracts       Service agreements
    └── /settings        Profile · Org · Users · Roles · Billing · SLA
                          · Branding · Data&Privacy · Integrations
```

**Backend (Supabase):**
- 34 migrations · 60+ tables · RLS on all
- 21 edge functions (auth, billing, comms, accounting, AI, exports, etc)
- 5 storage buckets: `field-signatures`, `certificates`, `gdpr-exports`, `org-branding`, `engineer-documents`

## B4. Tenant portal — future build proposed

The PRD's Section 6.6 describes "Client admin / Site manager" — that's the existing `/portal` tier. **What's missing is the level below:** the actual tenant or pub manager *at* a property who needs to raise call-outs and see their site's status.

### Proposed 4-tier hierarchy (Wave 14)

```
Organisation                     (FM company — you)
└── Client                       (commercial customer — e.g. Greene King)
    └── Property                 (one site — e.g. The Fox Inn)
        └── Property contact     ← NEW: site-level user (pub manager)
```

### Required build
- Migration `XXXXX_property_contacts.sql` — `property_contacts` table linking auth users to specific properties (vs the org-wide `client_admin` role)
- New auth scope `tenant_user` with row-level access ONLY to their property's data
- Site-level portal at `/site` (separate from `/portal`):
  - Raise call-out (one form, photo upload, priority)
  - View this property's compliance status
  - Recent visit timeline + photos
  - Approve quotes for this site only
- Email-invite flow per-property (FM admin invites tenant emails)
- Tenant actions visible in the FM's main timeline

**Effort:** ~5 days · **Wave:** 14 (after Wave 13 below)

## B5. Roadmap — what's next

### Wave 13 — closing the bug-tail + GDPR UI integration
- [ ] Merge `wave12/gdpr` into master with HeroUI prop fixes (`color="primary"` → `variant="primary"`, drop unsupported variants)
- [ ] Re-run cmd-K palette tests against new universal-search API (the 6 deferred tests since Wave 6)
- [ ] Real PDF rendering — wire Browserless or Playwright on Vercel Function for `generate-certificate`
- [ ] Push notifications backend — VAPID keypair + send logic (currently UI flagged off)
- [ ] pg_cron runner for scheduled reports (Wave 9B persists schedules; cron polls them)

### Wave 14 — tenant portal (see §B4)

### Wave 15 — deferred features the user has flagged for "later"
- [ ] **2FA on login** — TOTP via `auth.mfa.*` Supabase APIs
- [ ] **WhatsApp Business integration** — outbound notifications + reply parsing into job comments
- [ ] **Predictive maintenance ML** — train on `field_events` + `service_reports` history; surface "this asset will fail in ~30 days" predictions

### Wave 16 — enterprise hardening
- True SCIM provisioning (currently JIT-only on first SSO login)
- Multi-currency (org-level default + per-client override)
- ICO registration + cookie consent banner
- White-label deeper: custom domains for the client portal, custom email sender domain
- API + webhooks for Growth tier customers (named in pricing copy, not yet implemented)
- Advanced search / global search beyond cmd-K

### Wave 17 — gross-margin levers
- Multi-engineer route optimiser (Mon-Fri schedule that minimises travel)
- Auto-quote on defect detection (engineer logs defect → AI drafts quote → ops approves)
- Asset health score (rolling fail rate + age + last service → traffic-light per asset)
- Tenant retention dashboard (which properties have the most reactive jobs — early churn signal)

## B6. What's required before we charge customers

Before we can take real money, these must land. Most are external service config, not code.

| Blocker | Owner | Effort |
|---|---|---|
| ICO registration | Founder | £40, 1 hour, online form |
| Cookie consent banner on marketing site | Wave 13 | 1 day |
| Stripe products + webhook live | Founder + ops | 2 hours |
| Resend domain DNS verify | Founder | 30 min |
| Anthropic API key in Supabase secrets | Founder | 5 min |
| Slack app + scopes published | Founder | 1 hour |
| Sentry project + DSN | Founder | 30 min |
| Real PDF rendering for certificates | Wave 13 | 1 day |
| Privacy policy + Terms of Service | Founder + lawyer | 1 week |
| Pen test (or self-attested basic security questionnaire) | Founder | 2-4 weeks |

## B7. Versioning convention

- **Pre-1.0:** `0.X.0` per wave, `0.X.Y` for fixes between waves
- **1.0.0:** First paying customer + ICO registered + privacy policy live
- **2.0.0:** Multi-tenant white-label — any FM company can resell on their own domain
- Sentry releases tagged with the same version
- CHANGELOG.md captures every change with the version that introduced it
- Sidebar footer shows the current version (`v0.12.0`) — useful for support tickets

## B8. Honest gaps

Things shipped to "the right idea" rather than "production-grade" — flagged for a future polish wave:

- **Cmd-K palette tests** — 6 tests skipped, universal search API was rewritten in Wave 6, tests need to follow
- **PDF certificate rendering** — currently HTML; needs Browserless/Playwright for binary PDF
- **Push notifications** — UI shipped, backend stubbed (VAPID keys never generated)
- **Scheduled reports** — schedules persist, runner deferred to ops
- **GDPR UI integration** — backend live, frontend pages pending HeroUI prop cleanup
- **Audit log fan-out** — view UNIONs 4 tables, but doesn't include `field_events` or `time_entries` yet
- **HeroUI v3 quirks** — house style uses plain `<div>` for cards (no `<Card>` component); some agents have written `color="primary"` on Buttons that don't accept it (variant-only API)

## B9. Update protocol for this section

When a new wave ships:
1. Bump `package.json` version (`0.X.0`)
2. Add a CHANGELOG.md entry under the new version
3. Update the relevant table in §B2
4. Move completed items from §B5 roadmap to §B2
5. Add a wave summary under §B5 with what's next
6. Commit as `docs(prd): log Wave X — <theme>`

import { createHashRouter, RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/app-shell'
import { ArdentProvider, useArdent } from '@/data/ardent'
import { Dashboard } from '@/routes/dashboard'
import { Jobs } from '@/routes/jobs'
import { JobDetail } from '@/routes/job-detail'
import { Schedule } from '@/routes/schedule'
import { Customers, CustomerDetail } from '@/routes/customers'
import { Money } from '@/routes/money'
import { Approvals } from '@/routes/approvals'
import { Rules } from '@/routes/rules'
import { Certificates } from '@/routes/certificates'
import { Crew } from '@/routes/crew'
import { Settings } from '@/routes/settings'
import { Questions } from '@/routes/questions'
import { FieldOnly, SignIn } from '@/routes/sign-in'
import { Callout } from '@/routes/callout'
import { NewJob } from '@/routes/new-job'
import { QuoteDetail } from '@/routes/quote'
import { InvoiceDetail, NewInvoice } from '@/routes/invoice'
import { CoreWall } from '@/routes/wall'
import { PaymentsSettings } from '@/routes/payments-settings'
import { PayPage, PlanSign, StripeSignUp } from '@/routes/stripe-test'

const router = createHashRouter([
  { path: 'wall', element: <CoreWall /> },
  // The demo's stand-ins for Stripe's own pages, outside the app like the wall.
  { path: 'stripe-test/sign-up', element: <StripeSignUp /> },
  { path: 'pay/:id', element: <PayPage /> },
  { path: 'plan/:id', element: <PlanSign /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'jobs', element: <Jobs /> },
      { path: 'jobs/new', element: <NewJob /> },
      { path: 'jobs/:id', element: <JobDetail /> },
      { path: 'callout', element: <Callout /> },
      { path: 'quotes/:id', element: <QuoteDetail /> },
      { path: 'invoices/new', element: <NewInvoice /> },
      { path: 'invoices/:id', element: <InvoiceDetail /> },
      { path: 'schedule', element: <Schedule /> },
      { path: 'customers', element: <Customers /> },
      { path: 'customers/:id', element: <CustomerDetail /> },
      { path: 'money', element: <Money /> },
      { path: 'approvals', element: <Approvals /> },
      { path: 'approvals/rules', element: <Rules /> },
      { path: 'certificates', element: <Certificates /> },
      { path: 'crew', element: <Crew /> },
      { path: 'settings', element: <Settings /> },
      { path: 'settings/questions', element: <Questions /> },
      { path: 'settings/payments', element: <PaymentsSettings /> },
    ],
  },
])

function Gate() {
  const { phase, me } = useArdent()
  if (phase === 'starting') return null
  if (phase === 'signed_out') return <SignIn />
  if (me?.role === 'field') return <FieldOnly />
  return <RouterProvider router={router} />
}

export default function App() {
  return (
    <TooltipProvider delayDuration={150}>
      <ArdentProvider>
        <Gate />
      </ArdentProvider>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: '!bg-raised !text-foreground !font-sans !rounded-lg !shadow-2xl !border-0',
            description: '!text-muted',
          },
        }}
      />
    </TooltipProvider>
  )
}

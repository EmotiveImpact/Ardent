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
import { Certificates } from '@/routes/certificates'
import { Crew } from '@/routes/crew'
import { Settings } from '@/routes/settings'
import { FieldOnly, SignIn } from '@/routes/sign-in'

const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'jobs', element: <Jobs /> },
      { path: 'jobs/:id', element: <JobDetail /> },
      { path: 'schedule', element: <Schedule /> },
      { path: 'customers', element: <Customers /> },
      { path: 'customers/:id', element: <CustomerDetail /> },
      { path: 'money', element: <Money /> },
      { path: 'certificates', element: <Certificates /> },
      { path: 'crew', element: <Crew /> },
      { path: 'settings', element: <Settings /> },
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

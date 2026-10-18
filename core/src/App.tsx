import { createHashRouter, RouterProvider } from 'react-router'
import { Boxes, HardHat, Settings, Users } from 'lucide-react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/app-shell'
import { Dashboard } from '@/routes/dashboard'
import { Jobs } from '@/routes/jobs'
import { JobDetail } from '@/routes/job-detail'
import { Schedule } from '@/routes/schedule'
import { Placeholder } from '@/routes/placeholder'
import { Money } from '@/routes/money'
import { Certificates } from '@/routes/certificates'

const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'jobs', element: <Jobs /> },
      { path: 'jobs/:id', element: <JobDetail /> },
      { path: 'schedule', element: <Schedule /> },
      {
        path: 'customers',
        element: <Placeholder icon={Users} title="Customers" blurb="Homeowners, landlords and agents, with every site, job and balance in one place." />,
      },
      { path: 'money', element: <Money /> },
      { path: 'certificates', element: <Certificates /> },
      {
        path: 'crew',
        element: <Placeholder icon={HardHat} title="Crew and vans" blurb="Who is qualified for what, whose card expires next, and which van is where." />,
      },
      {
        path: 'stock',
        element: <Placeholder icon={Boxes} title="Stock" blurb="What is on each van and in the yard, and what to reorder." />,
      },
      {
        path: 'settings',
        element: <Placeholder icon={Settings} title="Settings" blurb="Business details, rates, VAT and team access." />,
      },
    ],
  },
])

export default function App() {
  return (
    <TooltipProvider delayDuration={150}>
      <RouterProvider router={router} />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: '!bg-raised !border-line-strong !text-foreground !font-sans !rounded-lg !shadow-2xl',
            description: '!text-muted',
          },
        }}
      />
    </TooltipProvider>
  )
}

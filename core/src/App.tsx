import { createBrowserRouter, RouterProvider } from 'react-router'
import { Boxes, FileBadge2, HardHat, PoundSterling, Settings, Users } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/app-shell'
import { Dashboard } from '@/routes/dashboard'
import { Jobs } from '@/routes/jobs'
import { JobDetail } from '@/routes/job-detail'
import { Schedule } from '@/routes/schedule'
import { Placeholder } from '@/routes/placeholder'

const router = createBrowserRouter([
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
      {
        path: 'money',
        element: <Placeholder icon={PoundSterling} title="Quotes and invoices" blurb="Price a job on site, send it from the van, get paid before you leave." />,
      },
      {
        path: 'certificates',
        element: <Placeholder icon={FileBadge2} title="Certificates" blurb="CP12, EICR, PAT and service records, with reminders before anything lapses." />,
      },
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
    </TooltipProvider>
  )
}

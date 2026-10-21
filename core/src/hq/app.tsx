import { createHashRouter, RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { HqProvider, useHq } from './data'
import { HqShell } from './shell'
import { SignIn } from './sign-in'
import { Live } from './live'
import { Wall } from './wall'
import { Firms } from './firms'
import { Firm } from './firm'
import { Playbook } from './playbook'
import { Shared } from './shared'
import { Usage } from './usage'
import { Payments } from './payments'
import { Activity } from './activity'

/* Ardent HQ: the app Ardent's own team uses to look after every firm on Ardent. */

const router = createHashRouter([
  { path: 'wall', element: <Wall /> },
  {
    element: <HqShell />,
    children: [
      { index: true, element: <Live /> },
      { path: 'firms', element: <Firms /> },
      { path: 'firms/:id', element: <Firm /> },
      { path: 'playbook', element: <Playbook /> },
      { path: 'shared', element: <Shared /> },
      { path: 'payments', element: <Payments /> },
      { path: 'usage', element: <Usage /> },
      { path: 'activity', element: <Activity /> },
      { path: '*', element: <Live /> },
    ],
  },
])

function Gate() {
  const { phase } = useHq()
  if (phase === 'starting') return null
  if (phase === 'signed_out') return <SignIn />
  return <RouterProvider router={router} />
}

export default function HqApp() {
  return (
    <TooltipProvider delayDuration={150}>
      <HqProvider>
        <Gate />
      </HqProvider>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: '!bg-raised !text-foreground !font-sans !rounded-lg !shadow-2xl !border-0',
            description: '!text-muted',
            actionButton: '!bg-foreground !text-background',
          },
        }}
      />
    </TooltipProvider>
  )
}

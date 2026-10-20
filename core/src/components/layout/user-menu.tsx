import { useNavigate } from 'react-router'
import { LogOut, RotateCcw, Settings } from 'lucide-react'
import { initials } from '@kit'
import { useArdent } from '@/data/ardent'
import { act } from '@/lib/act'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const roleWord = { owner: 'Owner', office: 'Office', field: 'Field' } as const

/** Who is signed in, with settings, the demo reset and sign out. */
export function UserMenu({ side = 'right', className }: { side?: 'right' | 'bottom'; className?: string }) {
  const { me, signOut, reset, mode } = useArdent()
  const navigate = useNavigate()
  if (!me) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${me.user.name}, account`}
        className={cn('flex size-8 items-center justify-center rounded-full bg-raised font-mono text-[10px] text-foreground outline-none hover:bg-[#262626] focus-visible:ring-2 focus-visible:ring-ring/60', className)}
      >
        {initials(me.user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-60">
        <div className="px-2 py-2">
          <p className="text-[13px] text-foreground">{me.user.name}</p>
          <p className="text-[12px] text-muted">{me.user.email}</p>
          <p className="mt-1.5 text-[12px] text-faint">
            {roleWord[me.role]} at {me.organisation.name}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings /> Settings
        </DropdownMenuItem>
        {mode === 'demo' && reset && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Demo firm</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => void act(reset(), 'Demo put back as it started')}>
              <RotateCcw /> Start the demo again
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

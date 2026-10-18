import * as React from 'react'
import { Tooltip as TP } from 'radix-ui'
import { cn } from '@/lib/utils'

const TooltipProvider = TP.Provider

function Tooltip({ content, children, side = 'right' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <TP.Root>
      <TP.Trigger asChild>{children}</TP.Trigger>
      <TP.Portal>
        <TP.Content
          side={side}
          sideOffset={8}
          className={cn('z-50 rounded-md border border-line-strong bg-raised px-2 py-1 text-xs text-foreground shadow-xl')}
        >
          {content}
        </TP.Content>
      </TP.Portal>
    </TP.Root>
  )
}

export { Tooltip, TooltipProvider }

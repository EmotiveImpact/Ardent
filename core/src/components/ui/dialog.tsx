import * as React from 'react'
import { Dialog as D } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = D.Root
const DialogTrigger = D.Trigger
const DialogClose = D.Close

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]" />
      <D.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line-strong bg-surface p-1.5 shadow-2xl shadow-black/70 outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <D.Close className="absolute top-3.5 right-3.5 rounded-md p-1 text-muted hover:bg-raised hover:text-foreground">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </D.Close>
      </D.Content>
    </D.Portal>
  )
}

const DialogTitle = ({ className, ...props }: React.ComponentProps<typeof D.Title>) => (
  <D.Title className={cn('text-[15px] font-medium', className)} {...props} />
)
const DialogDescription = ({ className, ...props }: React.ComponentProps<typeof D.Description>) => (
  <D.Description className={cn('text-[13px] text-muted', className)} {...props} />
)

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription }

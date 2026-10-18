import * as React from 'react'
import { DropdownMenu as DM } from 'radix-ui'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const DropdownMenu = DM.Root
const DropdownMenuTrigger = DM.Trigger
const DropdownMenuRadioGroup = DM.RadioGroup

function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-44 overflow-hidden rounded-lg border border-line-strong bg-popover p-1 text-popover-foreground shadow-2xl shadow-black/60',
          className,
        )}
        {...props}
      />
    </DM.Portal>
  )
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn(
        'relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none select-none data-[highlighted]:bg-accent data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof DM.RadioItem>) {
  return (
    <DM.RadioItem
      className={cn(
        'relative flex cursor-default items-center rounded-md py-1.5 pr-2 pl-7 text-[13px] outline-none select-none data-[highlighted]:bg-accent',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DM.ItemIndicator>
          <Check className="size-3.5" />
        </DM.ItemIndicator>
      </span>
      {children}
    </DM.RadioItem>
  )
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn('px-2 py-1.5 text-[11px] uppercase tracking-wider text-faint', className)} {...props} />
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DM.Separator>) {
  return <DM.Separator className={cn('-mx-1 my-1 h-px bg-line', className)} {...props} />
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
}

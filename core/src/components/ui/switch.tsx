import * as React from 'react'
import { Switch as S } from 'radix-ui'
import { cn } from '@/lib/utils'

function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-raised transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=checked]:bg-ember',
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-foreground transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-black" />
    </S.Root>
  )
}

export { Switch }

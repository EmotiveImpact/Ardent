import * as React from 'react'
import { fieldClass } from '@/components/ui/field'
import { cn } from '@/lib/utils'

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(fieldClass, className)}
      {...props}
    />
  )
}

export { Input }

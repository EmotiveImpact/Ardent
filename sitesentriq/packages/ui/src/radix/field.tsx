/**
 * Form-field replacements for @haumea/ui — HeroUI-compatible API.
 *  <TextField isInvalid isRequired isReadOnly isDisabled value onChange name>
 *    <Label/> <Input/> <FieldError/>
 *  </TextField>
 * Field-level value/disabled/readOnly props flow to a bare <Input/> via context
 * (the HeroUI v3 pattern), while inline props on <Input/> still win. Flat fields
 * per docs/DESIGN.md.
 */
import { createContext, forwardRef, useContext, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type LabelHTMLAttributes, type ChangeEvent } from 'react'
import { cn } from './primitives'

interface FieldCtx {
  isInvalid?: boolean
  isRequired?: boolean
  isDisabled?: boolean
  isReadOnly?: boolean
  value?: string | number
  defaultValue?: string | number
  name?: string
  type?: string
  placeholder?: string
  onChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
}
const FieldContext = createContext<FieldCtx>({})

export interface TextFieldProps extends FieldCtx {
  className?: string
  children?: ReactNode
}
export function TextField({ className, children, ...ctx }: TextFieldProps) {
  return (
    <FieldContext.Provider value={ctx}>
      <div className={cn('flex flex-col gap-1.5', className)}>{children}</div>
    </FieldContext.Provider>
  )
}

export function Label({ className, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  const { isRequired } = useContext(FieldContext)
  return (
    <label className={cn('block text-caption font-medium text-text-secondary', className)} {...rest}>
      {children}
      {isRequired && <span className="ml-0.5 text-status-overdue">*</span>}
    </label>
  )
}

const FIELD =
  'w-full rounded-lg border bg-[var(--field-background)] text-text-primary placeholder:text-[var(--field-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)] disabled:opacity-60 read-only:opacity-80'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  const ctx = useContext(FieldContext)
  const merged = {
    value: ctx.value,
    defaultValue: ctx.defaultValue,
    name: ctx.name,
    type: ctx.type,
    placeholder: ctx.placeholder,
    disabled: ctx.isDisabled,
    readOnly: ctx.isReadOnly,
    onChange: ctx.onChange,
    ...rest, // inline props on <Input/> win
  }
  return (
    <input
      ref={ref}
      className={cn(FIELD, 'h-9 px-3 text-label', ctx.isInvalid ? 'border-status-overdue' : 'border-[var(--field-border)]', className)}
      aria-invalid={ctx.isInvalid || undefined}
      {...merged}
    />
  )
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...rest },
  ref,
) {
  const ctx = useContext(FieldContext)
  const merged = {
    value: ctx.value,
    defaultValue: ctx.defaultValue,
    name: ctx.name,
    placeholder: ctx.placeholder,
    disabled: ctx.isDisabled,
    readOnly: ctx.isReadOnly,
    onChange: ctx.onChange,
    ...rest,
  }
  return (
    <textarea
      ref={ref}
      className={cn(FIELD, 'px-3 py-2 text-label', ctx.isInvalid ? 'border-status-overdue' : 'border-[var(--field-border)]', className)}
      aria-invalid={ctx.isInvalid || undefined}
      {...merged}
    />
  )
})

export function FieldError({ className, children }: { className?: string; children?: ReactNode }) {
  return <p className={cn('text-caption text-status-overdue', className)}>{children}</p>
}

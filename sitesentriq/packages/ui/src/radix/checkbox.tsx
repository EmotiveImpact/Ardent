/**
 * Checkbox — Radix-backed, tokened, theme-aware. Replaces the native
 * `<input type="checkbox">` + accentColor approach so the box, check glyph,
 * radius, focus ring, and indeterminate state are drawn by us (identical on
 * every OS) and follow the active --accent rather than hardcoded brand-orange.
 */
import { forwardRef } from 'react'
import * as RCheckbox from '@radix-ui/react-checkbox'
import { cn } from './primitives'

export interface CheckboxProps {
  checked?: boolean
  /** Renders the dash glyph; Radix treats this as a third state. */
  indeterminate?: boolean
  onCheckedChange?: (checked: boolean) => void
  isDisabled?: boolean
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
  id?: string
}

const CheckGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)
const DashGlyph = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" aria-hidden="true">
    <path d="M5 12h14" />
  </svg>
)

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { checked, indeterminate, onCheckedChange, isDisabled, size = 'md', className, id, ...aria },
  ref,
) {
  const state: boolean | 'indeterminate' = indeterminate && !checked ? 'indeterminate' : !!checked
  const box = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  return (
    <RCheckbox.Root
      ref={ref}
      id={id}
      checked={state}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      disabled={isDisabled}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded border bg-[var(--field-background)] border-border-strong text-white transition-colors',
        'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-1',
        'data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)]',
        'data-[state=indeterminate]:border-[var(--accent)] data-[state=indeterminate]:bg-[var(--accent)]',
        box,
        className,
      )}
      {...aria}
    >
      <RCheckbox.Indicator>
        {state === 'indeterminate' ? <DashGlyph /> : <CheckGlyph />}
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  )
})

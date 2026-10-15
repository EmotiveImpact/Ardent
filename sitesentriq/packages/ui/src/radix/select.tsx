/**
 * Select — Radix-backed dropdown with a tokened popover, replacing the native
 * `<select>` whose option list is OS-drawn (renders dark on dark-OS / dark-
 * color-scheme themes regardless of the page). This popover uses surface-card +
 * border + overlay-shadow, so it matches the ACTIVE THEME on every OS.
 *
 * Shared internal used by <FilterSelect> and <FormSelect> so their call-site
 * APIs stay unchanged.
 *
 * Radix note: the empty string is a reserved value in Radix Select (it clears
 * to placeholder), so we never render an Item with value="". Placeholder is
 * shown via <Select.Value placeholder>; an optional clear row maps to '' via a
 * sentinel.
 */
import { Check, ChevronDown } from 'lucide-react'
import * as RSelect from '@radix-ui/react-select'
import { cn } from './primitives'

// Radix Select reserves the empty string (it means "no value / show
// placeholder"), and a <Select.Item value=""> throws. But the app legitimately
// uses '' as a real option value (e.g. FilterSelect's "All" row). Map '' to a
// sentinel for Radix and back on the way out. CLEAR is a separate sentinel for
// the optional placeholder-clear row.
const EMPTY = '__empty__'
const CLEAR = '__clear__'
const toRadix = (v: string) => (v === '' ? EMPTY : v)
const fromRadix = (v: string) => (v === EMPTY || v === CLEAR ? '' : v)

export interface SelectOption {
  value: string
  label: string
  description?: string
}

export interface UISelectProps {
  value: string | undefined
  onValueChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  /** When true, a row to clear back to the placeholder/empty value is shown. */
  clearable?: boolean
  ariaLabel: string
  disabled?: boolean
  isInvalid?: boolean
  /** Forwarded so RHF's native form submission + field name still work. */
  name?: string
  onBlur?: (e: React.FocusEvent<HTMLButtonElement>) => void
  /** Wrapper/trigger class overrides. */
  className?: string
  triggerClassName?: string
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  clearable = false,
  ariaLabel,
  disabled = false,
  isInvalid = false,
  name,
  onBlur,
  className,
  triggerClassName,
}: UISelectProps) {
  const hasEmptyOption = options.some((o) => o.value === '')
  // '' shows the placeholder UNLESS '' is itself a real option (FilterSelect's
  // "All" row), in which case select that option.
  const current =
    value === undefined || (value === '' && !hasEmptyOption) ? undefined : toRadix(value)
  // If the controlled value isn't among the options, surface it so the trigger
  // shows the real value instead of snapping to placeholder.
  const showExtra =
    value !== undefined && value !== '' && !options.some((o) => o.value === value)

  return (
    <RSelect.Root
      value={current}
      onValueChange={(v) => onValueChange(fromRadix(v))}
      disabled={disabled}
      name={name}
    >
      <RSelect.Trigger
        aria-label={ariaLabel}
        aria-invalid={isInvalid || undefined}
        onBlur={onBlur}
        className={cn(
          'flex items-center justify-between gap-2 rounded-lg border bg-surface-card px-3 py-2 text-[13px] text-text-primary transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40',
          'disabled:opacity-50 disabled:cursor-not-allowed data-[placeholder]:text-text-muted',
          isInvalid ? 'border-status-overdue focus:ring-status-overdue/30' : 'border-border-default',
          triggerClassName,
          className,
        )}
      >
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon>
          <ChevronDown size={14} className="text-text-muted" />
        </RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={4}
          className={cn(
            'ui-anim-pop z-50 max-h-[--radix-select-content-available-height] min-w-[--radix-select-trigger-width] overflow-hidden',
            'rounded-lg border border-border-default bg-surface-card shadow-[var(--overlay-shadow)]',
          )}
        >
          <RSelect.Viewport className="p-1">
            {clearable && placeholder && (
              <Item value={CLEAR} label={placeholder} muted />
            )}
            {showExtra && <Item value={toRadix(value!)} label={String(value)} />}
            {options.map((opt) => (
              <Item key={opt.value} value={toRadix(opt.value)} label={opt.label} title={opt.description} />
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  )
}

function Item({ value, label, title, muted }: { value: string; label: string; title?: string; muted?: boolean }) {
  return (
    <RSelect.Item
      value={value}
      title={title}
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-md py-1.5 pl-3 pr-8 text-[13px] outline-none',
        'data-[highlighted]:bg-surface-page data-[highlighted]:text-text-primary',
        muted ? 'text-text-muted' : 'text-text-secondary',
      )}
    >
      <RSelect.ItemText>{label}</RSelect.ItemText>
      <RSelect.ItemIndicator className="absolute right-2 inline-flex items-center">
        <Check size={14} className="text-[var(--accent)]" />
      </RSelect.ItemIndicator>
    </RSelect.Item>
  )
}

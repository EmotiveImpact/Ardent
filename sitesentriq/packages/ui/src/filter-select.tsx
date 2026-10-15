/**
 * Standardised filter dropdown for list pages — sits next to
 * `<SearchInput>` and uses the same surface, border, and focus tokens.
 *
 * Backed by the Radix-based <Select> (tokened popover) so the option list
 * matches the active theme on every OS — unlike a native `<select>`, whose
 * popup the OS draws using color-scheme (dark on dark-OS / dark themes).
 * The call-site API (value / onChange / options / ariaLabel) is unchanged.
 */
import { Select } from './radix/select'

export interface FilterSelectOption {
  value: string
  label: string
}

export interface FilterSelectProps {
  value: string
  onChange: (next: string) => void
  options: FilterSelectOption[]
  /** Required for screen readers — every filter should describe what it filters. */
  ariaLabel: string
  /** Tailwind class overrides on the wrapper. Default: 'w-auto'. */
  className?: string
}

export function FilterSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className = 'w-auto',
}: FilterSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={onChange}
      options={options}
      ariaLabel={ariaLabel}
      className={className}
    />
  )
}

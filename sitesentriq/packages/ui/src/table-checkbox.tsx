import { Checkbox } from './radix/checkbox'

/**
 * Row-select checkbox for tables.
 *
 * Thin adapter over the tokened Radix <Checkbox> so all table callsites keep
 * their existing prop shape (isSelected / isIndeterminate / onChange /
 * ariaLabel) while gaining a consistent, theme-aware box (follows --accent),
 * a custom check/dash glyph, a proper --focus ring, and identical rendering on
 * every OS — instead of the old native input + accentColor (OS-drawn, and
 * orange even when the active accent is navy).
 */
export interface TableCheckboxProps {
  /** Whether the box is checked. */
  isSelected: boolean
  /** Partial-selection state (some-but-not-all rows selected). */
  isIndeterminate?: boolean
  /** Fired with the next selected state. */
  onChange: (isSelected: boolean) => void
  /** Required for screen readers — every row's checkbox should name what it selects. */
  ariaLabel: string
}

export function TableCheckbox({
  isSelected,
  isIndeterminate,
  onChange,
  ariaLabel,
}: TableCheckboxProps) {
  return (
    <Checkbox
      checked={isSelected}
      indeterminate={isIndeterminate}
      onCheckedChange={onChange}
      aria-label={ariaLabel}
      className="align-middle"
    />
  )
}

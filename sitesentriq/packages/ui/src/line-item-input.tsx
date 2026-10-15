/**
 * Compact text input for the line-item grids on PO / Quote / Invoice
 * create-and-edit pages (SKU / Description / Qty / Unit Cost / Tax %).
 *
 * CDO board audit found 15+ raw `<input>` instances across the
 * line-item grids all repeating the same clump:
 *   className="border border-border-default rounded-lg text-[13px] px-3 py-2 bg-surface-card focus:ring-2…"
 *
 * <LineItemInput> wraps HeroUI v3's <Input> with the right density for
 * grid use, currency prefix support, and a built-in error slot — so the
 * grid columns line up cleanly across all three forms without the
 * caller having to spell out the focus/border treatment each time.
 *
 * IMPLEMENTATION NOTES
 * --------------------
 * - HeroUI v3 <Input> doesn't ship a `startContent` slot the way v2 did;
 *   the £ prefix for `type='currency'` is rendered as a sibling inside a
 *   relatively-positioned wrapper. The Input gets `pl-7` so the typed
 *   value sits clear of the symbol.
 * - HeroUI v3 also doesn't expose a `size='sm'` prop on Input; compact
 *   density is applied via Tailwind classes (`text-[13px] py-1.5 px-2.5`)
 *   to match the rest of the in-app form-element scale already in use
 *   by SearchInput and FormSelect.
 * - For `type='currency'` and `type='number'`, the underlying HTML input
 *   uses `type='number'` with `inputMode='decimal'` so mobile keyboards
 *   surface the numeric pad and screen readers announce numeric input.
 */
export interface LineItemInputProps {
  id?: string
  /** Visible label — visually-hidden when used inside a labelled column. */
  label?: string
  /** Required when `label` is omitted; carries the accessible name. */
  ariaLabel?: string
  /** Current value (controlled). */
  value: string | number
  /** Fired with the raw string value on change. */
  onChange: (value: string) => void
  /** Optional blur handler. */
  onBlur?: () => void
  /** `text` = freeform, `number` = numeric keyboard, `currency` = numeric + £ prefix. Default `'text'`. */
  type?: 'text' | 'number' | 'currency'
  placeholder?: string
  className?: string
  disabled?: boolean
  min?: string | number
  max?: string | number
  step?: string | number
  /** When set, renders an error message below the input + sets `aria-invalid`. */
  error?: string
}

const COMPACT_CLASS =
  'text-[13px] py-1.5 px-2.5 rounded-lg border border-border-default bg-surface-card text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full'

export function LineItemInput({
  id,
  label,
  ariaLabel,
  value,
  onChange,
  onBlur,
  type = 'text',
  placeholder,
  className,
  disabled = false,
  min,
  max,
  step,
  error,
}: LineItemInputProps) {
  // Either a visible label or an ariaLabel must be present so the field
  // has an accessible name. Fall back through both.
  const accessibleName = ariaLabel ?? label

  const isCurrency = type === 'currency'
  const isNumeric = isCurrency || type === 'number'

  const wrapperClass = ['relative', className ?? ''].filter(Boolean).join(' ')
  const inputClass = [COMPACT_CLASS, isCurrency ? 'pl-7' : ''].filter(Boolean).join(' ')

  return (
    <div className={wrapperClass}>
      {label ? (
        <label className="sr-only" htmlFor={id}>
          {label}
        </label>
      ) : null}
      {isCurrency ? (
        <span
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-text-muted pointer-events-none"
          aria-hidden="true"
        >
          £
        </span>
      ) : null}
      <input
        id={id}
        className={inputClass}
        aria-label={accessibleName}
        aria-invalid={error ? true : undefined}
        type={isNumeric ? 'number' : 'text'}
        inputMode={isNumeric ? 'decimal' : undefined}
        min={min}
        max={max}
        step={step}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
      />
      {error ? (
        <p className="text-status-overdue text-[11px] mt-1" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

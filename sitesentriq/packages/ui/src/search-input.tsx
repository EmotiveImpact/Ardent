import { Search, X } from 'lucide-react'

/**
 * Standard search input used on every list page.
 *
 * Visually uniform across the app — white surface, magnifying-glass
 * icon left, optional clear-button right when there's a value. Sized
 * to match the rest of the form-element scale (text-[13px], py-2,
 * rounded-lg). Same focus ring as every other input/select sweep
 * landed in Wave 17E.
 *
 * Not a HeroUI primitive directly because the search-with-icon
 * pattern is its own affordance (HeroUI's <Input> doesn't ship a
 * leading-icon slot and we'd just end up wrapping it the same way).
 * This is the canonical wrapper.
 */
export interface SearchInputProps {
  value: string
  onChange: (next: string) => void
  /** Required for screen readers — every search input should name what it's searching. */
  ariaLabel: string
  /** Hint text shown when empty. Default: "Search…". */
  placeholder?: string
  /** Auto-focus on mount. Default: false. */
  autoFocus?: boolean
  /** Tailwind classes to override / extend the wrapper. Default: 'w-full'. */
  className?: string
}

export function SearchInput({
  value,
  onChange,
  ariaLabel,
  placeholder = 'Search…',
  autoFocus = false,
  className = 'w-full',
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className="w-full pl-9 pr-9 py-2 bg-surface-card border border-border-default rounded-lg text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/40 transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-page transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

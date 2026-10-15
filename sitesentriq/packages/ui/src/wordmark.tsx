const APP_NAME = 'Haumea'

interface WordmarkProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Hide the H mark and render the text only. Used in places where
   *  the icon would be redundant (e.g. inside a tab indicator) or
   *  where horizontal space is constrained. Defaults to `false` so
   *  every existing call site picks up the icon automatically. */
  iconOnly?: false
  /** Hide the wordmark text and render the H mark only. Used in
   *  collapsed sidebar / favicon-adjacent contexts. */
  textOnly?: boolean
  /** When true, drop the icon and render only the wordmark. Mirrors
   *  `textOnly` but reads more naturally at call sites that say
   *  "I just want the letters here". */
  withoutIcon?: boolean
}

/**
 * Brand lockup — H mark + HAUMEA wordmark.
 *
 * - Mark: thin double-stroke serif H in coral-orange on dark navy
 *   (public/h-mark.png). Background matches the sidebar so the icon
 *   disappears edge-into-edge there; on white surfaces it reads as a
 *   small navy tile with the H glyph centred. Subtle rounded corners
 *   keep it feeling like a logo mark rather than a screenshot crop.
 * - Wordmark: uppercase, font-extralight, letter-spaced. Tracking widens
 *   with size so larger renders feel airier.
 *
 * Used in sidebar, marketing nav, marketing footer, portal layout, site
 * layout, and auth pages — updating this component changes every surface.
 */
export function Wordmark({
  className = '',
  size = 'md',
  textOnly = false,
  withoutIcon = false,
}: WordmarkProps) {
  // Mark intentionally outsizes the wordmark cap-height — the H tile
  // is the primary brand signal, the letters are the secondary read.
  const sizeMap = {
    sm: { text: 'text-[11px] tracking-[0.28em]', mark: 'h-7 w-7', gap: 'gap-2' },
    md: { text: 'text-[14px] tracking-[0.32em]', mark: 'h-9 w-9', gap: 'gap-2.5' },
    lg: { text: 'text-[18px] tracking-[0.36em]', mark: 'h-12 w-12', gap: 'gap-3' },
    xl: { text: 'text-[28px] tracking-[0.4em]', mark: 'h-16 w-16', gap: 'gap-3.5' },
  } as const

  const s = sizeMap[size]
  const showMark = !withoutIcon
  const showText = !textOnly

  return (
    <span className={`inline-flex items-center ${showMark && showText ? s.gap : ''} ${className}`}>
      {showMark && (
        // <picture> with WebP source — 9 KB vs 63 KB PNG fallback on a
        // ~256px serving size. The browser cache makes this a one-time
        // cost; the <picture> just shaves first-paint bandwidth.
        <picture>
          <source srcSet="/h-mark.webp" type="image/webp" />
          <img
            src="/h-mark.png"
            alt={showText ? '' : APP_NAME}
            aria-hidden={showText ? 'true' : undefined}
            className={`${s.mark} rounded-md object-contain shrink-0 select-none`}
            draggable={false}
          />
        </picture>
      )}
      {showText && (
        <span
          className={`uppercase font-extralight leading-none ${s.text}`}
          style={{ fontFamily: '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif' }}
        >
          {APP_NAME}
        </span>
      )}
    </span>
  )
}

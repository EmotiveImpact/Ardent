import type { CSSProperties, ReactNode } from 'react'
import { createElement } from 'react'

/**
 * Typography primitives — semantic + scale split.
 *
 * The CDO board audit found 350+ ad-hoc `text-[Npx]` declarations across
 * detail pages with no shared vocabulary. <Heading> and <Text> here speak
 * to the new six-step `--text-*` scale defined under @theme in
 * `apps/web/src/index.css`:
 *
 *   display  → hero numbers (compliance score 80px)
 *   headline → page titles (~28px)
 *   title    → card titles (~20px)
 *   body     → default paragraph (14px)
 *   caption  → metadata / helper text (12px)
 *   micro    → badge / chip labels (11px)
 *
 * The split matters: `level` carries semantics (which h-tag the screen
 * reader and the DOM tree see), `scale` carries visual size. You can
 * have a level-1 page title rendered at title-scale (rare but valid)
 * without the readability cost of using a `<div>` styled to look big.
 */

export type TypographyScale =
  | 'display'
  | 'headline'
  | 'title'
  | 'body'
  | 'caption'
  | 'micro'

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold'

export type TextTone = 'primary' | 'muted' | 'subtle' | 'accent'

/** Default scale per heading level — covers 90% of cases without ceremony. */
const LEVEL_DEFAULT_SCALE: Record<HeadingLevel, TypographyScale> = {
  1: 'headline',
  2: 'title',
  3: 'body',
  4: 'body',
  5: 'body',
  6: 'body',
}

/**
 * Tailwind classes per scale token.
 *
 * Headings get a tighter line-height + slight negative tracking at the
 * larger sizes; body/caption/micro stay at relaxed leading.
 * Tailwind v4 + the @theme `--text-*` tokens means `text-display` etc.
 * are valid utility classes — they map straight onto the CSS variables
 * defined in `apps/web/src/index.css`.
 */
const SCALE_CLASS: Record<TypographyScale, string> = {
  display: 'text-display leading-[1] tracking-[-0.03em]',
  headline: 'text-headline leading-[1.15] tracking-[-0.02em]',
  title: 'text-title leading-[1.25] tracking-[-0.01em]',
  body: 'text-body leading-[1.5]',
  caption: 'text-caption leading-[1.45]',
  micro: 'text-micro leading-[1.4]',
}

const WEIGHT_CLASS: Record<TextWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
}

const TONE_CLASS: Record<TextTone, string> = {
  primary: 'text-text-primary',
  muted: 'text-text-muted',
  subtle: 'text-text-secondary',
  accent: 'text-text-accent',
}

// ─────────────────────────────────────────────
// <Heading>
// ─────────────────────────────────────────────

/** JSX intrinsic element name (`'h1'`, `'div'`, `'span'`, …). Mirrors the
 *  `keyof JSX.IntrinsicElements` type without depending on the JSX namespace
 *  (which is stripped under `react-jsx` runtime in some setups). */
type IntrinsicTag = keyof React.JSX.IntrinsicElements

export interface HeadingProps {
  /** Semantic h-tag — drives the DOM element rendered (unless `as` overrides). */
  level: HeadingLevel
  /** Visual size token. Defaults to a per-level sensible value. */
  scale?: TypographyScale
  /** Optional weight override. Defaults to `semibold` for headings. */
  weight?: TextWeight
  /** Optional tone override. Defaults to `primary`. */
  tone?: TextTone
  /** Escape-hatch override of the rendered element. */
  as?: IntrinsicTag
  /** Extra classes — appended after the built-ins so caller wins. */
  className?: string
  style?: CSSProperties
  children: ReactNode
}

export function Heading({
  level,
  scale,
  weight = 'semibold',
  tone = 'primary',
  as,
  className,
  style,
  children,
}: HeadingProps) {
  const effectiveScale: TypographyScale = scale ?? LEVEL_DEFAULT_SCALE[level]
  const tag: IntrinsicTag = as ?? (`h${level}` as IntrinsicTag)

  const classes = [
    SCALE_CLASS[effectiveScale],
    WEIGHT_CLASS[weight],
    TONE_CLASS[tone],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return createElement(tag, { className: classes, style }, children)
}

// ─────────────────────────────────────────────
// <Text>
// ─────────────────────────────────────────────

export interface TextProps {
  /** Visual size token. Default `'body'`. */
  scale?: TypographyScale
  /** Font weight. Default `'normal'`. */
  weight?: TextWeight
  /** Foreground colour token. Default `'primary'`. */
  tone?: TextTone
  /** Rendered element. Default `'p'`. */
  as?: IntrinsicTag
  className?: string
  style?: CSSProperties
  children: ReactNode
}

export function Text({
  scale = 'body',
  weight = 'normal',
  tone = 'primary',
  as = 'p',
  className,
  style,
  children,
}: TextProps) {
  const classes = [
    SCALE_CLASS[scale],
    WEIGHT_CLASS[weight],
    TONE_CLASS[tone],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return createElement(as, { className: classes, style }, children)
}

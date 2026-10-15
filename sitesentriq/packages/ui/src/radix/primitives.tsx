/**
 * Radix/shadcn replacement primitives for @haumea/ui — drop-in for the HeroUI v3
 * components the app used, with the SAME prop names (onPress, isDisabled, variant,
 * color, size…) so migration is a one-line import swap. Styled to the SiteSentriq
 * design tokens (see docs/DESIGN.md).
 */
import { forwardRef, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'
import * as RSwitch from '@radix-ui/react-switch'
import * as RAvatar from '@radix-ui/react-avatar'
import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The app's design system defines a custom 6-step font-size scale
 * (text-micro … text-headline). Stock tailwind-merge doesn't know these are
 * font-sizes, so it groups them with text-COLOR utilities and drops the color
 * when both appear on one element (e.g. `text-caption` + `text-[var(--accent-
 * foreground)]` → color silently stripped). Registering the scale keeps size
 * and color in separate conflict groups.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['micro', 'caption', 'label', 'body', 'title', 'headline'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ─────────────────────────── Button ─────────────────────────── */
type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'outline' | 'ghost' | 'danger' | 'soft' | 'danger-soft'
type ButtonSize = 'sm' | 'md' | 'lg'

const BTN_VARIANT: Record<ButtonVariant, string> = {
  'danger-soft': 'bg-status-overdue/10 text-status-overdue hover:bg-status-overdue/20',
  primary: 'bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90',
  secondary:
    'bg-surface-card border border-border-default text-text-primary shadow-[var(--surface-shadow)] hover:bg-surface-page',
  outline:
    'bg-surface-card border border-border-default text-text-primary shadow-[var(--surface-shadow)] hover:bg-surface-page',
  tertiary: 'text-text-secondary hover:text-text-primary hover:bg-surface-page',
  ghost: 'text-text-secondary hover:bg-surface-page hover:text-text-primary',
  danger: 'bg-[var(--danger)] text-[var(--danger-foreground)] hover:opacity-90',
  soft: 'bg-accent-soft text-accent-soft-foreground hover:opacity-90',
}
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-caption gap-1',
  md: 'h-9 px-3.5 text-label gap-1.5',
  lg: 'h-11 px-5 text-body gap-2',
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  variant?: ButtonVariant
  size?: ButtonSize
  color?: string
  isDisabled?: boolean
  isIconOnly?: boolean
  fullWidth?: boolean
  onPress?: () => void
  startContent?: ReactNode
  endContent?: ReactNode
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', isDisabled, isIconOnly, fullWidth, onPress, onClick, startContent, endContent, asChild, className, children, color: _color, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      disabled={isDisabled}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => { onClick?.(e); onPress?.() }}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-50 disabled:pointer-events-none',
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        isIconOnly && 'aspect-square px-0',
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {startContent}
      {children}
      {endContent}
    </Comp>
  )
})

/* ─────────────────────────── Chip ─────────────────────────── */
type ChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'primary'
const CHIP_COLOR: Record<ChipColor, string> = {
  default: 'bg-surface-elevated text-text-secondary',
  accent: 'bg-accent-soft text-accent-soft-foreground',
  primary: 'bg-accent-soft text-accent-soft-foreground',
  success: 'bg-status-compliant/10 text-status-compliant',
  warning: 'bg-status-due-soon/10 text-status-due-soon',
  danger: 'bg-status-overdue/10 text-status-overdue',
}
export interface ChipProps {
  variant?: string
  color?: ChipColor
  size?: 'sm' | 'md'
  className?: string
  children?: ReactNode
}
export function Chip({ color = 'default', size = 'sm', className, children }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium capitalize',
        size === 'sm' ? 'px-2 py-0.5 text-micro' : 'px-2.5 py-1 text-caption',
        CHIP_COLOR[color] ?? CHIP_COLOR.default,
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ─────────────────────────── Spinner ─────────────────────────── */
export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; color?: string; className?: string }) {
  const px = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block animate-spin rounded-full border-2 border-border-strong border-t-[var(--accent)]', px, className)}
    />
  )
}

/* ─────────────────────────── Skeleton ─────────────────────────── */
export function Skeleton({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-surface-elevated', className)} {...rest} />
}

/* ─────────────────────────── Switch ─────────────────────────── */
export interface SwitchProps {
  isSelected?: boolean
  onChange?: (selected: boolean) => void
  isDisabled?: boolean
  size?: string
  'aria-label'?: string
  className?: string
}
export function Switch({ isSelected, onChange, isDisabled, className, size: _size, ...aria }: SwitchProps) {
  return (
    <RSwitch.Root
      checked={isSelected}
      onCheckedChange={onChange}
      disabled={isDisabled}
      className={cn('relative h-5 w-9 shrink-0 rounded-full bg-border-strong transition-colors data-[state=checked]:bg-[var(--accent)] disabled:opacity-50', className)}
      {...aria}
    >
      <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  )
}

/* ─────────────────────────── Avatar ─────────────────────────── */
type AvatarRoot = React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string; children?: ReactNode }> & {
  Fallback: React.FC<{ className?: string; children?: ReactNode }>
}
const AvatarBase: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string; children?: ReactNode }> = ({ size = 'md', className, children }) => (
  <RAvatar.Root className={cn('inline-flex items-center justify-center overflow-hidden rounded-full bg-surface-elevated text-text-secondary', size === 'sm' ? 'h-7 w-7 text-micro' : size === 'lg' ? 'h-10 w-10 text-label' : 'h-8 w-8 text-caption', className)}>
    {children}
  </RAvatar.Root>
)
export const Avatar = AvatarBase as AvatarRoot
Avatar.Fallback = ({ className, children }) => (
  <RAvatar.Fallback className={cn('flex h-full w-full items-center justify-center font-medium', className)}>{children}</RAvatar.Fallback>
)

/* ─────────────────────────── Card ─────────────────────────── */
type CardRoot = React.FC<{ className?: string; children?: ReactNode }> & {
  Header: React.FC<{ className?: string; children?: ReactNode }>
  Content: React.FC<{ className?: string; children?: ReactNode }>
  Body: React.FC<{ className?: string; children?: ReactNode }>
  Footer: React.FC<{ className?: string; children?: ReactNode }>
}
const CardBase: React.FC<{ className?: string; children?: ReactNode }> = ({ className, children }) => (
  <div className={cn('rounded-xl border border-border-default bg-surface-card shadow-[var(--surface-shadow)]', className)}>{children}</div>
)
export const Card = CardBase as CardRoot
Card.Header = ({ className, children }) => <div className={cn('border-b border-border-subtle px-5 py-4', className)}>{children}</div>
Card.Content = ({ className, children }) => <div className={cn('p-5', className)}>{children}</div>
Card.Body = Card.Content
Card.Footer = ({ className, children }) => <div className={cn('border-t border-border-subtle px-5 py-4', className)}>{children}</div>

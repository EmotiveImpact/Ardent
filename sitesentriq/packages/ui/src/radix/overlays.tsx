/**
 * Overlay replacements for @haumea/ui — HeroUI-compatible compound APIs over
 * Radix Dialog / AlertDialog / Tooltip / DropdownMenu. Styled to design tokens.
 */
import { createContext, useContext, type ReactNode } from 'react'
import * as RDialog from '@radix-ui/react-dialog'
import * as RAlert from '@radix-ui/react-alert-dialog'
import * as RTooltip from '@radix-ui/react-tooltip'
import * as RMenu from '@radix-ui/react-dropdown-menu'
import { cn } from './primitives'

/* ─────────────────────────── Modal ─────────────────────────── */
const SIZE: Record<string, string> = {
  sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl', '2xl': 'max-w-3xl', full: 'max-w-[95vw]',
}
const SizeCtx = createContext<string>('md')

interface BackdropProps {
  isOpen?: boolean
  onOpenChange?: (o: boolean) => void
  isDismissable?: boolean
  isKeyboardDismissDisabled?: boolean
  variant?: string
  children?: ReactNode
}

function Backdrop({ isOpen, onOpenChange, children }: BackdropProps) {
  return (
    <RDialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="ui-anim-overlay fixed inset-0 z-50 bg-[var(--backdrop)]" />
        {children}
      </RDialog.Portal>
    </RDialog.Root>
  )
}
function Container({ size = 'md', className, children }: { size?: string; className?: string; children?: ReactNode }) {
  return (
    <SizeCtx.Provider value={size}>
      <div className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', className)}>{children}</div>
    </SizeCtx.Provider>
  )
}
function ModalDialog({ className, children, ...rest }: { className?: string; children?: ReactNode; 'aria-label'?: string }) {
  const size = useContext(SizeCtx)
  return (
    <RDialog.Content
      className={cn('ui-anim-content relative w-full rounded-xl border border-border-default bg-surface-card shadow-[var(--overlay-shadow)] focus:outline-none', SIZE[size] ?? SIZE.md, className)}
      {...rest}
    >
      {children}
    </RDialog.Content>
  )
}
const part = (cls: string, Tag: 'div' = 'div') =>
  ({ className, children }: { className?: string; children?: ReactNode }) => <Tag className={cn(cls, className)}>{children}</Tag>

export const Modal = {
  Backdrop,
  Container,
  Dialog: ModalDialog,
  Header: part('flex items-center gap-3 border-b border-border-subtle px-5 py-4'),
  Heading: ({ className, children }: { className?: string; children?: ReactNode }) => (
    <RDialog.Title className={cn('text-title font-semibold text-text-primary', className)}>{children}</RDialog.Title>
  ),
  Description: ({ className, children }: { className?: string; children?: ReactNode }) => (
    <RDialog.Description className={cn('text-label text-text-secondary', className)}>{children}</RDialog.Description>
  ),
  Icon: ({ className, children }: { className?: string; children?: ReactNode }) => (
    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-secondary', className)}>{children}</div>
  ),
  Body: part('px-5 py-4'),
  Footer: part('flex justify-end gap-2 border-t border-border-subtle px-5 py-4'),
  CloseTrigger: ({ children }: { children?: ReactNode }) => (
    <RDialog.Close asChild>
      {children ?? (
        <button aria-label="Close" className="absolute right-4 top-4 rounded-md p-1 text-text-muted hover:bg-surface-page hover:text-text-primary">✕</button>
      )}
    </RDialog.Close>
  ),
}

/* ─────────────────────────── AlertDialog ─────────────────────────── */
function AlertBackdrop({ isOpen, onOpenChange, children }: BackdropProps) {
  return (
    <RAlert.Root open={isOpen} onOpenChange={onOpenChange}>
      <RAlert.Portal>
        <RAlert.Overlay className="ui-anim-overlay fixed inset-0 z-50 bg-[var(--backdrop)]" />
        {children}
      </RAlert.Portal>
    </RAlert.Root>
  )
}
const ALERT_ICON: Record<string, string> = {
  danger: 'bg-status-overdue/10 text-status-overdue',
  accent: 'bg-accent-soft text-accent-soft-foreground',
  success: 'bg-status-compliant/10 text-status-compliant',
  warning: 'bg-status-due-soon/10 text-status-due-soon',
}
/** Fallback glyph when AlertDialog.Icon is rendered with no child (many
 *  callsites pass only `status`). danger → warning triangle, else → info. */
function DefaultAlertGlyph({ status }: { status?: string }) {
  if (status === 'danger' || status === 'warning') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <path d="M12 9v4" /><path d="M12 17h.01" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
    </svg>
  )
}

export const AlertDialog = {
  Backdrop: AlertBackdrop,
  Container: ({ size = 'sm', className, children }: { size?: string; className?: string; children?: ReactNode }) => (
    <SizeCtx.Provider value={size}><div className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', className)}>{children}</div></SizeCtx.Provider>
  ),
  Dialog: ({ className, children }: { className?: string; children?: ReactNode }) => {
    const size = useContext(SizeCtx)
    return (
      <RAlert.Content className={cn('ui-anim-content w-full rounded-xl border border-border-default bg-surface-card p-6 shadow-[var(--overlay-shadow)] focus:outline-none', SIZE[size] ?? SIZE.sm, className)}>{children}</RAlert.Content>
    )
  },
  Icon: ({ status = 'accent', className, children }: { status?: string; className?: string; children?: ReactNode }) => (
    <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-full', ALERT_ICON[status] ?? ALERT_ICON.accent, className)}>
      {children ?? <DefaultAlertGlyph status={status} />}
    </div>
  ),
  Header: part('mb-2'),
  Heading: ({ className, children }: { className?: string; children?: ReactNode }) => (
    <RAlert.Title className={cn('text-title font-semibold text-text-primary', className)}>{children}</RAlert.Title>
  ),
  Body: ({ className, children }: { className?: string; children?: ReactNode }) => (
    <RAlert.Description asChild><div className={cn('text-label text-text-secondary', className)}>{children}</div></RAlert.Description>
  ),
  Footer: part('mt-5 flex justify-end gap-2'),
  CancelTrigger: ({ children }: { children?: ReactNode }) => <RAlert.Cancel asChild>{children}</RAlert.Cancel>,
  ActionTrigger: ({ children }: { children?: ReactNode }) => <RAlert.Action asChild>{children}</RAlert.Action>,
}

/* ─────────────────────────── Tooltip ───────────────────────────
 * <Tooltip delay={400}><Tooltip.Trigger>…</Tooltip.Trigger>
 *   <Tooltip.Content placement="bottom"><Tooltip.Arrow/>…</Tooltip.Content></Tooltip>
 */
const SIDE: Record<string, 'top' | 'bottom' | 'left' | 'right'> = {
  top: 'top', bottom: 'bottom', left: 'left', right: 'right',
}
interface TooltipRootProps { delay?: number; children?: ReactNode }
type TooltipComp = React.FC<TooltipRootProps> & {
  Provider: React.FC<{ children?: ReactNode }>
  Root: React.FC<TooltipRootProps>
  Trigger: React.FC<{ children?: ReactNode }>
  Content: React.FC<{ placement?: string; className?: string; children?: ReactNode }>
  Arrow: React.FC<{ className?: string }>
}
const TooltipBase: React.FC<TooltipRootProps> = ({ delay = 300, children }) => (
  <RTooltip.Provider delayDuration={delay}><RTooltip.Root>{children}</RTooltip.Root></RTooltip.Provider>
)
export const Tooltip = TooltipBase as TooltipComp
Tooltip.Provider = ({ children }) => <RTooltip.Provider delayDuration={300}>{children}</RTooltip.Provider>
Tooltip.Root = ({ children }) => <RTooltip.Root>{children}</RTooltip.Root>
Tooltip.Trigger = ({ children }) => <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
Tooltip.Content = ({ placement = 'top', className, children }) => (
  <RTooltip.Portal>
    <RTooltip.Content side={SIDE[placement] ?? 'top'} sideOffset={6} className={cn('ui-anim-pop z-50 max-w-xs rounded-md border border-border-default bg-[var(--overlay)] px-2.5 py-1.5 text-caption text-overlay-foreground shadow-[var(--overlay-shadow)]', className)}>
      {children}
    </RTooltip.Content>
  </RTooltip.Portal>
)
Tooltip.Arrow = ({ className }) => <RTooltip.Arrow className={cn('fill-[var(--overlay)]', className)} />

/* ─────────────────────────── Dropdown ───────────────────────────
 * <Dropdown><Dropdown.Trigger className aria-label>…</Dropdown.Trigger>
 *   <Dropdown.Popover><Dropdown.Menu><Dropdown.Item id textValue onAction>…
 */
interface DropdownRootProps { children?: ReactNode }
type DropdownComp = React.FC<DropdownRootProps> & {
  Trigger: React.FC<{ className?: string; 'aria-label'?: string; children?: ReactNode }>
  Popover: React.FC<{ className?: string; children?: ReactNode }>
  Menu: React.FC<{ className?: string; 'aria-label'?: string; children?: ReactNode }>
  Item: React.FC<{ id?: string; textValue?: string; onAction?: () => void | Promise<unknown>; className?: string; isDanger?: boolean; children?: ReactNode }>
  Separator: React.FC
  Label: React.FC<{ children?: ReactNode }>
}
const DropdownBase: React.FC<DropdownRootProps> = ({ children }) => <RMenu.Root>{children}</RMenu.Root>
export const Dropdown = DropdownBase as DropdownComp
Dropdown.Trigger = ({ className, children, ...rest }) => (
  <RMenu.Trigger className={className} {...rest}>{children}</RMenu.Trigger>
)
Dropdown.Popover = ({ className, children }) => (
  <RMenu.Portal>
    <RMenu.Content sideOffset={6} align="end" className={cn('ui-anim-pop z-50 min-w-[12rem] overflow-hidden rounded-xl border border-border-default bg-surface-card p-1 shadow-[var(--overlay-shadow)]', className)}>
      {children}
    </RMenu.Content>
  </RMenu.Portal>
)
Dropdown.Menu = ({ className, children }) => <RMenu.Group className={className}>{children}</RMenu.Group>
Dropdown.Item = ({ onAction, className, children, isDanger }) => (
  <RMenu.Item
    onSelect={() => { void onAction?.() }}
    className={cn('flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-label outline-none data-[highlighted]:bg-surface-page', isDanger ? 'text-status-overdue' : 'text-text-secondary data-[highlighted]:text-text-primary', className)}
  >
    {children}
  </RMenu.Item>
)
Dropdown.Separator = () => <RMenu.Separator className="my-1 h-px bg-border-subtle" />
Dropdown.Label = ({ children }) => <RMenu.Label className="px-3 py-1 text-micro font-medium uppercase tracking-wide text-text-muted">{children}</RMenu.Label>

// Wave 17C — ConfirmDialog now wraps HeroUI v3 <AlertDialog>.
//
// We keep the existing prop shape (open / title / message / confirmLabel /
// variant / onConfirm / onCancel) so the ~30 callsites across the app don't
// need to change. Internally we render <AlertDialog.Backdrop isOpen=…> in
// controlled mode and surface the canonical accessibility behaviour for
// free: focus trap, ESC-to-close, scroll lock, role="alertdialog".
//
// AlertDialog defaults differ from our old custom impl in two places — we
// keep the old behaviour explicitly:
//   - `isDismissable` defaults to false in AlertDialog. We allow backdrop
//      click to cancel (matching the prior UX) by setting it to true.
//   - `isKeyboardDismissDisabled` defaults to true in AlertDialog. We re-
//      enable ESC by setting it to false here.
//
// Only the wrapper changed in this wave; the API + tests are unchanged.

import { AlertDialog, Button } from '@haumea/ui'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
      isDismissable
      isKeyboardDismissDisabled={false}
    >
      <AlertDialog.Container>
        <AlertDialog.Dialog className="sm:max-w-[400px]">
          <AlertDialog.Header>
            <AlertDialog.Icon status={variant === 'danger' ? 'danger' : 'accent'} />
            <AlertDialog.Heading>{title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <p>{message}</p>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" onPress={onCancel}>
              Cancel
            </Button>
            <Button
              variant={variant === 'danger' ? 'danger' : 'primary'}
              onPress={onConfirm}
            >
              {confirmLabel}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}

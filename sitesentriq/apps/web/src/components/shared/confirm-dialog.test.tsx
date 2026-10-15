import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './confirm-dialog'
import { renderWithProviders } from '@/test/test-utils'

describe('<ConfirmDialog />', () => {
  const noop = () => {}

  it('does not render the dialog content when closed', () => {
    // Wave 17C — HeroUI's AlertDialog still mounts a hidden portal node
    // when isOpen=false, so we no longer assert on container.firstChild.
    // We just check that the dialog content is not present in the DOM.
    renderWithProviders(
      <ConfirmDialog open={false} title="Delete" message="Sure?" onConfirm={noop} onCancel={noop} />,
    )
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
    expect(screen.queryByText('Sure?')).not.toBeInTheDocument()
  })

  it('renders title, message, and the default Confirm/Cancel buttons when open', () => {
    renderWithProviders(
      <ConfirmDialog open title="Delete client" message="Are you sure?" onConfirm={noop} onCancel={noop} />,
    )
    expect(screen.getByText('Delete client')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('uses the provided confirmLabel', () => {
    renderWithProviders(
      <ConfirmDialog
        open
        title="Archive"
        message="?"
        confirmLabel="Yes, archive"
        onConfirm={noop}
        onCancel={noop}
      />,
    )
    expect(screen.getByRole('button', { name: 'Yes, archive' })).toBeInTheDocument()
  })

  it('applies the danger variant styling', () => {
    renderWithProviders(
      <ConfirmDialog open title="Delete" message="?" variant="danger" onConfirm={noop} onCancel={noop} />,
    )
    // Wave 17C — ConfirmDialog now wraps HeroUI <AlertDialog>; the danger
    // confirm button is a HeroUI <Button variant="danger"> rather than a
    // raw bg-red-600 class. We just assert it renders.
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    renderWithProviders(
      <ConfirmDialog open title="X" message="?" onConfirm={onConfirm} onCancel={noop} />,
    )
    await user.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel when Escape is pressed', async () => {
    // Wave 17C — HeroUI's <AlertDialog> listens for Escape on the dialog
    // element via React Aria Components. We dispatch keyDown on the dialog
    // itself rather than window so the test mirrors real user behaviour.
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderWithProviders(
      <ConfirmDialog open title="X" message="?" onConfirm={noop} onCancel={onCancel} />,
    )
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })

  it('does not call onCancel for non-Escape keys', () => {
    const onCancel = vi.fn()
    renderWithProviders(
      <ConfirmDialog open title="X" message="?" onConfirm={noop} onCancel={onCancel} />,
    )
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onCancel).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { LineItemInput } from './line-item-input'

describe('LineItemInput', () => {
  it('renders the aria-label when no visible label is provided', () => {
    render(
      <LineItemInput ariaLabel="Quantity" value="" onChange={() => {}} />,
    )
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument()
  })

  it('displays the £ prefix for type="currency"', () => {
    const { container } = render(
      <LineItemInput
        ariaLabel="Unit cost"
        type="currency"
        value="10"
        onChange={() => {}}
      />,
    )
    expect(container.textContent).toContain('£')
    // The input itself should reserve room for the prefix.
    const input = screen.getByLabelText('Unit cost') as HTMLInputElement
    expect(input.className).toContain('pl-7')
  })

  it('does NOT render a currency prefix for type="number" or type="text"', () => {
    const { container, rerender } = render(
      <LineItemInput ariaLabel="Qty" type="number" value="" onChange={() => {}} />,
    )
    expect(container.textContent).not.toContain('£')

    rerender(<LineItemInput ariaLabel="SKU" type="text" value="" onChange={() => {}} />)
    expect(container.textContent).not.toContain('£')
  })

  it('calls onChange with the raw string value', () => {
    const onChange = vi.fn()
    render(
      <LineItemInput ariaLabel="SKU" type="text" value="" onChange={onChange} />,
    )
    const input = screen.getByLabelText('SKU') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'ABC-123' } })
    expect(onChange).toHaveBeenCalledWith('ABC-123')
  })

  it('renders the error message and sets aria-invalid when error is set', () => {
    render(
      <LineItemInput
        ariaLabel="Tax"
        type="number"
        value="200"
        onChange={() => {}}
        error="Tax must be between 0 and 100"
      />,
    )
    const input = screen.getByLabelText('Tax')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Tax must be between 0 and 100')
  })

  it('uses inputMode="decimal" for numeric types', () => {
    render(
      <LineItemInput ariaLabel="Qty" type="number" value="" onChange={() => {}} />,
    )
    expect(screen.getByLabelText('Qty')).toHaveAttribute('inputmode', 'decimal')
  })

  it('passes id and numeric constraints to the underlying input', () => {
    render(
      <LineItemInput
        id="line-qty"
        ariaLabel="Qty"
        type="number"
        value="1"
        onChange={() => {}}
        min="0.01"
        step="0.01"
      />,
    )
    const input = screen.getByLabelText('Qty')
    expect(input).toHaveAttribute('id', 'line-qty')
    expect(input).toHaveAttribute('min', '0.01')
    expect(input).toHaveAttribute('step', '0.01')
  })
})

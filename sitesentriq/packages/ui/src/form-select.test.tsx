// jsdom + global afterEach(cleanup) + matchMedia shim come from
// vitest.config.ts -> ./test-setup.ts. No per-file boilerplate needed.

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FormSelect } from './form-select'

const FRUITS = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry' },
] as const

describe('FormSelect', () => {
  it('renders all options plus the placeholder', () => {
    render(
      <FormSelect
        value={undefined}
        onChange={() => {}}
        options={[...FRUITS]}
        placeholder="Pick a fruit…"
        ariaLabel="Fruit"
      />,
    )

    const select = screen.getByLabelText('Fruit') as HTMLSelectElement
    // 3 fruits + 1 placeholder = 4 options
    expect(select.options).toHaveLength(4)
    expect(select.options[0]).toHaveTextContent('Pick a fruit…')
    expect(screen.getByRole('option', { name: 'Apple' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Banana' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cherry' })).toBeInTheDocument()
  })

  it('selecting an option calls onChange with the value', () => {
    const onChange = vi.fn()
    render(
      <FormSelect
        value="apple"
        onChange={onChange}
        options={[...FRUITS]}
        ariaLabel="Fruit"
      />,
    )

    fireEvent.change(screen.getByLabelText('Fruit'), {
      target: { value: 'banana' },
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('banana')
  })

  it('disables the placeholder after selection by default', () => {
    render(
      <FormSelect
        value="apple"
        onChange={() => {}}
        options={[...FRUITS]}
        placeholder="Pick a fruit…"
        ariaLabel="Fruit"
      />,
    )

    expect(screen.getByRole('option', { name: 'Pick a fruit…' })).toBeDisabled()
  })

  it('keeps the placeholder selectable when clearable', () => {
    const onChange = vi.fn()
    render(
      <FormSelect
        value="apple"
        onChange={onChange}
        options={[...FRUITS]}
        placeholder="All fruits"
        ariaLabel="Fruit"
        clearable
      />,
    )

    expect(screen.getByRole('option', { name: 'All fruits' })).not.toBeDisabled()
    fireEvent.change(screen.getByLabelText('Fruit'), {
      target: { value: '' },
    })
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('renders an error state when isInvalid is true', () => {
    render(
      <FormSelect
        value="apple"
        onChange={() => {}}
        options={[...FRUITS]}
        ariaLabel="Fruit"
        isInvalid
      />,
    )

    const select = screen.getByLabelText('Fruit')
    expect(select).toHaveAttribute('aria-invalid', 'true')
    // Error border token comes from the design system; presence of any
    // status-overdue class proves the invalid branch ran.
    expect(select.className).toMatch(/status-overdue/)
  })

  it('respects the disabled prop', () => {
    render(
      <FormSelect
        value="apple"
        onChange={() => {}}
        options={[...FRUITS]}
        ariaLabel="Fruit"
        disabled
      />,
    )

    expect(screen.getByLabelText('Fruit')).toBeDisabled()
  })

  it('forwards ariaLabel to the underlying select', () => {
    render(
      <FormSelect
        value={undefined}
        onChange={() => {}}
        options={[...FRUITS]}
        ariaLabel="Choose a fruit, please"
      />,
    )

    expect(
      screen.getByLabelText('Choose a fruit, please'),
    ).toBeInTheDocument()
  })
})

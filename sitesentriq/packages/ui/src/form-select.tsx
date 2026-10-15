/**
 * FormSelect + FormSelectController — the canonical primitives for any
 * select inside a create/edit form.
 *
 * BEFORE (62× across the web app):
 *   <select {...register('field')} className="w-full border border-border-default rounded-lg text-[13px] px-3 py-2 bg-surface-card focus:ring-2 focus:ring-accent/20 focus:outline-none">
 *     <option value="">Choose…</option>
 *     {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
 *   </select>
 *
 * AFTER:
 *   <FormSelectController control={control} name="field" options={options} ariaLabel="Field" placeholder="Choose…" />
 *
 * IMPLEMENTATION NOTE — why a styled native `<select>` and not the
 * HeroUI v3 Select compound:
 * The HeroUI v3 Select shape is `<Select selectedKey onSelectionChange>
 * <Select.Trigger><Select.Value/></Select.Trigger><Select.Popover>
 * <ListBox><ListBox.Item id /></ListBox></Select.Popover></Select>`. It
 * uses react-aria-components under the hood — a portalled popover with
 * collection items, which is overkill for a 4-line dropdown and is
 * fragile in jsdom (the test environment we use). The sibling
 * `FilterSelect` primitive made the same call. Crucially, this file's
 * exported API surface (`value | onChange | options | ariaLabel`) does
 * NOT leak the underlying widget — when we're ready to swap in the
 * HeroUI compound, every call-site stays unchanged. That's the point
 * of the wrapper: lock the call-site API today, upgrade the visuals
 * tomorrow.
 */
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
} from 'react-hook-form'
import { Select } from './radix/select'

export interface FormSelectOption<T extends string = string> {
  value: T
  label: string
  /** Reserved — currently rendered as `<option title>` for tooltips; the
   *  HeroUI compound will surface this as a secondary description line. */
  description?: string
}

export interface FormSelectProps<T extends string = string> {
  value: T | undefined
  onChange: (v: T) => void
  options: FormSelectOption<T>[]
  placeholder?: string
  /** When true, the placeholder remains selectable so optional filters can be cleared. */
  clearable?: boolean
  isInvalid?: boolean
  /** Required — every select must announce what it controls to screen readers. */
  ariaLabel: string
  disabled?: boolean
  /** Forwarded to the native `<select>` so RHF's `register('field').name`
   *  flows through and native form submission still works. */
  name?: string
  /** RHF `register` returns an `onBlur` — passing it lets touched-state
   *  and `onBlur` validation modes fire correctly. (The underlying control is
   *  now the Radix Select trigger button.) */
  onBlur?: (e: React.FocusEvent<HTMLButtonElement>) => void
}

export function FormSelect<T extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  clearable = false,
  isInvalid = false,
  ariaLabel,
  disabled = false,
  name,
  onBlur,
}: FormSelectProps<T>) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as T)}
      onBlur={onBlur}
      name={name}
      disabled={disabled}
      ariaLabel={ariaLabel}
      isInvalid={isInvalid}
      placeholder={placeholder}
      clearable={clearable}
      options={options}
      className="w-full"
    />
  )
}

export interface FormSelectControllerProps<
  TForm extends FieldValues,
  T extends string = string,
> {
  control: Control<TForm>
  name: FieldPath<TForm>
  options: FormSelectOption<T>[]
  placeholder?: string
  clearable?: boolean
  ariaLabel: string
  disabled?: boolean
  /** Forwarded to RHF — same shape as `register(name, rules)`. */
  rules?: Omit<
    RegisterOptions<TForm>,
    'valueAsNumber' | 'valueAsDate' | 'setValueAs' | 'disabled'
  >
}

/**
 * Drop-in RHF wrapper around `<FormSelect>`. The 3-line replacement
 * for hand-rolled `<select {...register(...)}>` blocks.
 */
export function FormSelectController<
  TForm extends FieldValues,
  T extends string = string,
>({
  control,
  name,
  options,
  placeholder,
  clearable,
  ariaLabel,
  disabled,
  rules,
}: FormSelectControllerProps<TForm, T>) {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <FormSelect<T>
          name={field.name}
          value={(field.value ?? undefined) as T | undefined}
          onChange={(v) => field.onChange(v)}
          onBlur={field.onBlur}
          options={options}
          placeholder={placeholder}
          clearable={clearable}
          ariaLabel={ariaLabel}
          isInvalid={fieldState.invalid}
          disabled={disabled || field.disabled}
        />
      )}
    />
  )
}

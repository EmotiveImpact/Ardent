import { useEffect, useRef } from 'react'
import type { UseFormReturn, FieldValues } from 'react-hook-form'

interface Options {
  /** Stable key — combine prefix and entity id, e.g. "draft:client:new". */
  key: string
  /** Debounce window in ms. Default 1000. */
  debounceMs?: number
  /** Disable autosave (e.g. when editing existing record). Default false. */
  disabled?: boolean
}

/**
 * Persists a react-hook-form's values to localStorage every `debounceMs`
 * of inactivity, and rehydrates on mount. Use only on "new" forms — pass
 * `disabled` for edit forms or any flow with sensitive data.
 *
 * Returns an imperative `clearDraft` to wipe storage on successful submit.
 */
export function useAutosaveDraft<TForm extends FieldValues>(
  form: UseFormReturn<TForm>,
  { key, debounceMs = 1000, disabled = false }: Options,
) {
  const restoredRef = useRef(false)

  // Restore draft on mount.
  useEffect(() => {
    if (disabled || restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<TForm>
      // Only reset fields that are currently empty / falsy to avoid clobbering
      // explicit defaults that might come from props.
      const current = form.getValues()
      const merged: Record<string, unknown> = { ...current }
      for (const [k, v] of Object.entries(parsed)) {
        const cur = (current as Record<string, unknown>)[k]
        if (cur == null || cur === '' || (Array.isArray(cur) && cur.length === 0)) {
          merged[k] = v
        }
      }
      form.reset(merged as TForm, { keepDefaultValues: true })
    } catch {
      /* ignore corrupt drafts */
    }
    // form is stable, key drives behaviour
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, disabled])

  // Subscribe to changes; debounce write.
  useEffect(() => {
    if (disabled) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const sub = form.watch((values) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          localStorage.setItem(key, JSON.stringify(values))
        } catch {
          /* quota or serialisation error — ignore */
        }
      }, debounceMs)
    })
    return () => {
      if (timer) clearTimeout(timer)
      sub.unsubscribe()
    }
  }, [form, key, debounceMs, disabled])

  const clearDraft = () => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }

  return { clearDraft }
}

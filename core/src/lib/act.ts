import { toast } from 'sonner'

/** What went wrong, in a sentence a person can act on. */
export function problem(e: unknown) {
  const text = e instanceof Error ? e.message : String(e)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Run a change, toast the outcome, and hand back the result (undefined if it failed). */
export async function act<T>(work: Promise<T>, done?: string | ((r: T) => string)): Promise<T | undefined> {
  try {
    const result = await work
    if (done) toast(typeof done === 'string' ? done : done(result))
    return result
  } catch (e) {
    toast.error(problem(e))
    return undefined
  }
}

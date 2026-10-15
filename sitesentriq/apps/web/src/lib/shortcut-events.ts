/**
 * Custom DOM event names used to trigger keyboard-shortcut surfaces from
 * components that don't have direct access to the layout state (e.g. the
 * sidebar collapse footer link).
 *
 * Strings are intentionally namespaced under `fos:` (Facilities OS) so they
 * never collide with framework or third-party events.
 */

/** Open the keyboard shortcuts help overlay. */
export const OPEN_HELP_EVENT = 'fos:open-help'

/** Open the command palette. */
export const OPEN_PALETTE_EVENT = 'fos:open-palette'

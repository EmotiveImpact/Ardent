import type { ReactNode } from 'react'

/**
 * Sticky bottom action bar for mobile detail pages. Renders a fixed bar on
 * screens <640px (sm breakpoint); on larger screens it returns null so desktop
 * layouts keep their existing header buttons.
 *
 * Usage:
 *   <MobileActionBar>
 *     <Button color="primary" fullWidth onPress={save}>Save</Button>
 *   </MobileActionBar>
 */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Spacer so the fixed bar doesn't cover content on small screens */}
      <div className="h-20 sm:hidden" aria-hidden="true" />
      <div
        role="toolbar"
        aria-label="Page actions"
        className="sm:hidden fixed inset-x-0 bottom-0 z-30 bg-surface-card/95 backdrop-blur-md border-t border-border-default px-4 py-3 flex items-center gap-2 [box-shadow:0_-4px_12px_-4px_rgba(0,0,0,0.25)]"
      >
        {children}
      </div>
    </>
  )
}

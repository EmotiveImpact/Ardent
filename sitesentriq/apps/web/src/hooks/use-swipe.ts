import { useCallback, useRef } from 'react'

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

interface SwipeOptions {
  /** Minimum distance in px before a gesture is treated as a swipe. */
  threshold?: number
  /** Maximum perpendicular drift before the gesture is rejected. */
  maxOffAxis?: number
  /** Maximum gesture duration (ms) — guards against scroll detection. */
  maxDurationMs?: number
  onSwipe?: (direction: SwipeDirection) => void
  onSwipedLeft?: () => void
  onSwipedRight?: () => void
  onSwipedUp?: () => void
  onSwipedDown?: () => void
}

/**
 * Lightweight pointer-event swipe detector with no deps. Returns props you can
 * spread on any element. Used for swipe-to-archive on notifications and as a
 * lower-level utility when framer-motion drag isn't appropriate.
 */
export function useSwipe(options: SwipeOptions = {}) {
  const {
    threshold = 60,
    maxOffAxis = 80,
    maxDurationMs = 800,
    onSwipe,
    onSwipedLeft,
    onSwipedRight,
    onSwipedUp,
    onSwipedDown,
  } = options

  const start = useRef<{ x: number; y: number; t: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, t: performance.now() }
  }, [])

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const s = start.current
      start.current = null
      if (!s) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      const dt = performance.now() - s.t
      if (dt > maxDurationMs) return

      const absX = Math.abs(dx)
      const absY = Math.abs(dy)

      // Horizontal swipe
      if (absX >= threshold && absY <= maxOffAxis && absX > absY) {
        const dir: SwipeDirection = dx > 0 ? 'right' : 'left'
        onSwipe?.(dir)
        if (dir === 'right') onSwipedRight?.()
        else onSwipedLeft?.()
        return
      }
      // Vertical swipe
      if (absY >= threshold && absX <= maxOffAxis && absY > absX) {
        const dir: SwipeDirection = dy > 0 ? 'down' : 'up'
        onSwipe?.(dir)
        if (dir === 'down') onSwipedDown?.()
        else onSwipedUp?.()
      }
    },
    [maxDurationMs, maxOffAxis, threshold, onSwipe, onSwipedDown, onSwipedLeft, onSwipedRight, onSwipedUp],
  )

  const onPointerCancel = useCallback(() => {
    start.current = null
  }, [])

  return { onPointerDown, onPointerUp, onPointerCancel }
}

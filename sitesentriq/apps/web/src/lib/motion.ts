// Shared motion vocabulary — the single source of truth for animation
// timing across the dashboard. Scattered, hand-tuned durations/easings are
// the #1 "assembled by hand" tell; centralising them here is what makes the
// whole app feel like one coherent, designed product.
//
// Reduced-motion is handled GLOBALLY by `<MotionConfig reducedMotion="user">`
// at the app root (main.tsx) — framer automatically disables transform/layout
// animation (keeping opacity) for users who prefer reduced motion, so
// individual components don't each need to branch on it.
//
// Rules of the house:
//  - animate transform (x/y/scale) + opacity ONLY — never width/height/top.
//  - fast: 150–250ms. Slow motion reads as amateur.
//  - one easing curve everywhere (EASE_OUT) unless a spring is called for.

import type { Transition, Variants } from 'framer-motion'

/** The signature easing curve — a soft, confident decelerate. Shared by the
 *  page transition, list entrances, and KPI tiles so everything eases alike. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

/** Canonical durations (seconds). Reach for these instead of inline numbers. */
export const DURATION = {
  fast: 0.15,
  base: 0.22,
  slow: 0.4,
} as const

/** Canonical springs for physical micro-interactions (press, pop). */
export const SPRING = {
  /** Snappy — buttons, taps. */
  snappy: { type: 'spring', stiffness: 500, damping: 30 } as Transition,
  /** Smooth — drawers, larger surfaces. */
  smooth: { type: 'spring', stiffness: 400, damping: 32 } as Transition,
} as const

/** Page / section enter — rise + fade. Use as the default surface entrance. */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
}

/** Stagger container — children cascade in. Pair with `staggerItem` on each child. */
export function staggerContainer(stagger = 0.04, delayChildren = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren } },
  }
}

/** One staggered child (grid cell, card). Inherits enter/exit from the container. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: 4, transition: { duration: DURATION.fast, ease: EASE_OUT } },
}

/** whileTap press — give clickable surfaces a physical feel. Keep it ~2-3%. */
export const pressable = {
  whileTap: { scale: 0.97 },
  transition: SPRING.snappy,
} as const

/** whileHover lift — subtle rise for interactive cards. */
export const hoverLift = {
  whileHover: { y: -2 },
  transition: { duration: DURATION.fast, ease: EASE_OUT },
} as const

/**
 * Motion props for a single list/table row. Wrap the row list in
 * `<AnimatePresence initial={false}>` so removed rows animate OUT (filter,
 * delete, realtime invalidation) instead of vanishing, and keep `layout`
 * so surviving rows SLIDE to their new position on sort. The index stagger
 * gives the cascade-in on first paint and is capped so long lists don't
 * crawl. Spread onto a `motion.tr`/`motion.li`:
 *
 *   <motion.tr key={row.id} {...listRowMotion(i)} className="…">
 */
export function listRowMotion(index: number) {
  return {
    layout: 'position' as const,
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, x: -8 },
    transition: {
      duration: DURATION.base,
      ease: EASE_OUT,
      delay: Math.min(index * 0.03, 0.3),
    },
  }
}

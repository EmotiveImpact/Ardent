import { forwardRef } from 'react'
import { Button, type ButtonProps } from '@haumea/ui'
import { motion } from 'framer-motion'
import { SPRING } from '@/lib/motion'

/**
 * Primary button with a subtle press scale (0.98). Wraps the HeroUI Button
 * in a motion.span so we don't have to fight HeroUI/motion type composition.
 * Use only for primary actions — keep it scarce so the affordance stays meaningful.
 */
export const AnimatedButton = forwardRef<HTMLButtonElement, ButtonProps>(function AnimatedButton(
  props,
  ref,
) {
  return (
    <motion.span
      whileTap={{ scale: 0.97 }}
      transition={SPRING.snappy}
      style={{ display: 'inline-block' }}
    >
      <Button ref={ref} {...props} />
    </motion.span>
  )
})

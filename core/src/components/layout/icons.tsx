import { cn } from '@/lib/utils'

/* Ardent's own icon set for the rail and the top bar: one stroke weight, drawn on a 24 grid. */

export const paths = {
  today: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4',
  jobs: 'M7 4h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4V2.5h6V4M8.5 10h7M8.5 14h7M8.5 18h4',
  diary: 'M5.5 5h13a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3.5 10h17M8 2.5v5M16 2.5v5',
  customers: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM4 21c1.2-4.2 4.4-6 8-6s6.8 1.8 8 6',
  money: 'M16 5.5A4.5 4.5 0 0 0 8.5 9v3.5c0 3-1.5 5.5-3 7h13M6 13h8',
  certs: 'M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6zM8.5 12l2.5 2.5 4.5-5',
  crew: 'M9 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7zM2.5 20c.9-3.6 3.4-5.5 6.5-5.5s5.6 1.9 6.5 5.5M17 6.2a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 1 0 0-5.6zM17 14.5c2.4 0 4 1.5 4.6 4.5',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM15.5 15.5L20 20',
  back: 'M19 12H5M11 6l-6 6 6 6',
  forward: 'M5 12h14M13 6l6 6-6 6',
  wall: 'M3.5 5h17v11h-17zM9 20h6M12 16v4',
  chevron: 'M6 9.5l6 6 6-6',
  plus: 'M12 5v14M5 12h14',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, className, strokeWidth = 1.6 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn('size-[18px] shrink-0', className)}>
      <path d={paths[name]} />
    </svg>
  )
}

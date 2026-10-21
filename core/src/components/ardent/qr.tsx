import { useMemo } from 'react'
import qrcode from 'qrcode-generator'
import { cn } from '@/lib/utils'

/*
 * A QR code drawn as one SVG path: dark squares on a white tile, so any phone
 * camera reads it. The tile is a fill with room round the code, never a border.
 */

/** The dark squares of a QR code for `value`, as SVG path data, and how many squares across it is. */
function qrPath(value: string) {
  const qr = qrcode(0, 'M')
  qr.addData(value)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue
      // Join a run of dark squares on a row into one rectangle.
      let run = 1
      while (c + run < n && qr.isDark(r, c + run)) run++
      d += `M${c} ${r}h${run}v1h-${run}z`
      c += run - 1
    }
  }
  return { d, n }
}

export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { d, n } = useMemo(() => qrPath(value), [value])
  const quiet = 2
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-quiet} ${-quiet} ${n + quiet * 2} ${n + quiet * 2}`}
      shapeRendering="crispEdges"
      className={cn('block aspect-square rounded-[12px] bg-[#f2f2f2]', className)}
    >
      <path d={d} fill="#070707" />
    </svg>
  )
}

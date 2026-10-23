import { useEffect } from 'react'
import { clock } from '@kit'
import { Big, FullScreenButton, useFullScreen } from '@/components/wall-parts'
import { CrewMap } from '@/components/dashboard/crew-map'
import { useArdent, useBook } from '@/data/ardent'
import { useNow } from '@/hooks/use-now'
import { isDone, onDay, today } from '@/lib/jobs'

/*
 * Core's wall: the crew map alone, for a screen on the office wall, opened by
 * Send to screen. Signed in from the same browser; looks again every 20 seconds.
 */
export function CoreWall() {
  const { refresh, me } = useArdent()
  const { data: book } = useBook()
  const now = useNow(1000)
  const full = useFullScreen()
  useEffect(() => {
    const id = setInterval(refresh, 20_000)
    document.title = 'Ardent Core · Wall'
    return () => clearInterval(id)
  }, [refresh])
  const day = today()
  const todays = book?.jobs.filter((j) => onDay(j.start, day) && j.status !== 'cancelled') ?? []
  const ops = book?.operators ?? []
  return (
    <div className="fixed inset-0 flex flex-col bg-[#030303]">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-10 gap-y-5 px-5 pt-5 pb-5 lg:px-9 lg:pt-7">
        <div className="min-w-0">
          <p className="cap flex items-center gap-2.5 text-[12px] lg:text-[13px]">
            <span className="size-2 rounded-full bg-ok" />
            Live <span className="text-foreground">{clock(new Date(now).toISOString())}</span>
          </p>
          <p className="op-title mt-3 truncate text-[20px] text-foreground lg:text-[28px]">{me?.organisation.name ?? 'The crew'}</p>
        </div>
        {book && (
          <dl className="grid grid-cols-2 gap-x-7 gap-y-4 sm:grid-cols-4 lg:gap-x-14">
            <Big label="On site" value={ops.filter((o) => o.state === 'on_site').length} />
            <Big label="On the road" value={ops.filter((o) => o.state === 'en_route' || o.state === 'delayed').length} />
            <Big label="Jobs today" value={todays.length} unit={`${todays.filter(isDone).length} done`} />
            <Big label="Running late" value={ops.filter((o) => o.state === 'delayed').length} tone={ops.some((o) => o.state === 'delayed') ? 'text-warn' : undefined} />
          </dl>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {book ? <CrewMap operators={book.operators} jobs={book.jobs} sites={book.sites} wall /> : <div className="flex size-full items-center justify-center"><span className="caps animate-pulse text-faint">Ardent</span></div>}
        <div className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2">
          <FullScreenButton full={full} />
        </div>
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { clock } from '@kit'
import { Big, FullScreenButton, useFullScreen } from '@/components/wall-parts'
import { useNow } from '@/hooks/use-now'
import { useEvery, useHqQuery } from './data'
import { HqMap } from './map'
import { counts } from './live'

/*
 * The wall: the live map alone, for a screen on the office wall. Big numbers,
 * no menus, looks again every 20 seconds. Sent here by Send to screen, signed
 * in from the same browser.
 */

export function Wall() {
  useEvery(20_000)
  const now = useNow(1000)
  const full = useFullScreen()
  const [params] = useSearchParams()
  const firmIds = (params.get('firm') ?? '').split(',').filter(Boolean)
  const { data, error } = useHqQuery((hq) => Promise.all([hq.overview(), hq.live()]))
  const [overview, board] = data ?? []
  const keep = (x: { firmId: string }) => !firmIds.length || firmIds.includes(x.firmId)
  const firms = (overview?.firms ?? []).filter((f) => !firmIds.length || firmIds.includes(f.id))
  const jobs = board?.jobs.filter(keep) ?? []
  const vans = board?.vans.filter(keep) ?? []
  const n = board && counts({ ...board, jobs, vans }, firms)

  useEffect(() => {
    document.title = 'Ardent HQ · Wall'
    return () => {
      document.title = 'Ardent HQ'
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-[#030303]">
      {board ? <HqMap jobs={jobs} vans={vans} firms={firms} big fitKey={firmIds.join(',')} /> : <div className="flex size-full items-center justify-center"><span className="caps animate-pulse text-faint">{error ? `The map could not load: ${error.message}` : 'Ardent HQ'}</span></div>}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 bg-gradient-to-b from-black/90 via-black/60 to-transparent px-5 pt-5 pb-14 lg:px-9 lg:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
          <div className="min-w-0">
            <p className="cap flex items-center gap-2.5 text-[12px] lg:text-[13px]">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ok" />
                <span className="relative size-2 rounded-full bg-ok" />
              </span>
              Ardent HQ · Live
              <span className="text-foreground">{clock(new Date(now).toISOString())}</span>
            </p>
            <p className="op-title mt-3 truncate text-[20px] text-foreground lg:text-[28px]">{firmIds.length && firms.length ? firms.map((f) => f.name.split(' ')[0]).join(', ') : 'Every firm'}</p>
          </div>
          {n && (
            <dl className="grid grid-cols-3 gap-x-7 gap-y-4 sm:grid-cols-5 lg:gap-x-14">
              <Big label="Firms live" value={n.firmsLive} />
              <Big label="On shift" value={n.onShift} />
              <Big label="Jobs today" value={n.jobs} unit={`${n.done} done`} />
              <Big label="On site" value={n.onSite} />
              <Big label="Emergencies" value={n.emergencies} tone={n.emergencies ? 'text-danger' : undefined} />
            </dl>
          )}
        </div>
      </div>

      <div className="absolute right-14 bottom-3 z-40">
        <FullScreenButton full={full} />
      </div>
    </div>
  )
}

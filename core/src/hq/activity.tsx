import { useState } from 'react'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead } from '@/components/ardent/parts'
import { useHqQuery } from './data'
import { LogRows } from './firm'
import { Chip, Failed, Loading, who } from './parts'

/* Every firm's log in one place, newest first: what people did, what Ardent did, and what Ardent's own team did. */

const WHO = [
  { key: 'all', label: 'Everyone' },
  { key: 'person', label: 'People in firms' },
  { key: 'ardent', label: 'Ardent' },
  { key: 'staff', label: 'Ardent staff' },
] as const

export function Activity() {
  const [firmId, setFirmId] = useState<string>()
  const [by, setBy] = useState<(typeof WHO)[number]['key']>('all')
  const { data: firms } = useHqQuery((hq) => hq.firms())
  const { data, error } = useHqQuery((hq) => hq.log(firmId), [firmId])
  const list = (data ?? []).filter((e) => by === 'all' || who(e).kind === by)
  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageBar crumbs={[{ label: 'Activity' }]} />
      <PageHead title="Activity" eyebrow={<span>Every firm's log</span>} sub="What happened across Ardent, newest first, and who did it." className="pb-0" />
      <div className="flex flex-col gap-2">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Firm">
          <Chip on={!firmId} onClick={() => setFirmId(undefined)}>
            Every firm
          </Chip>
          {firms?.map((f) => (
            <Chip key={f.id} on={firmId === f.id} onClick={() => setFirmId(f.id)}>
              {f.name}
            </Chip>
          ))}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Who did it">
          {WHO.map((w) => (
            <Chip key={w.key} on={by === w.key} onClick={() => setBy(w.key)}>
              {w.label}
            </Chip>
          ))}
        </div>
      </div>
      <Failed error={error} />
      {!data && !error ? (
        <Loading />
      ) : (
        <Card className="px-4 py-2">
          <LogRows entries={list} firm={!firmId} />
        </Card>
      )}
    </div>
  )
}

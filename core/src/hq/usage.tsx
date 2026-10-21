import { Link } from 'react-router'
import { pounds } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, SectionHead } from '@/components/ardent/parts'
import { useHqQuery } from './data'
import { BillLines, UsageLines } from './firm'
import { Failed, Loading, Meter, State, stageWord } from './parts'

/* What every firm uses this month against its plan and caps, what it pays, and what that adds up to. */

export function Usage() {
  const { data, error } = useHqQuery((hq) => hq.overview())
  if (!data) return error ? <Failed error={error} /> : <Loading className="mt-8" />
  const t = data.totals
  const firms = [...data.firms].sort((a, b) => b.bill.total - a.bill.total)
  const extra = data.firms.reduce((s, f) => s + f.usage.extraCost, 0)
  const live = data.firms.filter((f) => f.stage === 'live')
  return (
    <div className="flex flex-col gap-8 pb-6">
      <PageBar crumbs={[{ label: 'Usage and costs' }]} />
      <PageHead
        title="Usage and costs"
        eyebrow={<span>This month, every firm</span>}
        sub="Each firm's AI, calls and texts against what its plan includes, the caps it set, and its bill. Monthly revenue counts live firms only."
        figures={[
          { label: 'Monthly revenue', value: pounds(t.monthly), unit: `${live.length} live firms` },
          { label: 'AI used', value: pounds(t.aiPence), unit: `of ${pounds(t.aiCapPence)} in caps` },
          { label: 'Past the plans', value: pounds(extra) },
        ]}
        className="pb-0"
      />

      <Card className="p-5">
        <SectionHead title="AI across every firm" aside={`${t.aiCapPence ? Math.round((t.aiPence / t.aiCapPence) * 100) : 0}% of the caps used`} />
        <Meter used={t.aiPence} cap={t.aiCapPence} />
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {firms.map((f) => (
          <Card key={f.id} className="flex flex-col gap-5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/firms/${f.id}?tab=usage`} className="text-[16px] hover:underline">
                  {f.name}
                </Link>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted">
                  <State tone={f.stage === 'live' ? 'ok' : 'warn'} className="text-[12.5px]">
                    {stageWord[f.stage]}
                  </State>
                  <span>
                    {f.engineers} engineers · AI cap {pounds(f.aiCap)}
                  </span>
                </p>
              </div>
              <p className="op-number shrink-0 text-[24px]">
                {pounds(f.bill.total)}
                <span className="ml-1.5 font-mono text-[11px] text-muted">a month</span>
              </p>
            </div>
            {f.usage.aiPaused && <p className="rounded-[10px] bg-inset px-3.5 py-2.5 text-[13px] text-warn">AI cap reached. Ardent is working without AI until the month ends or the firm raises the cap.</p>}
            <UsageLines usage={f.usage} />
            <div className="rounded-[12px] bg-inset px-4 py-1">
              <BillLines bill={f.bill} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

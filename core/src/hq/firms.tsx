import { useState } from 'react'
import { useNavigate } from 'react-router'
import { pounds, relative, trade as TRADE } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead } from '@/components/ardent/parts'
import { fieldClass } from '@/components/ui/field'
import type { FirmSummary } from '@/data/hq'
import { cn } from '@/lib/utils'
import { useHqQuery } from './data'
import { Chip, Failed, healthTone, Loading, State, stageWord } from './parts'

/* Every firm on Ardent, how its day is going and what it pays. */

export const trades = (f: FirmSummary) => f.trades.map((t) => TRADE[t] ?? t).join(', ')

export function Firms() {
  const { data, error } = useHqQuery((hq) => hq.overview())
  const [stage, setStage] = useState<'all' | FirmSummary['stage']>('all')
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const list = (data?.firms ?? []).filter((f) => (stage === 'all' || f.stage === stage) && words.every((w) => `${f.name} ${f.town} ${f.trades.join(' ')}`.toLowerCase().includes(w)))
  const open = (f: FirmSummary) => navigate(`/firms/${f.id}`)
  const t = data?.totals

  return (
    <div className="flex flex-col gap-8 pb-6">
      <PageBar crumbs={[{ label: 'Firms' }]} />
      <PageHead
        title="Firms"
        eyebrow={<span>Every firm on Ardent</span>}
        sub="Open a firm to see its day, its jobs, crew, money and how it has set Ardent up. Opening a firm's account is recorded in its own log."
        figures={
          t && [
            { label: 'Firms', value: t.firms, unit: `${t.settingUp} setting up` },
            { label: 'Engineers', value: t.engineers, unit: `${t.engineersActive} on shift` },
            { label: 'A month', value: pounds(t.monthly) },
          ]
        }
        className="pb-0"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Chip on={stage === 'all'} onClick={() => setStage('all')} count={data?.firms.length}>
          All
        </Chip>
        <Chip on={stage === 'live'} onClick={() => setStage('live')} count={data?.firms.filter((f) => f.stage === 'live').length}>
          Live
        </Chip>
        <Chip on={stage === 'setting_up'} onClick={() => setStage('setting_up')} count={data?.firms.filter((f) => f.stage === 'setting_up').length}>
          Setting up
        </Chip>
        <input aria-label="Find a firm" className={cn(fieldClass, 'h-9 w-full sm:ml-auto sm:w-[260px]')} placeholder="Find a firm or town" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Failed error={error} />
      {!data && !error && <Loading />}

      {data && (
        <>
          {/* Wide screens: one table. */}
          <Card className="hidden p-2 lg:block">
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="cap [&>th]:px-3 [&>th]:py-3 [&>th]:font-normal">
                  <th>Firm</th>
                  <th>Trades</th>
                  <th>Stage</th>
                  <th className="text-right">On shift</th>
                  <th className="text-right">Jobs today</th>
                  <th className="text-right">Live now</th>
                  <th>Health</th>
                  <th className="text-right">Bill</th>
                  <th className="text-right">Last active</th>
                </tr>
              </thead>
              <tbody className="rows">
                {list.map((f) => (
                  <tr key={f.id} tabIndex={0} onClick={() => open(f)} onKeyDown={(e) => e.key === 'Enter' && open(f)} className="cursor-pointer outline-none transition-colors hover:bg-raised/60 focus-visible:bg-raised/60 [&>td]:px-3 [&>td]:py-3.5">
                    <td className="rounded-l-[10px]">
                      <span className="block text-[14px] text-foreground">{f.name}</span>
                      <span className="block text-[12px] text-muted">{f.town}</span>
                    </td>
                    <td className="text-muted">{trades(f)}</td>
                    <td>
                      <State tone={f.stage === 'live' ? 'ok' : 'warn'}>{stageWord[f.stage]}</State>
                    </td>
                    <td className="text-right font-mono">
                      {f.engineersActive}
                      <span className="text-muted"> / {f.engineers}</span>
                    </td>
                    <td className="text-right font-mono">{f.jobsToday}</td>
                    <td className="text-right font-mono">
                      {f.liveNow}
                      {f.emergencies > 0 && <span className="ml-2 text-danger">{f.emergencies} emerg</span>}
                    </td>
                    <td className="max-w-[240px]">
                      <State tone={healthTone[f.health.tone]}>{f.health.label}</State>
                      <span className="mt-0.5 block truncate text-[12px] text-muted" title={f.health.note}>
                        {f.health.note}
                      </span>
                    </td>
                    <td className="text-right font-mono">{pounds(f.bill.total)}</td>
                    <td className="rounded-r-[10px] text-right font-mono text-[12px] text-muted">{f.lastActive ? relative(f.lastActive) : 'Not yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length === 0 && <p className="px-3 py-8 text-center text-[14px] text-muted">No firm matches.</p>}
          </Card>

          {/* Phones and tablets: a card each. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {list.map((f) => (
              <button key={f.id} type="button" onClick={() => open(f)} className="flex flex-col gap-3 rounded-[14px] bg-surface p-4 text-left outline-none transition-colors hover:bg-[#161616] focus-visible:ring-2 focus-visible:ring-ring/60">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[15px]">{f.name}</span>
                    <span className="block text-[12px] text-muted">
                      {f.town} · {trades(f)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[13px]">{pounds(f.bill.total)}</span>
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  <State tone={f.stage === 'live' ? 'ok' : 'warn'}>{stageWord[f.stage]}</State>
                  {f.health.label !== stageWord[f.stage] && <State tone={healthTone[f.health.tone]}>{f.health.label}</State>}
                </span>
                <span className="grid grid-cols-3 gap-2 font-mono text-[12px] text-muted">
                  <span>
                    <span className="text-foreground">{f.engineersActive}</span>/{f.engineers} on shift
                  </span>
                  <span>
                    <span className="text-foreground">{f.jobsToday}</span> today
                  </span>
                  <span>
                    <span className={f.emergencies ? 'text-danger' : 'text-foreground'}>{f.liveNow}</span> live
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

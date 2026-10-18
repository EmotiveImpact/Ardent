import { PageHeader } from '@/components/ui/panel'
import { useState } from 'react'
import { CalendarRange, ChevronDown, Clock, LayoutGrid, PoundSterling, ShieldAlert, TrendingUp, Wrench } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { LiveBoard } from '@/components/dashboard/live-board'
import { JobSheet } from '@/components/dashboard/job-sheet'
import { ExceptionsTable } from '@/components/dashboard/exceptions-table'
import { jobs, kpiSeries } from '@/data/mock'

const ranges = ['Today', 'This week', 'This month', 'Last 30 days']

export function Dashboard() {
  const [range, setRange] = useState('Today')
  const live = jobs.find((j) => j.id === 'job_1042')!
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
      <PageHeader eyebrow="Morning, Edem. Sunday 18 October" title="TODAY" aside={<span className="caps flex h-8 items-center gap-2 rounded-md bg-surface px-3 text-muted"><span className="size-1.5 rounded-full bg-ok" />3 vans out</span>} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">
              <LayoutGrid /> Overview
            </TabsTrigger>
            <TabsTrigger value="dispatch">
              <CalendarRange /> Dispatch
            </TabsTrigger>
            <TabsTrigger value="money">
              <TrendingUp /> Money
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {range} <ChevronDown className="text-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={range} onValueChange={setRange}>
              {ranges.map((r) => (
                <DropdownMenuRadioItem key={r} value={r}>
                  {r}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <KpiCard
          icon={<Wrench />}
          title="Jobs completed"
          value={24}
          format={(n) => String(Math.round(n))}
          unit="of 31"
          index={0}
          series={kpiSeries.jobs}
          color="var(--fg)"
          caption="Completion up by"
          delta="+18%"
          good
        />
        <KpiCard
          icon={<Clock />}
          title="Avg. response"
          value={102}
          format={(n) => `${Math.floor(n / 60)}h ${String(Math.round(n % 60)).padStart(2, '0')}`}
          unit="m"
          index={1}
          series={kpiSeries.response}
          color="var(--fg)"
          caption="Response time up by"
          delta="+12m"
          good={false}
        />
        <KpiCard
          icon={<PoundSterling />}
          title="Invoiced"
          prefix="£"
          value={842050}
          format={(n) => (Math.round(n) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          index={2}
          series={kpiSeries.invoiced}
          color="var(--fg)"
          caption="Takings up by"
          delta="+£1,180"
          good
        />
        <KpiCard
          icon={<ShieldAlert />}
          title="Overdue certificates"
          value={7}
          format={(n) => String(Math.round(n))}
          index={3}
          series={kpiSeries.exceptions}
          color="var(--danger)"
          caption="Overdue up by"
          delta="+2"
          good={false}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <LiveBoard />
          <ExceptionsTable />
        </div>
        <div className="min-w-0 xl:max-h-[calc(100vh-8.5rem)] xl:sticky xl:top-0">
          <JobSheet job={live} />
        </div>
      </div>
    </div>
  )
}

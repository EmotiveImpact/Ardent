import { PageBar } from '@/components/layout/bar'
import { PageHead } from '@/components/ardent/parts'
import { ActivityLog, DecidedLately, WaitingForYes } from '@/components/ardent/office'
import { SectionHead } from '@/components/ardent/parts'

/** What Ardent has drafted for a yes, and the log of everything done. */
export function Approvals() {
  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Approvals' }]} />
      <PageHead
        title="Approvals"
        sub="Ardent drafts these from your records when a job finishes, a quote is ready or an invoice runs late. Email isn't connected yet, so a yes marks it sent and logs who said so."
        className="pb-0"
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col gap-3">
          <SectionHead title="Waiting for a yes" className="pb-0" />
          <WaitingForYes />
        </section>
        <div className="flex min-w-0 flex-col gap-4">
          <DecidedLately />
          <ActivityLog />
        </div>
      </div>
    </div>
  )
}

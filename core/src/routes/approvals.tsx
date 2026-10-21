import { Link } from 'react-router'
import { PageBar } from '@/components/layout/bar'
import { barButton } from '@/components/layout/topbar'
import { PageHead } from '@/components/ardent/parts'
import { ActivityLog, DecidedLately, WaitingForYes } from '@/components/ardent/office'
import { SectionHead } from '@/components/ardent/parts'

/** What Ardent has drafted for a yes, and the log of everything done. */
export function Approvals() {
  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar
        crumbs={[{ label: 'Approvals' }]}
        actions={
          <Link to="/approvals/rules" className={barButton}>
            Ardent's rules
          </Link>
        }
      />
      <PageHead
        title="Approvals"
        sub="Ardent drafts these from your records when a job finishes, a quote is ready or an invoice runs late. Refunds wait here too. Email isn't connected yet, so a yes on a message marks it sent and logs who said so; a yes on a refund sends the money back through Stripe."
        className="pb-0"
      >
        <Link to="/approvals/rules" className="mt-3 inline-block text-[13px] text-muted underline-offset-4 hover:text-foreground hover:underline sm:hidden">
          Ardent's rules: what it does alone and what waits for you
        </Link>
      </PageHead>
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

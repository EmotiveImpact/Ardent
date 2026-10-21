import { initials } from '@kit'
import { PageBar } from '@/components/layout/bar'
import { Card, Initials, PageHead, RowButton, SectionHead } from '@/components/ardent/parts'
import { Fact, GreyButton, HoldEmber } from '@/components/ardent/money-parts'
import { useArdent, useBook, useQuery } from '@/data/ardent'
import { act } from '@/lib/act'
import { find } from '@/lib/jobs'
import { cn } from '@/lib/utils'

type Role = 'owner' | 'office' | 'field'
type Member = { userId: string; role: Role; name: string; email: string; operatorId?: string }

const roleWord: Record<Role, string> = { owner: 'Owner', office: 'Office', field: 'Field' }
const roleNote: Record<Role, string> = {
  owner: 'everything, including people and roles',
  office: 'jobs, customers, money and crew',
  field: 'their own jobs, on Ardent Field',
}
const roles: Role[] = ['owner', 'office', 'field']

/** Everyone with a sign-in to this firm. */
function useMembers() {
  const { admin } = useArdent()
  return useQuery(() => admin<Member[]>('members'))
}

export function Settings() {
  const { me, mode, admin, signOut, reset } = useArdent()
  const { data: members } = useMembers()
  const { data: book } = useBook()
  if (!me) return null
  const owner = me.role === 'owner'
  const people = [...(members ?? [])].sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role) || a.name.localeCompare(b.name))

  return (
    <div className="flex flex-col gap-10 pb-6">
      <PageBar crumbs={[{ label: 'Settings' }]} />
      <PageHead title="Settings" book={book} sub="Your firm, your sign-in, and who else can sign in." className="pb-0" />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="flex flex-col gap-3 p-6">
            <SectionHead title="Your firm" className="pb-0" />
            <div className="rows">
              <Fact label="Name on invoices">
                <span className="text-foreground">{me.organisation.name}</span>
              </Fact>
              <Fact label="Short name">
                <span className="font-mono">{me.organisation.slug}</span>
              </Fact>
              <Fact label="Set up for">{me.organisation.industry === 'trades' ? 'Ardent for Trades' : me.organisation.industry}</Fact>
              <Fact label="Pay within">
                <span className="font-mono">14 days</span>
              </Fact>
              <Fact label="Crew on the books">
                <span className="font-mono">{book?.operators.length ?? '--'}</span>
              </Fact>
            </div>
            <p className="text-[12.5px] text-faint">Your address, VAT number and bank details aren't in Ardent yet, so invoices go out without them. The firm's name and payment terms can't be changed here yet.</p>
          </Card>

          <Card className="flex flex-col gap-3 p-6">
            <SectionHead title="Your sign-in" className="pb-0" />
            <div className="rows">
              <Fact label="Name">
                <span className="text-foreground">{me.user.name}</span>
              </Fact>
              <Fact label="Email">
                <span className="font-mono text-[12.5px]">{me.user.email}</span>
              </Fact>
              <Fact label="Role">{roleWord[me.role as Role] ?? me.role}</Fact>
              <Fact label="Records">
                {mode === 'demo' ? (
                  'The demo firm, kept in this browser'
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-ok" /> Ardent engine
                  </span>
                )}
              </Fact>
            </div>
            <div>
              <GreyButton onClick={() => void signOut()}>Sign out</GreyButton>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card className="px-6 pt-6 pb-3">
            <SectionHead title={`People with a sign-in · ${members?.length ?? ''}`} aside={owner && <RowButton to="/crew">Give someone a sign-in</RowButton>} className="pb-2" />
            {!members && <div className="h-40 animate-pulse rounded-[10px] bg-inset" />}
            <ul className="rows">
              {people.map((m) => {
                const self = m.userId === me.user.id
                const crew = find(book?.operators, m.operatorId)
                return (
                  <li key={m.userId} className="flex items-center gap-3.5 py-3">
                    <Initials className="font-display text-[10px]">{initials(m.name)}</Initials>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-[14px]">
                        {m.name}
                        {self && <span className="ml-1.5 text-muted">you</span>}
                      </span>
                      <span className="truncate font-mono text-[11px] text-muted">
                        {m.email}
                        {crew && crew.name !== m.name && <span className="ml-2">crew: {crew.name}</span>}
                      </span>
                    </span>
                    {owner && !self ? (
                      <label className="relative shrink-0">
                        <span className="sr-only">Role for {m.name}</span>
                        <select
                          value={m.role}
                          onChange={(e) => void act(admin('setRole', m.userId, e.target.value), `${m.name} is now ${roleWord[e.target.value as Role].toLowerCase()}`)}
                          className="cap h-[30px] cursor-pointer rounded-full bg-raised pl-3.5 [--chevron-inset:12px] text-foreground outline-none hover:bg-[#262626] focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {roleWord[r]}
                            </option>
                          ))}
                        </select>
                        <svg aria-hidden viewBox="0 0 12 12" className="pointer-events-none absolute top-1/2 right-2.5 size-2.5 -translate-y-1/2 text-muted">
                          <path d="M2.5 4.5l3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                      </label>
                    ) : (
                      <span className="cap flex h-[30px] shrink-0 items-center rounded-full bg-raised px-3">{roleWord[m.role]}</span>
                    )}
                  </li>
                )
              })}
            </ul>
            <dl className="mt-1 flex flex-col gap-1 pt-3 pb-1 text-[12.5px] text-muted shadow-[inset_0_1px_0_var(--line)]">
              {roles.map((r) => (
                <div key={r}>
                  <dt className="inline text-foreground/80">{roleWord[r]}:</dt> <dd className="inline">{roleNote[r]}.</dd>
                </div>
              ))}
              <p className={cn('pt-1.5', !owner && 'text-faint')}>{owner ? 'Give crew a sign-in from their card on the Crew screen.' : 'Only the owner changes roles.'}</p>
            </dl>
          </Card>

          {mode === 'demo' && reset && (
            <Card className="flex flex-col gap-3.5 p-6">
              <SectionHead title="Demo firm" className="pb-0" />
              <p className="text-[14px] text-[#c8c8c8]">Puts every job, customer and invoice back to how the demo started, with today's jobs moved to today. Anything you've added goes.</p>
              <HoldEmber label="Hold to start again" onCommit={() => void act(reset(), 'Demo put back as it started')} />
            </Card>
          )}
        </div>
      </div>

      <p className="text-[12.5px] text-faint">A price list for quotes and parts isn't in Ardent yet. Prices are set line by line on each job.</p>
    </div>
  )
}

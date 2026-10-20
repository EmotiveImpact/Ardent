import { type CSSProperties } from 'react'
import { Building2, LogOut, RotateCcw, Server, Users } from 'lucide-react'
import { Panel, PanelHeader, Row, Well, PageHeader } from '@/components/ui/panel'
import { Avatar } from '@/components/ui/avatar'
import { Badge, Chip } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HoldButton } from '@/components/ui/hold-button'
import { selectClass } from '@/components/ui/field'
import { initials } from '@kit'
import { useArdent, useBook } from '@/data/ardent'
import { act } from '@/lib/act'
import { find } from '@/lib/jobs'
import { cn } from '@/lib/utils'
import { useMembers, type Member } from '@/routes/crew'

const roleWord: Record<Member['role'], string> = { owner: 'Owner', office: 'Office', field: 'Field' }
const roleNote: Record<Member['role'], string> = {
  owner: 'Everything, including people and roles',
  office: 'Jobs, customers, money and crew',
  field: 'Their own jobs, on Ardent Field',
}

export function Settings() {
  const { me, mode, admin, signOut, reset } = useArdent()
  const { data: members } = useMembers()
  const { data: book } = useBook()
  const owner = me?.role === 'owner'
  if (!me) return null

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-3">
      <PageHeader eyebrow="Your firm, your people, your sign-in" title="Settings" />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHeader icon={<Building2 />} title="Firm" />
          <Well className="divide-y divide-line">
            <Row label="Name">{me.organisation.name}</Row>
            <Row label="Short name">
              <Chip>{me.organisation.slug}</Chip>
            </Row>
            <Row label="Set up for">{me.organisation.industry === 'trades' ? 'Ardent for Trades' : me.organisation.industry}</Row>
            <Row label="Crew on the books">
              <span className="font-mono">{book?.operators.length ?? '·'}</span>
            </Row>
          </Well>
        </Panel>

        <Panel style={{ '--i': 1 } as CSSProperties}>
          <PanelHeader icon={<Server />} title="Your sign-in" />
          <Well className="divide-y divide-line">
            <Row label="Name">{me.user.name}</Row>
            <Row label="Email">{me.user.email}</Row>
            <Row label="Role">
              <Badge tone="neutral">{roleWord[me.role]}</Badge>
            </Row>
            <Row label="Records">
              {mode === 'demo' ? (
                <span className="text-muted">The demo firm, kept in this browser</span>
              ) : (
                <span className="flex items-center gap-2 text-muted">
                  <span className="size-1.5 rounded-full bg-ok" /> Ardent engine
                </span>
              )}
            </Row>
            <div className="flex items-center justify-end gap-1.5 px-3 py-2.5">
              <Button variant="outline" size="sm" onClick={() => void signOut()}>
                <LogOut /> Sign out
              </Button>
            </div>
          </Well>
        </Panel>
      </div>

      <Panel style={{ '--i': 2 } as CSSProperties}>
        <PanelHeader icon={<Users />} title={`People with a sign-in · ${members?.length ?? 0}`} />
        <Well className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-muted">
              <tr className="border-b">
                <th className="h-10 px-3 font-normal">Person</th>
                <th className="px-3 font-normal">Crew record</th>
                <th className="px-3 font-normal">Can do</th>
                <th className="w-44 px-3 text-right font-normal">Role</th>
              </tr>
            </thead>
            <tbody>
              {[...(members ?? [])]
                .sort((a, b) => ['owner', 'office', 'field'].indexOf(a.role) - ['owner', 'office', 'field'].indexOf(b.role) || a.name.localeCompare(b.name))
                .map((m) => {
                  const self = m.userId === me.user.id
                  return (
                    <tr key={m.userId} className="border-b last:border-0">
                      <td className="h-14 px-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar initials={initials(m.name)} className="size-7" />
                          <span className="min-w-0">
                            <span className="block truncate">
                              {m.name}
                              {self && <span className="ml-1.5 text-faint">you</span>}
                            </span>
                            <span className="block truncate text-[12px] text-muted">{m.email}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 text-muted">{find(book?.operators, m.operatorId)?.name ?? <span className="text-faint">None</span>}</td>
                      <td className="px-3 text-[12px] text-muted">{roleNote[m.role]}</td>
                      <td className="px-3 text-right">
                        {owner && !self ? (
                          <select
                            aria-label={`Role for ${m.name}`}
                            className={cn(selectClass, 'h-8 w-36 text-[13px]')}
                            value={m.role}
                            onChange={(e) => void act(admin('setRole', m.userId, e.target.value), `${m.name} is now ${roleWord[e.target.value as Member['role']].toLowerCase()}`)}
                          >
                            {(['owner', 'office', 'field'] as const).map((r) => (
                              <option key={r} value={r}>
                                {roleWord[r]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge tone="neutral">{roleWord[m.role]}</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </Well>
        <p className="px-2.5 pt-2 pb-1 text-[12px] text-faint">{owner ? 'Give crew a sign-in from their card on the Crew screen.' : 'Only the owner changes roles.'}</p>
      </Panel>

      {mode === 'demo' && reset && (
        <Panel style={{ '--i': 3 } as CSSProperties}>
          <PanelHeader icon={<RotateCcw />} title="Demo firm" />
          <Well className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-[13px] text-muted">Everything you change here stays in this browser. Put the demo back to how it started, with today's jobs moved to today.</p>
            <HoldButton label="Hold to start again" onCommit={() => void act(reset(), 'Demo put back as it started')} className="sm:w-60" />
          </Well>
        </Panel>
      )}
    </div>
  )
}

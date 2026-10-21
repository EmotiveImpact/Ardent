import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { trade as TRADE_NAME } from '@kit'
import { describeCheck, describeReply, topicName } from '@kit/questions.ts'
import { PageBar } from '@/components/layout/bar'
import { Card, PageHead, SectionHead } from '@/components/ardent/parts'
import { greyButton } from '@/components/ardent/money-lib'
import { fieldClass } from '@/components/ui/field'
import type { SharedRule } from '@/data/hq'
import { act } from '@/lib/act'
import { cn } from '@/lib/utils'
import { useHq, useHqQuery } from './data'
import { Failed, Loading, Tag, when } from './parts'

/*
 * Questions firms wrote for themselves and offered to Ardent. Add one to the
 * playbook (it waits in the draft as new) or keep it as the firm's own, with
 * a note the firm sees in its log.
 */

export function Shared() {
  const { me } = useHq()
  const { data, error } = useHqQuery((hq) => hq.shared.list())
  const admin = me?.role === 'admin'
  if (!data) return error ? <Failed error={error} /> : <Loading className="mt-8" />
  const waiting = data.filter((s) => !s.review)
  const handled = data.filter((s) => s.review).sort((a, b) => b.review!.at.localeCompare(a.review!.at))
  return (
    <div className="flex flex-col gap-8 pb-6">
      <PageBar crumbs={[{ label: 'Shared by firms' }]} />
      <PageHead
        title="Shared by firms"
        eyebrow={<span>{waiting.length} waiting · {handled.length} handled</span>}
        sub="Questions a firm wrote for its own engineers and offered to Ardent. Add the good ones to the playbook so every firm gets them; the firm hears about it in its log."
        className="pb-0"
      />
      <section>
        <SectionHead title={`Waiting · ${waiting.length}`} />
        {waiting.length === 0 && <Card className="p-6 text-[14px] text-muted">Nothing waiting. New ones show here when a firm offers a question.</Card>}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {waiting.map((s) => (
            <SharedCard key={`${s.firmId}/${s.rule.id}`} s={s} admin={admin} />
          ))}
        </div>
      </section>
      <section>
        <SectionHead title={`Handled · ${handled.length}`} />
        {handled.length === 0 && <Card className="p-6 text-[14px] text-muted">None yet.</Card>}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {handled.map((s) => (
            <SharedCard key={`${s.firmId}/${s.rule.id}`} s={s} admin={admin} />
          ))}
        </div>
      </section>
    </div>
  )
}

function SharedCard({ s, admin }: { s: SharedRule; admin: boolean }) {
  const { hq } = useHq()
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const r = s.rule
  const adopt = async () => {
    setBusy(true)
    const done = await act(hq.shared.adopt(s.firmId, r.id))
    setBusy(false)
    if (done) toast(`“${r.name}” is in the playbook draft as new`, { description: 'Publish it from Playbook to send it to every firm.', action: { label: 'Playbook', onClick: () => (window.location.hash = '#/playbook') } })
  }
  const decline = async () => {
    setBusy(true)
    const done = await act(hq.shared.decline(s.firmId, r.id, note.trim()), `Kept as ${s.firmName}'s own question. They see the note in their log`)
    setBusy(false)
    if (done) setDeclining(false)
  }
  return (
    <Card className={cn('flex flex-col gap-3 p-5', s.review && 'opacity-75')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="cap">
            <Link to={`/firms/${s.firmId}?tab=questions`} className="hover:text-foreground">
              {s.firmName}
            </Link>
          </p>
          <h3 className="mt-2 text-[16px]">{r.name}</h3>
          <p className="mt-1 font-mono text-[11px] tracking-[.06em] text-muted uppercase">
            {r.trades ? r.trades.map((t) => TRADE_NAME[t] ?? t).join(', ') : 'Every trade'} · after {r.after === 'any' ? 'any answer' : r.after.map(topicName).join(', ')}
          </p>
        </div>
        {s.review?.state === 'adopted' && <Tag tone="ok">Added</Tag>}
        {s.review?.state === 'declined' && <Tag>Not for everyone</Tag>}
      </div>

      <p className="text-[15px] leading-[22px]">“{r.ask.replace('{said}', '…what they said…')}”</p>
      <div className="flex flex-wrap gap-1.5">
        {r.replies.map((b) => (
          <span key={b.label} className="inline-flex h-7 items-center rounded-full bg-raised px-3 text-[12.5px]">
            {b.label}
          </span>
        ))}
      </div>

      <dl className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
        <dt className="cap pt-0.5">When</dt>
        <dd className="flex flex-col gap-0.5 text-muted">
          {r.when.map((c, i) => (
            <span key={i}>{describeCheck(c)}</span>
          ))}
        </dd>
        <dt className="cap pt-0.5">Buttons</dt>
        <dd className="flex flex-col gap-0.5 text-muted">
          {r.replies.map((b) => (
            <span key={b.label}>
              <span className="text-foreground">{b.label}</span> {describeReply(b)}
            </span>
          ))}
        </dd>
        <dt className="cap pt-0.5">Their why</dt>
        <dd className="text-foreground/90">{r.why}</dd>
      </dl>

      <div className="grid grid-cols-2 gap-2 rounded-[10px] bg-inset px-3.5 py-3">
        <div>
          <p className="cap text-[10px]">Asked, 30 days</p>
          <p className="op-number mt-1.5 text-[18px]">{s.fired}</p>
        </div>
        <div>
          <p className="cap text-[10px]">Answered</p>
          <p className="op-number mt-1.5 text-[18px]">
            {s.answered}
            {s.fired > 0 && <span className="ml-1.5 font-mono text-[11px] text-muted">{Math.round((s.answered / s.fired) * 100)}%</span>}
          </p>
        </div>
      </div>

      {s.review ? (
        <p className="text-[12.5px] text-muted">
          {s.review.state === 'adopted' ? 'Added to the playbook' : 'Kept as their own'} by {s.review.by}, {when(s.review.at)}
          {s.review.note ? `: ${s.review.note}` : ''}
        </p>
      ) : admin ? (
        declining ? (
          <div className="flex flex-col gap-2">
            <textarea className={cn(fieldClass, 'h-20 py-2.5')} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`A note for ${s.firmName}, for example: Only fits firms that work in lofts`} aria-label="Why it is not for everyone" autoFocus />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={cn(greyButton, 'bg-foreground text-background hover:bg-white')} disabled={busy} onClick={() => void decline()}>
                Keep it as theirs
              </button>
              <button type="button" className={greyButton} onClick={() => setDeclining(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={cn(greyButton, 'bg-foreground text-background hover:bg-white')} disabled={busy} onClick={() => void adopt()}>
              Add to playbook
            </button>
            <button type="button" className={greyButton} onClick={() => setDeclining(true)}>
              Not for everyone
            </button>
          </div>
        )
      ) : (
        <p className="text-[12.5px] text-muted">An Ardent admin decides on shared questions.</p>
      )}
    </Card>
  )
}

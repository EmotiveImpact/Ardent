import type { LucideIcon } from 'lucide-react'
import { Panel, Well } from '@/components/ui/panel'

export function Placeholder({ title, blurb, icon: Icon }: { title: string; blurb: string; icon: LucideIcon }) {
  return (
    <div className="mx-auto max-w-[1600px]">
      <Panel>
        <Well className="dot-grid flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl border border-line-strong bg-surface">
            <Icon className="size-5 text-ember" strokeWidth={1.75} />
          </span>
          <h1 className="text-[15px] font-medium">{title}</h1>
          <p className="max-w-sm text-[13px] text-muted">{blurb}</p>
        </Well>
      </Panel>
    </div>
  )
}

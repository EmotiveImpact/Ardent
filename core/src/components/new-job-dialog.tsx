import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Flame, Hammer, Plug, Droplets } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Well } from '@/components/ui/panel'
import { cn } from '@/lib/utils'

const trades = [
  { key: 'gas', label: 'Gas', icon: Flame },
  { key: 'electrical', label: 'Electrical', icon: Plug },
  { key: 'plumbing', label: 'Plumbing', icon: Droplets },
  { key: 'general', label: 'General', icon: Hammer },
]

export function NewJobDialog({ children }: { children: ReactNode }) {
  const [trade, setTrade] = useState('gas')
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [emergency, setEmergency] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]')
      if (e.key.toLowerCase() === 'n' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const create = () => {
    setOpen(false)
    toast.success(`J-1053 logged${emergency ? ' as emergency' : ''}`, {
      description: (title || 'New job') + (emergency ? '. Nearest van alerted: Tom Byrne, 9 min.' : '. Waiting to be priced.'),
    })
    setTitle('')
    setEmergency(false)
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <div className="px-3 pt-3 pb-3">
          <DialogTitle>New job</DialogTitle>
          <DialogDescription>Log it now, price and book it after.</DialogDescription>
        </div>
        <Well className="space-y-4 p-3">
          <div className="grid grid-cols-4 gap-1.5">
            {trades.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTrade(key)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border border-line bg-surface py-3 text-[12px] text-muted transition-colors hover:text-foreground',
                  trade === key && 'border-ember/50 bg-ember-soft text-foreground',
                )}
              >
                <Icon className={cn('size-4', trade === key && 'text-ember')} />
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nj-title">What needs doing</Label>
            <Input id="nj-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Boiler losing pressure, kitchen" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nj-cust">Customer</Label>
              <Input id="nj-cust" placeholder="Name or phone" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nj-pc">Postcode</Label>
              <Input id="nj-pc" placeholder="M20 6BT" className="font-mono uppercase" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2.5">
            <div>
              <p className="text-[13px]">Emergency call-out</p>
              <p className="text-[12px] text-muted">Jumps the queue and alerts the nearest van</p>
            </div>
            <Switch checked={emergency} onCheckedChange={setEmergency} />
          </div>
        </Well>
        <div className="flex justify-end gap-2 p-2 pt-3">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" variant={emergency ? 'ember' : 'default'} onClick={create}>
            {emergency ? 'Dispatch now' : 'Create job'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

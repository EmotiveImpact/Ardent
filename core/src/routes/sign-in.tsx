import { useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { demoPeople } from '@engine/connect.ts'
import { useArdent } from '@/data/ardent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArdentMark } from '@/components/layout/logo'
import { problem } from '@/lib/act'

const roleLabel = { owner: 'Owner', office: 'Office', field: 'Field' } as const

export function SignIn() {
  const { signIn, mode } = useArdent()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const go = async (e: string, p: string) => {
    setBusy(true)
    setError(undefined)
    try {
      await signIn(e, p)
    } catch (err) {
      setError(problem(err))
      setBusy(false)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void go(email, password)
  }
  const office = demoPeople.filter((p) => p.role !== 'field')

  return (
    <div className="app-atmosphere grain flex min-h-full items-center justify-center px-4 py-10">
      <div className="animate-rise w-full max-w-[400px]">
        <div className="mb-10 flex items-center gap-3">
          <ArdentMark />
          <span className="caps text-muted">Ardent Core</span>
        </div>
        <h1 className="display-title text-[30px] text-foreground">Sign in</h1>
        <p className="mt-3 text-[14px] text-muted">The office side of Ardent: jobs, the crew, quotes, invoices and certificates in one place.</p>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" required />
          </div>
          {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
          <Button type="submit" variant="ember" className="mt-2 h-11" disabled={busy}>
            Sign in <ArrowRight />
          </Button>
        </form>

        {mode === 'demo' && (
          <div className="mt-10">
            <p className="caps text-faint">Or try the demo firm</p>
            <p className="mt-2 text-[13px] text-muted">Mercer Heating &amp; Electrical, Manchester. Everything you change stays in this browser.</p>
            <div className="mt-4 flex flex-col gap-1.5">
              {office.map((p) => (
                <button
                  key={p.email}
                  disabled={busy}
                  onClick={() => void go(p.email, p.password)}
                  className="group flex h-14 items-center gap-3 rounded-lg bg-surface px-4 text-left transition-colors hover:bg-raised disabled:opacity-50"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-raised font-mono text-[11px] group-hover:bg-[#262626]">
                    {p.name.split(' ').map((w) => w[0]).join('')}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[14px] text-foreground">{p.name}</span>
                    <span className="block text-[12px] text-muted">{roleLabel[p.role]}{p.role === 'owner' ? ', also on the tools' : ', runs the diary'}</span>
                  </span>
                  <ArrowRight className="size-4 text-faint transition-colors group-hover:text-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Field engineers have Ardent Field; Core is for the office. */
export function FieldOnly() {
  const { me, signOut } = useArdent()
  return (
    <div className="app-atmosphere grain flex min-h-full items-center justify-center px-4">
      <div className="animate-rise max-w-[420px]">
        <ArdentMark />
        <h1 className="display-title mt-8 text-[26px]">Use Ardent Field</h1>
        <p className="mt-3 text-[14px] text-muted">
          {me?.user.name}, your sign-in is for the field. Your jobs, clocks and sign-offs are in Ardent Field on your phone. Ask {me?.organisation.name}'s owner if you need office access.
        </p>
        <Button variant="outline" className="mt-8" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  )
}

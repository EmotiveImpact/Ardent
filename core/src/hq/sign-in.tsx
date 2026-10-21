import { useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { hqDemoPeople } from '@engine/connect-hq.ts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { problem } from '@/lib/act'
import { useHq } from './data'
import { Wordmark } from './shell'

const roleLabel = { admin: 'Admin, changes the playbook', support: 'Support, looks at everything' } as const

/** Only Ardent's own team can sign in to HQ. */
export function SignIn() {
  const { signIn, mode } = useHq()
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

  return (
    <div className="app-atmosphere grain flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <Wordmark full className="mb-10" />
        <h1 className="display-title text-[30px] text-foreground">Sign in</h1>
        <p className="mt-3 text-[14px] text-muted">For Ardent's own team: every firm on Ardent, their day on one map, the playbook and what each firm uses and pays.</p>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" required />
          </div>
          {error && (
            <p className="text-[13px] text-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="ember" className="mt-2 h-11" disabled={busy}>
            Sign in <ArrowRight />
          </Button>
        </form>

        {mode === 'demo' && (
          <div className="mt-10">
            <p className="caps text-faint">Or try it as</p>
            <p className="mt-2 text-[13px] text-muted">4 made-up firms around Greater Manchester. Everything you change stays in this browser.</p>
            <div className="mt-4 flex flex-col gap-1.5">
              {hqDemoPeople.map((p) => (
                <button
                  key={p.email}
                  type="button"
                  disabled={busy}
                  onClick={() => void go(p.email, p.password)}
                  className="group flex h-14 items-center gap-3 rounded-lg bg-surface px-4 text-left transition-colors hover:bg-raised disabled:opacity-50"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-raised font-mono text-[11px] group-hover:bg-[#262626]">
                    {p.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[14px] text-foreground">Try it as {p.name}</span>
                    <span className="block text-[12px] text-muted">{roleLabel[p.role]}</span>
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

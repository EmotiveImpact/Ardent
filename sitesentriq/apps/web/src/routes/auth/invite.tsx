import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { Button, Card, FieldError, Input, Label, Spinner, TextField } from '@haumea/ui'
import { AlertCircle, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { Wordmark } from '@haumea/ui'

const inviteSchema = z.object({
  full_name: z.string().min(2, 'Name is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type InviteForm = z.infer<typeof inviteSchema>

/**
 * Role-aware landing for a freshly-accepted invitation. Mirrors the
 * destinations in PublicRoute so an invited engineer/manager/admin lands
 * on the same page they would on any future sign-in.
 */
function landingPathForRole(role: string | null | undefined): string {
  if (role === 'tenant_user') return '/site'
  if (role === 'client_admin') return '/portal'
  return '/dashboard'
}

export default function InvitePage() {
  const navigate = useNavigate()
  const { user, profile, loading: authLoading } = useAuth()
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(true)
  const [email, setEmail] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
  })

  // Invited users arrive via Supabase's magic link, which (with
  // detectSessionInUrl) establishes a session from the URL hash before this
  // component mounts. Read that session to greet them and pre-fill their name.
  const invitedOrg = (user?.user_metadata?.invited_org as string | undefined) ?? undefined
  const invitedBy = (user?.user_metadata?.invited_by as string | undefined) ?? undefined
  const prefilledName = (user?.user_metadata?.full_name as string | undefined) ?? ''

  useEffect(() => {
    if (authLoading) return
    let cancelled = false

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.user?.email) setEmail(session.user.email)
      if (session?.user?.user_metadata?.full_name) {
        reset({ full_name: session.user.user_metadata.full_name as string, password: '' })
      }
      setVerifying(false)
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, reset])

  const onSubmit = async (data: InviteForm) => {
    setError('')
    try {
      const { data: updated, error: updateError } = await supabase.auth.updateUser({
        password: data.password,
        data: { full_name: data.full_name },
      })
      if (updateError) {
        setError(updateError.message)
        return
      }
      // Session is already live (they came in via the magic link), so the
      // password update completes their account. Send them straight into the
      // app on the page their role lands on — don't strand them on a static
      // success screen. Prefer the freshly-updated user's role, fall back to
      // the profile loaded into context.
      const role =
        (updated?.user?.user_metadata?.invited_role as string | undefined) ?? profile?.role ?? null
      navigate(landingPathForRole(role), { replace: true })
    } catch {
      setError('An unexpected error occurred. Please try again.')
    }
  }

  if (authLoading || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
        <Spinner size="lg" />
      </div>
    )
  }

  // No session means the magic link was missing/expired — there's nothing to
  // accept. Point them at sign-in rather than showing a broken form.
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
        <div className="w-full max-w-[420px]">
          <Card className="!gap-0 !rounded-xl !bg-surface-card border border-border-default !p-6 shadow-sm text-center">
            <div className="flex justify-center mb-4">
              <AlertCircle size={40} className="text-status-overdue" />
            </div>
            <h2 className="text-[16px] font-semibold text-text-primary">Invitation link expired</h2>
            <p className="text-label text-text-secondary mt-2">
              This invitation link is no longer valid. Ask your admin to re-send it, or sign in if
              you already have an account.
            </p>
            <Link
              to="/login"
              className="inline-block mt-4 bg-accent text-accent-foreground hover:opacity-90 rounded-lg px-6 py-2.5 text-label font-medium transition-opacity"
            >
              Go to Sign In
            </Link>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
      <div className="w-full max-w-[420px]">
        {/* Logo & heading */}
        <div className="flex flex-col items-center mb-8">
          <Wordmark size="lg" className="mb-4 text-text-primary" />
          <p className="text-label text-text-muted mt-1">Accept your invitation</p>
        </div>

        {/* Card */}
        <Card className="!gap-0 !rounded-xl !bg-surface-card border border-border-default !p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5 p-3 rounded-lg bg-accent/10 border border-accent/20">
            <UserPlus size={18} className="text-text-accent flex-shrink-0" />
            <div>
              <p className="text-label font-medium text-text-primary">
                You've been invited to join {invitedOrg ? invitedOrg : 'the team'}
              </p>
              {invitedBy && (
                <p className="text-caption text-text-secondary mt-0.5">Invited by {invitedBy}</p>
              )}
              {email && <p className="text-caption text-text-secondary mt-0.5">{email}</p>}
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <TextField isInvalid={!!errors.full_name}>
              <Label>Full Name</Label>
              <Input
                placeholder="John Smith"
                defaultValue={prefilledName}
                {...register('full_name')}
              />
              {errors.full_name && <FieldError>{errors.full_name.message}</FieldError>}
            </TextField>
            <TextField isInvalid={!!errors.password}>
              <Label>Set Password</Label>
              <Input type="password" placeholder="At least 6 characters" {...register('password')} />
              {errors.password && <FieldError>{errors.password.message}</FieldError>}
            </TextField>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-status-overdue/10 border border-status-overdue/30 px-3 py-2.5">
                <AlertCircle size={14} className="text-status-overdue flex-shrink-0" />
                <p className="text-status-overdue text-label">{error}</p>
              </div>
            )}

            <Button type="submit" variant="primary" isDisabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Setting up account...' : 'Accept & Set Up Account'}
            </Button>
          </form>
        </Card>

        <p className="text-center text-label text-text-muted mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-500 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

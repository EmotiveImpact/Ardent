import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router'
import { Button, Card, FieldError, Input, Label, TextField } from '@haumea/ui'
import { supabase } from '@/lib/supabase'
import { Wordmark } from '@haumea/ui'
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react'

const resetSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

type ResetForm = z.infer<typeof resetSchema>

/**
 * Set-a-new-password screen — the landing page for the recovery link emailed by
 * forgot-password. Supabase establishes a short-lived recovery session from the
 * URL on load (detectSessionInUrl); this page lets the user set a new password
 * via `updateUser`, then sends them to sign in fresh.
 *
 * Deliberately NOT wrapped in PublicRoute/ProtectedRoute in App.tsx — PublicRoute
 * would bounce the (now authenticated) recovery session away before they can reset.
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  // Confirm a (recovery) session exists — if the user opened this page directly
  // without a valid link, there's nothing to update.
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setHasSession(!!session)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) })

  const onSubmit = async (data: ResetForm) => {
    setError('')
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    // Sign out so they log in fresh with the new password.
    await supabase.auth.signOut()
    setTimeout(() => navigate('/login'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-center mb-8">
          <Wordmark size="lg" className="mb-4 text-text-primary" />
          <p className="text-label text-text-muted mt-1">Choose a new password</p>
        </div>

        <Card className="!gap-0 !rounded-xl !bg-surface-card border border-border-default !p-6 shadow-sm">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle size={40} className="text-brand-500" />
              <h2 className="text-[16px] font-semibold text-text-primary">Password updated</h2>
              <p className="text-label text-text-secondary max-w-sm">
                Your password has been changed. Redirecting you to sign in…
              </p>
            </div>
          ) : hasSession === false ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <AlertCircle size={40} className="text-status-overdue" />
              <h2 className="text-[16px] font-semibold text-text-primary">Reset link invalid or expired</h2>
              <p className="text-label text-text-secondary max-w-sm">
                Open this page from the password-reset link in your email, or request a new one.
              </p>
              <Link to="/forgot-password" className="mt-2 text-label font-medium text-brand-500 hover:underline">
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <p className="text-label text-text-secondary">Enter and confirm your new password.</p>
              <TextField isInvalid={!!errors.password}>
                <Label>New password</Label>
                <Input type="password" placeholder="••••••••" autoComplete="new-password" {...register('password')} />
                {errors.password && <FieldError>{errors.password.message}</FieldError>}
              </TextField>
              <TextField isInvalid={!!errors.confirm}>
                <Label>Confirm new password</Label>
                <Input type="password" placeholder="••••••••" autoComplete="new-password" {...register('confirm')} />
                {errors.confirm && <FieldError>{errors.confirm.message}</FieldError>}
              </TextField>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-status-overdue/10 border border-status-overdue/30 px-3 py-2.5">
                  <AlertCircle size={14} className="text-status-overdue flex-shrink-0" />
                  <p className="text-status-overdue text-label">{error}</p>
                </div>
              )}

              <Button type="submit" variant="primary" isDisabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Updating…' : 'Update password'}
              </Button>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-1.5 text-label text-text-muted hover:text-text-secondary transition-colors"
              >
                <ArrowLeft size={14} />
                Back to Sign In
              </Link>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}

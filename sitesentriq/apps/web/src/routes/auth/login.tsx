import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useSearchParams } from 'react-router'
import { AlertCircle } from 'lucide-react'
import { Button, Card, FieldError, Input, Label, TextField } from '@haumea/ui'
import { signIn } from '@/lib/auth'
import { Wordmark } from '@haumea/ui'
import { SsoButtons, SsoDivider } from '@/lib/sso/sso-buttons'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const [error, setError] = useState('')
  const [searchParams] = useSearchParams()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  // Surface SSO errors bounced back from /auth/sso/callback.
  useEffect(() => {
    const ssoErr = searchParams.get('error')
    if (!ssoErr) return
    const detail = searchParams.get('detail')
    if (ssoErr === 'sso_blocked') {
      setError('SSO sign-in is disabled for your domain. Contact your admin.')
    } else if (ssoErr === 'sso_failed') {
      setError(detail ? `SSO sign-in failed: ${detail}` : 'SSO sign-in failed.')
    }
  }, [searchParams])

  const onSubmit = async (data: LoginForm) => {
    setError('')
    const { error } = await signIn(data.email, data.password)
    if (error) setError(error.message)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
      <div className="w-full max-w-[420px]">
        {/* Logo & heading */}
        <div className="flex flex-col items-center mb-8">
          <Wordmark size="lg" className="mb-4 text-text-primary" />
          <p className="text-label text-text-muted mt-1">Sign in to your account</p>
        </div>

        {/* Card */}
        <Card className="!gap-0 !rounded-xl !bg-surface-card border border-border-default !p-6 shadow-sm">
          {/* SSO providers — display always; ops must enable in Supabase Dashboard */}
          <SsoButtons onError={setError} />
          <SsoDivider />
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <TextField isInvalid={!!errors.email}>
              <Label>Email</Label>
              <Input type="email" placeholder="you@example.com" {...register('email')} />
              {errors.email && <FieldError>{errors.email.message}</FieldError>}
            </TextField>
            <TextField isInvalid={!!errors.password}>
              <Label>Password</Label>
              <Input type="password" placeholder="Enter your password" {...register('password')} />
              {errors.password && <FieldError>{errors.password.message}</FieldError>}
            </TextField>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-status-overdue/10 border border-status-overdue/30 px-3 py-2.5">
                <AlertCircle size={14} className="text-status-overdue flex-shrink-0" />
                <p className="text-status-overdue text-label">{error}</p>
              </div>
            )}

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-label text-brand-500 hover:text-brand-400 transition-colors">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" variant="primary" isDisabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </Card>

        <p className="text-center text-label text-text-muted mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-brand-500 font-medium hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}

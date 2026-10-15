import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button, Card, FieldError, Input, Label, TextField } from '@haumea/ui'
import { resendSignupConfirmation, signUp } from '@/lib/auth'
import { Wordmark } from '@haumea/ui'
import { Link } from 'react-router'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { SsoButtons, SsoDivider } from '@/lib/sso/sso-buttons'

function toSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const registerSchema = z.object({
  full_name: z.string().min(2, 'Name is required'),
  company_name: z.string().min(2, 'Company name is required'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type RegisterForm = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [alreadyExists, setAlreadyExists] = useState(false)
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [resendError, setResendError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { full_name: '', company_name: '', email: '', password: '' },
  })

  const onSubmit = async (data: RegisterForm) => {
    setError('')
    // The workspace URL slug is derived from the company name (and made unique
    // server-side by the org-creation trigger) — users never pick it. It's not
    // a surface they see today, so asking for it at signup was pure friction.
    const { data: signUpData, error } = await signUp(data.email, data.password, {
      full_name: data.full_name,
      company_name: data.company_name,
      company_slug: toSlug(data.company_name),
    })
    if (error) {
      setError(error.message)
      return
    }
    setSubmittedEmail(data.email)
    // Supabase anti-enumeration: signing up with an email that ALREADY has a
    // confirmed account returns a 200 with NO error and an obfuscated user
    // whose `identities` array is empty — no new account is created and no
    // usable confirmation email is sent. Without this check we'd show the
    // cheerful "Check your email" screen and the user would be stuck forever
    // (this is exactly what happened to a real returning user). Detect the
    // empty-identities signal and route them to sign in / reset instead.
    if (signUpData?.user && (signUpData.user.identities?.length ?? 0) === 0) {
      setAlreadyExists(true)
      return
    }
    setSuccess(true)
  }

  const handleResend = async () => {
    if (!submittedEmail) return
    setResendError('')
    setResendState('sending')
    const { error } = await resendSignupConfirmation(submittedEmail)
    if (error) {
      setResendError(error.message)
      setResendState('error')
      return
    }
    setResendState('sent')
  }

  if (alreadyExists) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
        <div className="w-full max-w-[420px]">
          <Card className="!gap-0 !rounded-xl !bg-surface-card border border-border-default !p-6 shadow-sm text-center">
            <div className="flex justify-center mb-4">
              <AlertCircle size={40} className="text-brand-500" />
            </div>
            <h2 className="text-[16px] font-semibold text-text-primary">You already have an account</h2>
            <p className="text-label text-text-secondary mt-2 max-w-sm mx-auto">
              An account for{' '}
              <span className="font-medium text-text-primary">{submittedEmail}</span>{' '}
              already exists. Sign in to continue — or reset your password if you've
              forgotten it.
            </p>
            <div className="mt-5 flex flex-col items-center gap-2.5">
              <Button asChild type="button" variant="primary" className="w-full">
                <Link to="/login" className="w-full">
                  Sign in
                </Link>
              </Button>
              <Link
                to="/forgot-password"
                className="text-label font-medium text-brand-500 hover:underline"
              >
                Reset your password
              </Link>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
        <div className="w-full max-w-[420px]">
          <Card className="!gap-0 !rounded-xl !bg-surface-card border border-border-default !p-6 shadow-sm text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle size={40} className="text-brand-500" />
            </div>
            <h2 className="text-[16px] font-semibold text-text-primary">Check your email</h2>
            <p className="text-label text-text-secondary mt-2 max-w-sm mx-auto">
              We sent a confirmation link to{' '}
              <span className="font-medium text-text-primary">{submittedEmail}</span>.
              Click it and we'll drop you straight into the setup wizard. Check your spam
              folder if it doesn't arrive within a minute.
            </p>

            <div className="mt-5 flex flex-col items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleResend}
                isDisabled={resendState === 'sending' || resendState === 'sent'}
              >
                {resendState === 'sending'
                  ? 'Resending…'
                  : resendState === 'sent'
                    ? 'Confirmation email sent'
                    : 'Resend confirmation email'}
              </Button>
              {resendState === 'error' && resendError && (
                <p className="text-status-overdue text-caption">{resendError}</p>
              )}
              {resendState === 'sent' && (
                <p className="text-text-muted text-caption">
                  We sent another link — check your inbox again.
                </p>
              )}
            </div>

            <Link
              to="/login"
              className="inline-block mt-4 text-label font-medium text-brand-500 hover:underline"
            >
              Back to Sign In
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
          <p className="text-label text-text-muted mt-1">Create your account</p>
        </div>

        {/* Card */}
        <Card className="!gap-0 !rounded-xl !bg-surface-card border border-border-default !p-6 shadow-sm">
          {/* SSO providers — display always; ops must enable in Supabase Dashboard */}
          <SsoButtons onError={setError} />
          <SsoDivider />
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <TextField isInvalid={!!errors.full_name}>
              <Label>Full Name</Label>
              <Input placeholder="John Smith" {...register('full_name')} />
              {errors.full_name && <FieldError>{errors.full_name.message}</FieldError>}
            </TextField>
            <TextField isInvalid={!!errors.company_name}>
              <Label>Company Name</Label>
              <Input placeholder="Acme Facilities Ltd" {...register('company_name')} />
              {errors.company_name && <FieldError>{errors.company_name.message}</FieldError>}
            </TextField>
            <TextField isInvalid={!!errors.email}>
              <Label>Email</Label>
              <Input type="email" placeholder="you@example.com" {...register('email')} />
              {errors.email && <FieldError>{errors.email.message}</FieldError>}
            </TextField>
            <TextField isInvalid={!!errors.password}>
              <Label>Password</Label>
              <Input type="password" placeholder="At least 8 characters" {...register('password')} />
              {errors.password && <FieldError>{errors.password.message}</FieldError>}
            </TextField>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-status-overdue/10 border border-status-overdue/30 px-3 py-2.5">
                <AlertCircle size={14} className="text-status-overdue flex-shrink-0" />
                <p className="text-status-overdue text-label">{error}</p>
              </div>
            )}

            <Button type="submit" variant="primary" isDisabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Creating account...' : 'Create Account'}
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

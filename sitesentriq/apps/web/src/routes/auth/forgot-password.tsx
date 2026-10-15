import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router'
import { Button, FieldError, Input, Label, TextField } from '@haumea/ui'
import { supabase } from '@/lib/supabase'
import { Wordmark } from '@haumea/ui'
import { ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react'
import { Card } from '@haumea/ui'

const forgotSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

type ForgotForm = z.infer<typeof forgotSchema>

export default function ForgotPasswordPage() {
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  })

  const onSubmit = async (data: ForgotForm) => {
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      // Land on the dedicated set-new-password screen (NOT /login, which bounced
      // the recovery session straight into the app with no chance to reset).
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setError(error.message)
    } else {
      setSubmitted(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
      <div className="w-full max-w-[420px]">
        {/* Logo & heading */}
        <div className="flex flex-col items-center mb-8">
          <Wordmark size="lg" className="mb-4 text-text-primary" />
          <p className="text-label text-text-muted mt-1">Reset your password</p>
        </div>

        {/* Card */}
        <Card className="!gap-0 !rounded-xl !bg-surface-card border border-border-default !p-6 shadow-sm">
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle size={40} className="text-brand-500" />
              <h2 className="text-[16px] font-semibold text-text-primary">Check your email</h2>
              <p className="text-label text-text-secondary max-w-sm">
                If an account exists with that email address, we've sent a password reset link.
                Please check your inbox and spam folder.
              </p>
              <Link
                to="/login"
                className="mt-2 text-label font-medium text-brand-500 hover:underline"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <p className="text-label text-text-secondary">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <TextField isInvalid={!!errors.email}>
                <Label>Email</Label>
                <Input type="email" placeholder="you@example.com" {...register('email')} />
                {errors.email && <FieldError>{errors.email.message}</FieldError>}
              </TextField>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-status-overdue/10 border border-status-overdue/30 px-3 py-2.5">
                  <AlertCircle size={14} className="text-status-overdue flex-shrink-0" />
                  <p className="text-status-overdue text-label">{error}</p>
                </div>
              )}

              <Button type="submit" variant="primary" isDisabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Sending...' : 'Send Reset Link'}
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

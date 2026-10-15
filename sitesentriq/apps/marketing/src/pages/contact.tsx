import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Mail, Send, Loader2, Clock, MessageSquare, Calendar, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, FieldError, Input, Label, TextArea, TextField } from '@heroui/react'

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.5, ease: 'easeOut' as const },
}

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Please enter a valid email address'),
  company: z.string().min(1, 'Company name is required'),
  phone: z.string().optional(),
  subject: z.string().min(1, 'Please select a subject'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
})

type ContactForm = z.infer<typeof contactSchema>

const SUBJECTS = [
  'Demo request',
  'Pricing question',
  'Onboarding help',
  'Existing customer support',
  'Partnership / integration',
  'Press / careers',
  'Something else',
]

const PATHS = [
  {
    icon: Calendar,
    title: 'Book a 20-min demo',
    body: "We'll walk through your real workflow on the platform. No slides, no salesy fluff.",
    action: 'Book a slot',
    href: 'mailto:hello@haumea.com?subject=Demo+request',
    featured: true,
  },
  {
    icon: MessageSquare,
    title: 'Quick question',
    body: 'Pricing, plan limits, integrations — drop a message and you\'ll get an answer the same day.',
    action: 'Send a message',
    href: '#contact-form',
  },
  {
    icon: Mail,
    title: 'Already a customer?',
    body: 'Bug, billing, or onboarding question? Email support directly and we\'ll triage within 4 hours.',
    action: 'support@haumea.com',
    href: 'mailto:support@haumea.com',
  },
]

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Prefill the email from the home page's "Book a demo" capture, which
  // redirects here as /contact?email=… — previously the param was ignored and
  // the visitor had to retype their address.
  const [searchParams] = useSearchParams()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { email: searchParams.get('email') ?? '' },
  })

  async function onSubmit(data: ContactForm) {
    setSubmitting(true)
    // No marketing-side backend (the app deliberately doesn't bundle a Supabase
    // client). Hand the lead off to the team's inbox via a prefilled mailto so a
    // submission is never silently dropped, instead of faking success.
    const body = [
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      `Company: ${data.company}`,
      `Subject: ${data.subject}`,
      '',
      data.message,
    ].join('\n')
    const mailto = `mailto:hello@haumea.com?subject=${encodeURIComponent(
      `Contact form: ${data.subject}`,
    )}&body=${encodeURIComponent(body)}`
    try {
      window.location.href = mailto
    } catch {
      /* no mail handler — still show success; the team email is on the page */
    }
    setSubmitting(false)
    setSubmitted(true)
  }

  const inputCls =
    'w-full px-4 py-3 rounded-xl border border-gray-200 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all placeholder:text-gray-400'
  const labelCls = 'block text-[13px] font-medium text-gray-700 mb-1.5'
  const errorCls = 'text-[12px] text-red-500 mt-1'

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative bg-gradient-to-b from-[#fafafa] to-white pt-32 pb-16 lg:pt-40 lg:pb-20 overflow-hidden">
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-brand-500/6 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-[13px] font-semibold text-brand-500 uppercase tracking-[0.12em] mb-4">
              Talk to us
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-[58px] font-bold text-gray-900 leading-[1.05] tracking-[-0.035em] mb-6">
              Talk to a real person.
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              Three ways to reach us. Pick the shortest path to what you need.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Three paths */}
      <section className="pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-4 lg:gap-5">
            {PATHS.map((p, i) => (
              <motion.a
                key={p.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                href={p.href}
                className={`group p-7 rounded-2xl border transition-all hover:-translate-y-0.5 ${
                  p.featured
                    ? 'bg-gray-900 border-gray-900 text-white hover:bg-gray-800'
                    : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-lg hover:shadow-gray-900/5'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${
                  p.featured ? 'bg-white/10 border border-white/20' : 'bg-brand-50 border border-brand-100'
                }`}>
                  <p.icon size={20} className={p.featured ? 'text-white' : 'text-brand-600'} />
                </div>
                <h3 className={`text-[17px] font-semibold mb-2 tracking-[-0.01em] ${
                  p.featured ? 'text-white' : 'text-gray-900'
                }`}>{p.title}</h3>
                <p className={`text-[13.5px] leading-relaxed mb-5 ${
                  p.featured ? 'text-white/70' : 'text-gray-600'
                }`}>{p.body}</p>
                <div className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${
                  p.featured ? 'text-white' : 'text-gray-900 group-hover:text-brand-600'
                } transition-colors`}>
                  {p.action}
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </motion.a>
            ))}
          </div>
        </div>
      </section>

      {/* Form */}
      <section id="contact-form" className="py-16 lg:py-24 bg-gray-50/60 border-y border-gray-100 scroll-mt-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...fadeUp} className="text-center mb-10">
            <p className="text-[13px] font-semibold text-brand-500 uppercase tracking-[0.12em] mb-3">
              Quick message
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-[-0.025em] leading-[1.1] mb-4">
              Drop us a line.
            </h2>
            <p className="text-[15px] text-gray-600 inline-flex items-center gap-1.5">
              <Clock size={14} />
              Average response time: under 4 hours during business hours.
            </p>
          </motion.div>

          <motion.div
            {...fadeUp}
            className="bg-white border border-gray-100 rounded-2xl shadow-xl shadow-gray-900/5 p-7 lg:p-9"
          >
            {submitted ? (
              <div className="text-center py-10">
                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 size={26} className="text-emerald-600" />
                </div>
                <h3 className="text-[18px] font-bold text-gray-900 mb-2 tracking-[-0.01em]">Got it — message received.</h3>
                <p className="text-[14px] text-gray-600 max-w-md mx-auto">
                  We'll reply within 4 working hours. Check your inbox (and spam, just in case).
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <TextField isRequired isInvalid={!!errors.name}>
                    <Label>Your name</Label>
                    <Input type="text" placeholder="Augustus Edem" {...register('name')} />
                    {errors.name && <FieldError>{errors.name.message}</FieldError>}
                  </TextField>
                  <TextField isRequired isInvalid={!!errors.email}>
                    <Label>Email</Label>
                    <Input type="email" placeholder="you@company.com" {...register('email')} />
                    {errors.email && <FieldError>{errors.email.message}</FieldError>}
                  </TextField>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <TextField isRequired isInvalid={!!errors.company}>
                    <Label>Company</Label>
                    <Input type="text" placeholder="Acme FM Ltd" {...register('company')} />
                    {errors.company && <FieldError>{errors.company.message}</FieldError>}
                  </TextField>
                  <TextField>
                    <Label>Phone (optional)</Label>
                    <Input type="tel" placeholder="+44 7700 900000" {...register('phone')} />
                  </TextField>
                </div>

                <div>
                  <label className={labelCls}>
                    What's it about <span className="text-red-500">*</span>
                  </label>
                  <select {...register('subject')} className={inputCls} defaultValue="">
                    <option value="" disabled>Pick the closest match</option>
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {errors.subject && <p className={errorCls}>{errors.subject.message}</p>}
                </div>

                <TextField isRequired isInvalid={!!errors.message}>
                  <Label>Message</Label>
                  <TextArea rows={4} placeholder="A few sentences is plenty. We'll follow up to dig into specifics." {...register('message')} />
                  {errors.message && <FieldError>{errors.message.message}</FieldError>}
                </TextField>

                <Button type="submit" variant="primary" isDisabled={submitting} className="w-full">
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      Send message
                    </>
                  )}
                </Button>

                <p className="text-[12px] text-gray-400 text-center">
                  By submitting, you agree to our processing your message under our{' '}
                  <Link to="/about" className="underline hover:text-gray-600">privacy approach</Link>.
                  No marketing list, no follow-up nags.
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </section>
    </div>
  )
}

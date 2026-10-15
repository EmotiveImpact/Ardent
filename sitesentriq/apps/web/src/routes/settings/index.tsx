import { useState, useCallback, useEffect } from 'react'
import { Button, Switch } from '@haumea/ui'
import { AppCard, PageHeader } from '@haumea/ui'
import { Building2, Users, Shield, Bell, Mail, MonitorSmartphone, UserCircle, Palette, Compass, Activity, CreditCard, PlugZap, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useResetOnboarding } from '@/hooks/use-onboarding'
import { useNotificationPrefs, useSaveNotificationPrefs } from '@/hooks/use-notification-prefs'
import { ThemeSelector } from '@/components/shared/theme-selector'
import { useTheme } from '@/contexts/theme-context'

const settingSections = [
  {
    key: 'profile',
    title: 'My Profile',
    description: 'Update your name, avatar, and change your password.',
    icon: UserCircle,
    link: '/dashboard/settings/profile',
  },
  {
    key: 'organisation',
    title: 'Organisation',
    description: 'Manage your organisation name, logo, and contact details.',
    icon: Building2,
    link: '/dashboard/settings/organisation',
  },
  {
    key: 'users',
    title: 'Users & Roles',
    description: 'Manage team members, invite users, and assign roles.',
    icon: Users,
    link: '/dashboard/settings/users',
  },
  {
    key: 'roles',
    title: 'Roles & Permissions',
    description: 'Configure role-based access control and permissions.',
    icon: Shield,
    link: '/dashboard/settings/roles',
  },
  {
    key: 'billing',
    title: 'Billing',
    description: 'Manage your plan, seats, and payment method.',
    icon: CreditCard,
    link: '/dashboard/settings/billing',
  },
  {
    key: 'compliance',
    title: 'Subcontractor compliance',
    description: 'Set the insurance, accreditation and RAMS a subcontractor must hold to be assigned work.',
    icon: ShieldCheck,
    link: '/dashboard/settings/compliance',
  },
  {
    key: 'custom-fields',
    title: 'Custom fields',
    description: 'Add your own fields to properties, assets, jobs and more.',
    icon: SlidersHorizontal,
    link: '/dashboard/settings/custom-fields',
  },
  {
    key: 'notifications',
    title: 'Notifications',
    description: 'Configure email and in-app notification preferences.',
    icon: Bell,
    link: '',
  },
  {
    key: 'appearance',
    title: 'Appearance',
    description: 'Choose your preferred theme and visual style.',
    icon: Palette,
    link: '',
  },
  {
    key: 'onboarding',
    title: 'Onboarding tour',
    description: 'Re-run the first-time setup walkthrough.',
    icon: Compass,
    link: '',
  },
  {
    key: 'integrations-health',
    title: 'Integrations health',
    description: 'Check which back-end integrations (push, email, Stripe, etc.) are configured.',
    icon: PlugZap,
    link: '/dashboard/settings/health',
  },
  {
    key: 'diagnostics',
    title: 'Diagnostics',
    description: 'View system health, connection status, and build info.',
    icon: Activity,
    link: '/dashboard/health',
  },
]

const notificationPrefs = [
  { key: 'compliance_due', label: 'Compliance due reminders', desc: 'Get notified when compliance items are due or overdue' },
  { key: 'visit_reminders', label: 'Visit reminders', desc: 'Get notified about upcoming scheduled visits' },
  { key: 'invoice_reminders', label: 'Invoice reminders', desc: 'Get notified about unpaid or overdue invoices' },
  { key: 'overdue_actions', label: 'Overdue actions', desc: 'Get notified about overdue action items' },
  { key: 'quote_approvals', label: 'New quote approvals', desc: 'Get notified when quotes are approved or rejected' },
]

interface NotificationPrefs {
  [key: string]: { inApp: boolean; email: boolean }
}

function getDefaultPrefs(): NotificationPrefs {
  const defaults: NotificationPrefs = {}
  for (const p of notificationPrefs) {
    defaults[p.key] = { inApp: true, email: true }
  }
  return defaults
}


export default function SettingsPage() {
  const navigate = useNavigate()
  const resetOnboarding = useResetOnboarding()
  const [activeSection, setActiveSection] = useState('notifications')
  const { data: savedPrefs } = useNotificationPrefs()
  const savePrefsMutation = useSaveNotificationPrefs()
  const [prefs, setPrefs] = useState<NotificationPrefs>(getDefaultPrefs)

  // Seed the toggles from the server row once it loads (defaults underneath).
  useEffect(() => {
    if (savedPrefs) setPrefs({ ...getDefaultPrefs(), ...savedPrefs })
  }, [savedPrefs])

  const togglePref = useCallback((key: string, channel: 'inApp' | 'email') => {
    setPrefs(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [channel]: !prev[key]?.[channel],
      },
    }))
  }, [])

  const savePrefs = useCallback(() => {
    savePrefsMutation.mutate(prefs, {
      onSuccess: () => toast.success('Notification preferences saved'),
      onError: () => toast.error('Failed to save preferences'),
    })
  }, [prefs, savePrefsMutation])

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <div className="flex flex-col lg:flex-row gap-6 min-h-[480px]">
        {/* Cal.com-style left sidebar */}
        <nav className="w-full lg:w-56 shrink-0">
          <div className="space-y-0.5">
            {settingSections.map((section) => {
              const isActive = activeSection === section.key
              const Icon = section.icon

              if (section.link) {
                return (
                  <Link
                    key={section.key}
                    to={section.link}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-label font-medium text-text-secondary hover:bg-surface-page hover:text-text-primary transition-colors"
                  >
                    <Icon size={16} className="text-text-muted" />
                    {section.title}
                  </Link>
                )
              }

              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setActiveSection(section.key)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-label font-medium w-full text-left transition-colors ${
                    isActive
                      ? 'bg-surface-elevated text-text-primary'
                      : 'text-text-secondary hover:bg-surface-page hover:text-text-primary'
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-brand-500' : 'text-text-muted'} />
                  {section.title}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {activeSection === 'notifications' && (
            <AppCard padding="none" className="overflow-hidden">
              <div className="px-6 py-4 border-b border-border-subtle">
                <h2 className="text-body font-semibold text-text-primary">Notification Preferences</h2>
                <p className="text-label text-text-muted mt-0.5">
                  Choose which notifications you want to receive and how.
                </p>
              </div>
              <div className="px-6 py-4">
                {/* Column headers */}
                <div className="flex items-center justify-end gap-6 pb-3 border-b border-border-subtle mb-1">
                  <div className="flex items-center gap-1 text-micro font-medium text-text-muted uppercase tracking-[0.04em] w-16 justify-center">
                    <MonitorSmartphone size={13} />
                    In-App
                  </div>
                  <div className="flex items-center gap-1 text-micro font-medium text-text-muted uppercase tracking-[0.04em] w-16 justify-center">
                    <Mail size={13} />
                    Email
                  </div>
                </div>

                <div className="space-y-0">
                  {notificationPrefs.map((pref) => (
                    <div
                      key={pref.key}
                      className="flex items-center justify-between py-3.5 border-b border-border-subtle last:border-0"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="text-label font-medium text-text-secondary">{pref.label}</p>
                        <p className="text-caption text-text-muted mt-0.5">{pref.desc}</p>
                      </div>
                      <div className="flex items-center gap-6">
                        {/* In-App toggle */}
                        <div className="w-16 flex justify-center">
                          <Switch
                            isSelected={prefs[pref.key]?.inApp ?? true}
                            onChange={() => togglePref(pref.key, 'inApp')}
                            size="sm"
                          />
                        </div>
                        {/* Email toggle */}
                        <div className="w-16 flex justify-center">
                          <Switch
                            isSelected={prefs[pref.key]?.email ?? true}
                            onChange={() => togglePref(pref.key, 'email')}
                            size="sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6">
                  <Button variant="primary" onPress={savePrefs}>
                    Save Preferences
                  </Button>
                </div>
              </div>
            </AppCard>
          )}

          {activeSection === 'appearance' && (
            <AppearanceSettings />
          )}

          {activeSection === 'onboarding' && (
            <AppCard padding="none" className="overflow-hidden">
              <div className="px-6 py-4 border-b border-border-subtle">
                <h2 className="text-body font-semibold text-text-primary">Onboarding tour</h2>
                <p className="text-label text-text-muted mt-0.5">
                  Run the 5-step setup walkthrough again. This won't delete any of your data.
                </p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-label text-text-secondary">
                  We'll reset the wizard to step 1 and take you back through Welcome, your first
                  client, property, asset, and PPM plan. You can skip any step you've already
                  done.
                </p>
                <Button
                  variant="primary"
                  isDisabled={resetOnboarding.isPending}
                  onPress={async () => {
                    try {
                      await resetOnboarding.mutateAsync()
                      navigate('/onboarding')
                    } catch (err) {
                      const message = err instanceof Error ? err.message : 'Could not start the tour'
                      toast.error(message)
                    }
                  }}
                >
                  {!resetOnboarding.isPending && <Compass size={14} />}
                  {resetOnboarding.isPending ? 'Starting…' : 'Start the tour'}
                </Button>
              </div>
            </AppCard>
          )}
        </div>
      </div>
    </div>
  )
}

function AppearanceSettings() {
  const { theme } = useTheme()

  return (
    <AppCard padding="none" className="overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle">
        <h2 className="text-body font-semibold text-text-primary">Appearance</h2>
        <p className="text-label text-text-muted mt-0.5">
          Choose your preferred visual theme.
        </p>
      </div>
      <div className="px-6 py-5">
        <ThemeSelector />
        <p className="text-micro text-text-muted mt-3">
          Current: <span className="text-text-secondary font-medium capitalize">{theme}</span> ·
          Theme preference is saved locally.
        </p>
      </div>
    </AppCard>
  )
}

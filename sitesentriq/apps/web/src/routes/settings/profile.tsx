import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { User, Lock, Camera, Loader2, Bell, BellOff, Mail, Send, MapPin } from 'lucide-react'
import { Button, Chip, FieldError, Input, Label, Switch, TextField, Tooltip } from '@haumea/ui'
import { AppCard, PageHeader } from '@haumea/ui'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { Breadcrumbs } from '@/components/shared/breadcrumbs'
import { featureFlags } from '@/lib/feature-flags'
import { triggerDigestPreview } from '@/lib/email'
import {
  pushPermission,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push'
import { clearGpsConsent, getGpsConsent, setGpsConsent } from '@/lib/field-ops/consent'

const profileSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
})

const passwordSchema = z
  .object({
    new_password: z.string().min(8, 'At least 8 characters'),
    confirm_password: z.string().min(1, 'Confirm your password'),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

type ProfileForm = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>

const ROLE_LABELS: Record<string, string> = {
  org_admin: 'Admin',
  manager: 'Manager',
  engineer: 'Engineer',
  viewer: 'Viewer',
  client: 'Client',
}

export default function ProfileSettingsPage() {
  const { user, profile, refreshProfile } = useAuth()
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(profile?.avatar_url)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushAvailable, setPushAvailable] = useState(false)
  const [permissionState, setPermissionState] = useState<string>('default')

  // Email digest preferences
  const [weeklyDigest, setWeeklyDigest] = useState<boolean>(true)
  const [dailyAlerts, setDailyAlerts] = useState<boolean>(false)
  const [digestBusy, setDigestBusy] = useState(false)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [lastDigestSentAt, setLastDigestSentAt] = useState<string | null>(null)

  // Hydrate digest prefs + last-sent timestamp on mount.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('weekly_digest, daily_alerts, last_digest_sent_at')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled || !data) return
      const row = data as {
        weekly_digest?: boolean | null
        daily_alerts?: boolean | null
        last_digest_sent_at?: string | null
      }
      if (typeof row.weekly_digest === 'boolean') setWeeklyDigest(row.weekly_digest)
      if (typeof row.daily_alerts === 'boolean') setDailyAlerts(row.daily_alerts)
      setLastDigestSentAt(row.last_digest_sent_at ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  async function handleToggleDigest(field: 'weekly_digest' | 'daily_alerts', next: boolean) {
    if (!user?.id) return
    setDigestBusy(true)
    // Optimistic update
    if (field === 'weekly_digest') setWeeklyDigest(next)
    else setDailyAlerts(next)
    try {
      const { error } = await supabase.from('profiles').update({ [field]: next }).eq('id', user.id)
      if (error) throw error
      toast.success('Email preferences updated')
    } catch (err) {
      // Revert
      if (field === 'weekly_digest') setWeeklyDigest(!next)
      else setDailyAlerts(!next)
      const message = err instanceof Error ? err.message : 'Failed to update preferences'
      toast.error(message)
    } finally {
      setDigestBusy(false)
    }
  }

  async function handlePreview() {
    if (!user?.email) {
      toast.error('No email on file for preview')
      return
    }
    setPreviewBusy(true)
    try {
      const result = await triggerDigestPreview(user.email)
      if (result.success) {
        toast.success('Preview digest sent', { description: `Check ${user.email} in a moment.` })
      } else {
        toast.error('Could not send preview', { description: result.error ?? 'Please try again.' })
      }
    } finally {
      setPreviewBusy(false)
    }
  }

  useEffect(() => {
    // Skip all push side-effects when the feature is disabled — avoids
    // touching the SW registration or the Notification API at all.
    if (!featureFlags.pushNotifications) return
    setPushAvailable(pushSupported())
    setPermissionState(pushPermission())
    if (pushSupported() && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.pushManager.getSubscription().then((sub) => setPushEnabled(!!sub))
      })
    }
  }, [])

  async function handleTogglePush(enable: boolean) {
    if (!user) return
    if (!featureFlags.pushNotifications) return
    setPushBusy(true)
    try {
      if (enable) {
        const sub = await subscribeToPush(user.id)
        if (sub) {
          setPushEnabled(true)
          toast.success('Push notifications enabled')
        } else if (pushPermission() === 'denied') {
          toast.error('Permission blocked', { description: 'Enable notifications in browser settings.' })
        } else {
          toast('Could not enable push', { description: 'Server VAPID key not configured.' })
        }
      } else {
        await unsubscribeFromPush()
        setPushEnabled(false)
        toast.success('Push notifications disabled')
      }
      setPermissionState(pushPermission())
    } catch (err) {
      console.warn(err)
      toast.error('Failed to update push subscription')
    } finally {
      setPushBusy(false)
    }
  }

  const [gpsConsent, setGpsConsentState] = useState<'granted' | 'declined' | null>(null)

  useEffect(() => {
    setGpsConsentState(getGpsConsent(user?.id))
  }, [user?.id])

  const {
    register: regProfile,
    handleSubmit: handleProfile,
    formState: { errors: profileErrors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile?.full_name ?? '',
      phone: profile?.phone ?? '',
    },
  })

  const {
    register: regPassword,
    handleSubmit: handlePassword,
    reset: resetPassword,
    formState: { errors: passwordErrors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  async function onSaveProfile(data: ProfileForm) {
    if (!user) return
    setSavingProfile(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: data.full_name, phone: data.phone?.trim() || null })
        .eq('id', user.id)
      if (error) throw error
      toast.success('Profile updated')
      // Refresh the auth-context profile so the topbar/identity chips update
      // without a full reload.
      void refreshProfile()
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setSavingProfile(false)
    }
  }

  async function onChangePassword(data: PasswordForm) {
    setSavingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: data.new_password })
      if (error) throw error
      toast.success('Password updated')
      resetPassword()
    } catch {
      toast.error('Failed to update password')
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `avatars/${user.id}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('org-logos')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('org-logos').getPublicUrl(path)
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', user.id)
      if (updateError) throw updateError
      setAvatarUrl(urlData.publicUrl)
      toast.success('Avatar updated')
      void refreshProfile()
    } catch {
      toast.error('Failed to upload avatar')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const initials = (profile?.full_name || user?.email || 'U')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const roleLabel = ROLE_LABELS[profile?.role ?? ''] ?? profile?.role ?? 'Unknown'

  return (
    <div className="space-y-6 max-w-2xl">
      <Breadcrumbs items={[
        { label: 'Settings', path: '/dashboard/settings' },
        { label: 'My Profile' },
      ]} />

      <PageHeader title="My Profile" />

      {/* Identity card */}
      <AppCard padding="lg">
        <div className="flex flex-row items-center gap-5">
        <div className="relative shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" className="w-16 h-16 rounded-full object-cover border border-border-default" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center text-white text-[18px] font-semibold">
              {initials}
            </div>
          )}
          <Tooltip delay={400}>
            <Tooltip.Trigger>
              <label
                htmlFor="avatar-upload"
                className="absolute -bottom-1 -right-1 bg-surface-card border border-border-default rounded-full p-1 cursor-pointer shadow-sm hover:bg-surface-page transition"
                aria-label="Change avatar"
              >
                {uploadingAvatar
                  ? <Loader2 className="w-3 h-3 text-text-muted animate-spin" />
                  : <Camera className="w-3 h-3 text-text-muted" />}
              </label>
            </Tooltip.Trigger>
            <Tooltip.Content placement="bottom">
              <Tooltip.Arrow />
              Change avatar
            </Tooltip.Content>
          </Tooltip>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            aria-label="Choose an avatar image to upload"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-text-primary">{profile?.full_name || '—'}</p>
          <p className="text-label text-text-muted mt-0.5">{user?.email}</p>
          <span className="mt-1.5 inline-flex">
            <Chip variant="soft" color="accent" size="sm">
              {roleLabel}
            </Chip>
          </span>
        </div>
        </div>
      </AppCard>

      {/* Personal details */}
      <AppCard padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
          <User size={15} className="text-brand-500" />
          <h2 className="text-body font-semibold text-text-primary">Personal Details</h2>
        </div>
        <form onSubmit={handleProfile(onSaveProfile)} className="px-6 py-5 space-y-4">
          <TextField isRequired isInvalid={!!profileErrors.full_name}>
            <Label>Full Name</Label>
            <Input type="text" placeholder="Your full name" {...regProfile('full_name')} />
            {profileErrors.full_name && <FieldError>{profileErrors.full_name.message}</FieldError>}
          </TextField>
          <TextField isDisabled value={user?.email ?? ''}>
            <Label>Email Address</Label>
            <Input type="email" />
            <p className="text-micro text-text-muted mt-1">Email cannot be changed here. Contact your admin.</p>
          </TextField>
          <TextField>
            <Label>Phone Number</Label>
            <Input type="tel" placeholder="+44 7700 900000" {...regProfile('phone')} />
          </TextField>
          <div className="flex justify-end pt-1">
            <Button type="submit" variant="primary" isDisabled={savingProfile}>
              {savingProfile && <Loader2 size={13} className="animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </AppCard>

      {/* Email digests */}
      <AppCard padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
          <Mail size={15} className="text-brand-500" />
          <h2 className="text-body font-semibold text-text-primary">Email Digests</h2>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-label text-text-primary font-medium">Weekly compliance digest</p>
              <p className="text-caption text-text-secondary mt-0.5">
                A Monday morning summary of overdue items, upcoming compliance, jobs completed and high-priority actions.
              </p>
              {lastDigestSentAt && (
                <p className="text-micro text-text-muted mt-1.5">
                  Last sent {new Date(lastDigestSentAt).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
            <Switch
              isSelected={weeklyDigest}
              isDisabled={digestBusy}
              onChange={() => { void handleToggleDigest('weekly_digest', !weeklyDigest) }}
              aria-label="Weekly compliance digest"
            />
          </div>

          <div className="flex items-start justify-between gap-4 pt-4 border-t border-border-subtle">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-label text-text-primary font-medium">Daily critical alerts</p>
                <Chip variant="soft" color="default" size="sm">
                  Coming soon
                </Chip>
              </div>
              <p className="text-caption text-text-secondary mt-0.5">
                Same-day notifications when something becomes overdue or a critical action is raised.
              </p>
            </div>
            <Switch
              isSelected={dailyAlerts}
              isDisabled
              aria-label="Daily critical alerts (coming soon)"
            />
          </div>

          <div className="flex justify-end pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewBusy || !user?.email}
              className="inline-flex items-center gap-1.5 bg-foreground text-background hover:bg-foreground/90 px-4 py-2 rounded-lg text-label font-medium transition-colors disabled:opacity-50"
            >
              {previewBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Send me a preview now
            </button>
          </div>
        </div>
      </AppCard>

      {/* Field-mode privacy */}
      <AppCard padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
          <MapPin size={15} className="text-brand-500" />
          <h2 className="text-body font-semibold text-text-primary">Field mode — Location</h2>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-label text-text-secondary">
            Field mode uses your device location to verify on-site arrival and check-in distance.
            Location is stored only when you take an action (start travel, check in, capture
            signature). You can opt out — manual confirmation will still be available.
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-label text-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={gpsConsent === 'declined'}
                onChange={(e) => {
                  if (!user?.id) return
                  if (e.target.checked) {
                    setGpsConsent(user.id, 'declined')
                    setGpsConsentState('declined')
                    toast.success('Location disabled for field mode')
                  } else {
                    clearGpsConsent(user.id)
                    setGpsConsentState(null)
                    toast.success('Location prompt re-enabled')
                  }
                }}
                className="rounded border-border-default"
              />
              Disable location for field mode
            </label>
            <span className="text-micro text-text-muted">
              Current state:{' '}
              <span className="font-medium text-text-primary">
                {gpsConsent === 'granted' ? 'Granted' : gpsConsent === 'declined' ? 'Declined' : 'Will ask first time'}
              </span>
            </span>
          </div>
        </div>
      </AppCard>

      {/* Push notifications — gated behind feature flag until VAPID + send-push edge function ship */}
      {featureFlags.pushNotifications && (
        <AppCard padding="none" className="overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
            {pushEnabled ? <Bell size={15} className="text-brand-500" /> : <BellOff size={15} className="text-brand-500" />}
            <h2 className="text-body font-semibold text-text-primary">Push Notifications</h2>
          </div>
          <div className="px-6 py-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-label text-text-primary font-medium">
                Enable browser notifications
              </p>
              <p className="text-caption text-text-secondary mt-0.5">
                {!pushAvailable
                  ? 'Your browser does not support push notifications.'
                  : permissionState === 'denied'
                    ? 'Permission is blocked — enable it in your browser settings.'
                    : 'Get alerts for new jobs, urgent actions, and assignments — even when the app is closed.'}
              </p>
            </div>
            <Switch
              isSelected={pushEnabled}
              isDisabled={!pushAvailable || pushBusy || permissionState === 'denied'}
              onChange={() => { void handleTogglePush(!pushEnabled) }}
              aria-label="Enable push notifications"
            />
          </div>
        </AppCard>
      )}

      {/* Change password */}
      <AppCard padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border-subtle flex items-center gap-2">
          <Lock size={15} className="text-brand-500" />
          <h2 className="text-body font-semibold text-text-primary">Change Password</h2>
        </div>
        <form onSubmit={handlePassword(onChangePassword)} className="px-6 py-5 space-y-4">
          <TextField isRequired isInvalid={!!passwordErrors.new_password}>
            <Label>New Password</Label>
            <Input type="password" placeholder="Min. 8 characters" {...regPassword('new_password')} />
            {passwordErrors.new_password && <FieldError>{passwordErrors.new_password.message}</FieldError>}
          </TextField>
          <TextField isRequired isInvalid={!!passwordErrors.confirm_password}>
            <Label>Confirm New Password</Label>
            <Input type="password" placeholder="Repeat new password" {...regPassword('confirm_password')} />
            {passwordErrors.confirm_password && <FieldError>{passwordErrors.confirm_password.message}</FieldError>}
          </TextField>
          <div className="flex justify-end pt-1">
            <Button type="submit" variant="primary" isDisabled={savingPassword}>
              {savingPassword && <Loader2 size={13} className="animate-spin" />}
              Update Password
            </Button>
          </div>
        </form>
      </AppCard>
    </div>
  )
}

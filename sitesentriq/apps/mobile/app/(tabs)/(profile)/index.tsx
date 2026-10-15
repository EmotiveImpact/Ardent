import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { LogOut, Shield, Mail, User, Building2, Moon } from 'lucide-react-native'
import { Switch } from 'heroui-native'
import { useAuth } from '@/hooks/useAuth'
import { SectionLabel, cardShadow } from '@/components/ui/primitives'
import { useAppTheme } from '@/lib/theme'
import { deadLetterCount, pendingCount } from '@/lib/offline-queue'
import { APP_CONFIG } from '@/constants/config'

const ROLE_LABELS: Record<string, string> = {
  org_admin: 'Admin',
  manager: 'Manager',
  engineer: 'Engineer',
  viewer: 'Viewer',
  client: 'Client',
}

export default function ProfileScreen() {
  const { profile, user, signOut } = useAuth()
  const { isDark, toggle } = useAppTheme()

  const initials = (profile?.full_name || user?.email || 'U')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const roleLabel = ROLE_LABELS[profile?.role ?? ''] ?? profile?.role ?? 'Unknown'

  async function handleSignOut() {
    const [pending, failed] = await Promise.all([pendingCount(), deadLetterCount()])
    const unsynced = pending + failed
    const message = unsynced > 0
      ? `${unsynced} field change${unsynced === 1 ? '' : 's'} have not synced. Signing out will discard them from this shared device. Stay signed in and retry sync unless you are certain.`
      : 'Are you sure you want to sign out?'
    Alert.alert('Sign Out', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: unsynced > 0 ? 'Discard & Sign Out' : 'Sign Out', style: 'destructive', onPress: signOut },
    ])
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-8"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar card */}
        <View className="mb-5 flex-row items-center gap-4 rounded-2xl border border-border bg-surface p-4" style={cardShadow}>
          <View className="h-14 w-14 items-center justify-center rounded-full bg-[#e8772e]">
            <Text className="text-xl font-bold text-white">{initials}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-foreground">{profile?.full_name ?? '—'}</Text>
            <Text className="mt-0.5 text-[13px] text-muted">{user?.email}</Text>
            <View
              className="mt-1.5 flex-row items-center gap-1 self-start rounded-full px-2 py-0.5"
              style={{ backgroundColor: 'rgba(232,119,46,0.12)' }}
            >
              <Shield size={11} color="#e8772e" />
              <Text className="text-[11px] font-semibold text-[#e8772e]">{roleLabel}</Text>
            </View>
          </View>
        </View>

        {/* Account info */}
        <View className="mb-5">
          <SectionLabel>Account Info</SectionLabel>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface" style={cardShadow}>
            <InfoRow icon={<User size={16} color="#e8772e" />} label="Full Name" value={profile?.full_name ?? '—'} />
            <View className="ml-[60px] h-px bg-border" />
            <InfoRow icon={<Mail size={16} color="#e8772e" />} label="Email" value={user?.email ?? '—'} />
            <View className="ml-[60px] h-px bg-border" />
            <InfoRow icon={<Building2 size={16} color="#e8772e" />} label="Role" value={roleLabel} />
          </View>
        </View>

        {/* Appearance */}
        <View className="mb-5">
          <SectionLabel>Appearance</SectionLabel>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface" style={cardShadow}>
            <View className="flex-row items-center gap-3 px-4 py-3.5">
              <View
                className="h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'rgba(232,119,46,0.12)' }}
              >
                <Moon size={16} color="#e8772e" />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-medium text-foreground">Dark Mode</Text>
                <Text className="mt-0.5 text-[12px] text-muted">Easier on the eyes in low light</Text>
              </View>
              <Switch isSelected={isDark} onSelectedChange={toggle} />
            </View>
          </View>
        </View>

        {/* App info */}
        <View className="mb-5">
          <SectionLabel>App</SectionLabel>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface" style={cardShadow}>
            <View className="flex-row items-center px-4 py-3.5">
              <View className="flex-1">
                <Text className="text-[12px] text-muted">Version</Text>
                <Text className="mt-0.5 text-[15px] font-medium text-foreground">{APP_CONFIG.version}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Sign out */}
        <TouchableOpacity
          className="mt-1 flex-row items-center justify-center gap-2 rounded-2xl border border-[#fecaca] bg-[#fff5f5] py-4"
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <LogOut size={16} color="#ef4444" />
          <Text className="text-[15px] font-semibold text-[#ef4444]">Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3.5">
      <View
        className="h-9 w-9 items-center justify-center rounded-xl"
        style={{ backgroundColor: 'rgba(232,119,46,0.12)' }}
      >
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-[12px] text-muted">{label}</Text>
        <Text className="mt-0.5 text-[15px] font-medium text-foreground">{value}</Text>
      </View>
    </View>
  )
}

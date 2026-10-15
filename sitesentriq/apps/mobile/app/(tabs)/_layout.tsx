import { Tabs } from 'expo-router'
import { View, Text } from 'react-native'
import { House, ClipboardList, CalendarDays, LibraryBig } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { COLORS } from '@/constants/config'
import { useAuth } from '@/hooks/useAuth'

// Slightly larger than the navigator default (~24) so the Lucide tab icons read
// clearly above their labels. Bump/drop this one value to resize all five.
const ICON_SIZE = 30
// Uniform stroke for every tab icon — the ACTIVE tab is shown by colour (brand
// orange) only, not a heavier/bolder stroke.
const ICON_STROKE = 1.8

/** Profile tab icon = the user's avatar (initials), not a generic person icon. */
function ProfileTabIcon({ focused }: { focused: boolean }) {
  const { profile, user } = useAuth()
  const initials = (profile?.full_name || user?.email || 'U')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  return (
    <View
      style={{
        width: ICON_SIZE,
        height: ICON_SIZE,
        borderRadius: ICON_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.brand,
        // A thin ring marks the active tab without bolding anything.
        borderWidth: focused ? 2 : 0,
        borderColor: '#ffffff',
        opacity: focused ? 1 : 0.8,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '700' }}>{initials}</Text>
    </View>
  )
}

// Five tabs: Today = now · Jobs = all my work · Schedule = what's coming up
// (day-grouped) · Reference folds Assets + Compliance into one lookup surface ·
// Profile (avatar). The top-right header holds the notifications bell (see
// components/ui/HeaderActions). Each tab is a nested native Stack (see its
// _layout) so screens get real iOS large-title headers.
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: '#9aa0b4',
        tabBarStyle: {
          backgroundColor: COLORS.chrome,
          borderTopColor: 'rgba(255,255,255,0.08)',
          borderTopWidth: 1,
        },
        // Medium weight (not bold) — the active label is distinguished by colour.
        // marginTop adds a gap so the label isn't cramped under the larger icon.
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginTop: 4 },
        tabBarIconStyle: { marginTop: 2 },
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.selectionAsync()
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <House size={ICON_SIZE} color={color} strokeWidth={ICON_STROKE} />,
        }}
      />
      <Tabs.Screen
        name="(work)"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => <ClipboardList size={ICON_SIZE} color={color} strokeWidth={ICON_STROKE} />,
        }}
      />
      <Tabs.Screen
        name="(schedule)"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color }) => <CalendarDays size={ICON_SIZE} color={color} strokeWidth={ICON_STROKE} />,
        }}
      />
      <Tabs.Screen
        name="(reference)"
        options={{
          title: 'Reference',
          tabBarIcon: ({ color }) => <LibraryBig size={ICON_SIZE} color={color} strokeWidth={ICON_STROKE} />,
        }}
      />
      <Tabs.Screen
        name="(profile)"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />
    </Tabs>
  )
}

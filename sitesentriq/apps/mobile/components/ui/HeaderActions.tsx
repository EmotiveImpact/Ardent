import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { Bell } from 'lucide-react-native'
import { useNotifications } from '@/hooks/useNotifications'
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus'
import { COLORS } from '@/constants/config'

/**
 * Top-right header action: the notifications bell (with an unread badge).
 * Profile now lives in the bottom tab bar, so the header is just the bell.
 */
export function HeaderActions() {
  const { unreadCount, refetch } = useNotifications()
  // The bell is a separate useNotifications instance from the notifications
  // screen, so refetch on focus — otherwise the badge stays stale after the
  // user marks notifications read on that screen and returns to a tab.
  useRefetchOnFocus(refetch)
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={() => router.push('/notifications')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <Bell size={22} color="#ffffff" />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: COLORS.navy,
  },
  badgeText: { color: '#ffffff', fontSize: 9.5, fontWeight: '800' },
})

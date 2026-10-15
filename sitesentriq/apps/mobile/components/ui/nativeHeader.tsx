import { HeaderActions } from './HeaderActions'
import { HeaderBrand } from './HeaderBrand'
import { COLORS } from '@/constants/config'

// Shared native-header styling for every top-level tab screen. A solid navy app
// bar: the app brand (H-mark + "HAUMEA") on the LEFT, the page title centred, and
// the notifications bell on the right.
export const brandHeaderOptions = {
  headerShadowVisible: false,
  headerStyle: { backgroundColor: COLORS.chrome },
  headerLeft: () => <HeaderBrand />,
  // Centred section title hidden for now via an empty per-screen `title` (the
  // native iOS header ignores a null headerTitle and falls back to the route
  // name "index", so an empty title string is the reliable way to blank it).
  headerTitleStyle: { color: '#ffffff', fontWeight: '700' as const, fontSize: 17 },
  headerTintColor: COLORS.brand,
  headerRight: () => <HeaderActions />,
} as const

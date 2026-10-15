# Haumea Mobile App

Field engineer app for Haumea — built with Expo + React Native.

## Screens

- **Login** — Supabase email/password auth
- **Today** — Today's assigned jobs with stats
- **Jobs** — All jobs with status filter
- **Job Detail** — Full job view with GPS check-in/out, photos, and signatures
- **Profile** — Engineer profile + sign out

## Setup

### 1. Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your phone (for testing)

### 2. Install dependencies

```bash
cd mobile
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

### 4. Start the app

```bash
npx expo start
```

Scan the QR code with Expo Go on your phone.

### 5. iOS / Android build

```bash
# Development build (recommended for native features)
npx expo run:ios
npx expo run:android

# Production build via EAS
npm install -g eas-cli
eas build --platform ios
eas build --platform android
```

## Architecture

```
mobile/
├── app/
│   ├── _layout.tsx          ← Root layout + auth guard
│   ├── (auth)/
│   │   └── index.tsx        ← Login screen
│   ├── (tabs)/
│   │   ├── _layout.tsx      ← Bottom tab nav (Today, Jobs, Profile)
│   │   ├── index.tsx        ← Today's jobs
│   │   ├── jobs.tsx         ← All jobs list
│   │   └── profile.tsx      ← Profile screen
│   └── job/
│       └── [id].tsx         ← Job detail (GPS, photos, signatures)
├── components/
│   ├── jobs/
│   │   ├── JobCard.tsx      ← Pressable job card
│   │   └── SignaturePad.tsx ← Canvas signature capture
│   └── ui/
│       ├── StatusBadge.tsx  ← Coloured job status badge
│       └── OfflineBanner.tsx ← Offline indicator strip
├── hooks/
│   ├── useAuth.ts           ← Supabase auth state
│   ├── useJobs.ts           ← Jobs data fetching + mutations
│   └── useOffline.ts        ← NetInfo offline detection
├── lib/
│   ├── supabase.ts          ← Supabase client + types
│   └── notifications.ts     ← Push notification setup
└── constants/
    └── config.ts            ← Colors, app config
```

## Features

| Feature | Status |
|---------|--------|
| Login / Logout | ✅ |
| Today's jobs | ✅ |
| All jobs list with filter | ✅ |
| Job detail view | ✅ |
| GPS check-in / check-out | ✅ |
| Camera + photo upload | ✅ |
| Digital signature capture | ✅ |
| Offline indicator | ✅ |
| Push notifications | ✅ |

## Notes

- Uses `expo-secure-store` for token storage (secure on device)
- GPS requires physical device (not simulator)
- Signature pad uses WebView canvas via `react-native-signature-canvas`
- Photos upload to Supabase Storage `job-photos` bucket — create this bucket in your Supabase dashboard

import type { ExpoConfig } from 'expo/config'
import appJson from './app.json'
import packageJson from './package.json'

// package.json is the release source of truth used by both the native bundle
// metadata and the in-app profile screen.
export default (): ExpoConfig => ({
  ...(appJson.expo as ExpoConfig),
  version: packageJson.version,
})

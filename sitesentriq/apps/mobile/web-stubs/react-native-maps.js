// Web stub for react-native-maps (a native-only module — it imports
// codegenNativeCommands which Metro can't bundle for web). On the web target we
// swap the whole package for this no-op so the Expo Web bundle compiles for
// previews/testing. Maps only function on a real device; on web the map screen
// renders an empty placeholder, which is fine for UI verification.
//
// Wired up in metro.config.js resolveRequest (platform === 'web' only) — native
// builds are unaffected and use the real react-native-maps.
const React = require('react')
const { View } = require('react-native')

const Noop = React.forwardRef(function MapStub(props, _ref) {
  return React.createElement(View, props)
})

// Default export is MapView; every named export (Marker, Callout, Polyline,
// PROVIDER_GOOGLE, etc.) resolves to a harmless no-op component/value.
module.exports = new Proxy(
  { __esModule: true, default: Noop },
  {
    get(target, prop) {
      if (prop in target) return target[prop]
      return Noop
    },
  },
)

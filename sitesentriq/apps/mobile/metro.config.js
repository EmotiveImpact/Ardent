// Metro config — Expo defaults + monorepo React dedupe.
//
// In this npm-workspaces monorepo, Metro can resolve `react`/`react-dom` to BOTH
// apps/mobile/node_modules (19.1.0) and the repo-root node_modules (19.2.5),
// loading two copies → "Invalid hook call / more than one copy of React",
// especially on the web target. Force every `react`/`react-dom` import to this
// app's single copy.
const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch the monorepo root so workspace packages (@haumea/*) resolve.
config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Pin a single React/React-DOM to this app's copy.
const single = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-dom': path.resolve(projectRoot, 'node_modules/react-dom'),
}
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  ...single,
}

const baseResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // react-native-maps is native-only (imports codegenNativeCommands). On the
  // web target, swap the whole package for a no-op stub so the Expo Web bundle
  // compiles (used for browser-based UI previews/testing). Native is untouched.
  if (
    platform === 'web' &&
    (moduleName === 'react-native-maps' || moduleName.startsWith('react-native-maps/'))
  ) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(projectRoot, 'web-stubs/react-native-maps.js'),
    }
  }
  for (const [name, dir] of Object.entries(single)) {
    if (moduleName === name || moduleName.startsWith(`${name}/`)) {
      const sub = moduleName.slice(name.length) // '' or '/jsx-runtime'
      return context.resolveRequest(
        { ...context, originModulePath: path.join(dir, 'index.js') },
        `${dir}${sub}`,
        platform,
      )
    }
  }
  return (baseResolveRequest || context.resolveRequest)(context, moduleName, platform)
}

// Uniwind (Tailwind v4 bindings for RN, used by HeroUI Native) must be the
// OUTERMOST wrapper of the Metro config. It compiles global.css and generates
// className typings. Our React-dedupe resolver above is preserved inside.
module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
})

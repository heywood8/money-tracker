// Sentry wraps Expo's default Metro config to inject Debug IDs into the bundle
// and source maps, which is what links uploaded source maps to captured events.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Add support for WASM files
config.resolver.assetExts = config.resolver.assetExts || [];
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// Ensure wasm is not in sourceExts
config.resolver.sourceExts = (config.resolver.sourceExts || []).filter(
  ext => ext !== 'wasm',
);

// Resolve Node.js built-in modules to empty modules for React Native compatibility
const path = require('path');
const emptyModulePath = path.resolve(__dirname, 'polyfills/empty.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // List of Node.js built-in modules that should be excluded from the bundle
  const nodeBuiltins = [
    'node:crypto',
    'node:fs',
    'node:path',
    'node:stream',
    'node:util',
    'crypto',
    'fs',
    'path',
    'stream',
    'util',
  ];

  if (nodeBuiltins.includes(moduleName)) {
    // Return the empty polyfill module
    return {
      type: 'sourceFile',
      filePath: emptyModulePath,
    };
  }

  // Fallback to the default resolver
  return context.resolveRequest(context, moduleName, platform);
};

// Transformer options.
// experimentalImportSupport is required for Expo's experimental tree shaking
// (paired with EXPO_UNSTABLE_TREE_SHAKING + EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH,
// set on the production EAS build). It rewrites ESM imports so Metro can
// statically analyze and drop unused exports. inlineRequires keeps startup fast.
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: true,
    },
  }),
};

module.exports = config;
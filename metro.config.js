const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

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

// Add transformer options for web
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

module.exports = config;
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// Add support for WASM and SQL files
config.resolver.assetExts = config.resolver.assetExts || [];
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}
if (!config.resolver.assetExts.includes('sql')) {
  config.resolver.assetExts.push('sql');
}

// Ensure wasm is not in sourceExts
config.resolver.sourceExts = (config.resolver.sourceExts || []).filter(
  ext => ext !== 'wasm'
);

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
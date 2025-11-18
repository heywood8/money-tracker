const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(
    {
      ...env,
      babel: {
        dangerouslyAddModulePathsToTranspile: ['expo-sqlite'],
      },
    },
    argv
  );

  // Enable WebAssembly experiments
  config.experiments = {
    ...config.experiments,
    asyncWebAssembly: true,
    syncWebAssembly: true,
  };

  // Add rule for WASM files
  config.module.rules.push({
    test: /\.wasm$/,
    type: 'webassembly/async',
  });

  // Ensure WASM files are resolved
  if (!config.resolve.extensions.includes('.wasm')) {
    config.resolve.extensions.push('.wasm');
  }

  return config;
};

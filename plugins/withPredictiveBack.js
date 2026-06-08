const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin: opt the app into Android's predictive-back system.
 *
 * Sets `android:enableOnBackInvokedCallback="true"` on the <application> node so
 * the platform delivers the predictive-back progress stream to our
 * `OnBackPressedCallback` (see modules/predictive-back). Without this flag the
 * system falls back to the legacy back dispatch and never reports in-progress
 * gesture animation.
 *
 * The android/ folder is gitignored (managed workflow), so this must be a config
 * plugin rather than a hand-edited manifest.
 */
const withPredictiveBack = (config) => {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:enableOnBackInvokedCallback'] = 'true';
    }
    return config;
  });
};

module.exports = withPredictiveBack;

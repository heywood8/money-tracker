// Architecture filtering: Only arm64-v8a for preview builds to speed up build time
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';
const ANDROID_ARCHITECTURES = IS_PREVIEW ? ['arm64-v8a'] : undefined; // undefined = all architectures

module.exports = {
  expo: {
    name: 'Penny',
    slug: 'app',
    version: '0.179.0', // x-release-please-version
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true, // Required for react-native-worklets (used by reanimated 4.x)
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    packagerOpts: {
      hostType: 'tunnel',
    },
    scheme: 'com.heywood8.monkeep',
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      package: 'com.heywood8.monkeep',
      permissions: [
        'android.permission.REQUEST_INSTALL_PACKAGES',
        // Foreground-only location for the opt-in "attach location to operations"
        // feature. COARSE is enough for ~150 m proximity recall; FINE refines the
        // fix when the user grants precise location. No background location.
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
    },
    extra: {
      eas: {
        projectId: '89372eb2-93f5-475a-a630-9caa827d8406',
      },
      // Sentry runtime config, read by app/services/sentry.js via expo-constants.
      // The DSN is a public client key — it ships inside every release APK
      // regardless, so it is safe to commit. An env var can override it.
      sentry: {
        dsn:
          process.env.SENTRY_DSN ||
          'https://f06a0b39f8c767ce0baa256f79dabe5b@o4510430127980544.ingest.de.sentry.io/4510430145740880',
        environment: process.env.APP_VARIANT || undefined,
      },
    },
    owner: 'lopatinikita',
    platforms: ['android'],
    plugins: [
      'expo-sqlite',
      '@react-native-google-signin/google-signin',
      '@react-native-community/datetimepicker',
      // Foreground-only location. No "always"/background permission strings.
      ['expo-location', { locationAlwaysAndWhenInUsePermission: false }],
      [
        'expo-build-properties',
        {
          android: {
            // Only build arm64-v8a for preview builds to speed up build time (~75% faster)
            // For production, build all architectures (default)
            ...(ANDROID_ARCHITECTURES && { buildArchs: ANDROID_ARCHITECTURES }),
          },
        },
      ],
      [
        // Sets up native Sentry and uploads source maps + ProGuard mappings at
        // build time. Authentication uses the SENTRY_AUTH_TOKEN env var. The
        // org/project slugs and region URL are not secret; they default to this
        // project's values and can be overridden by env vars.
        '@sentry/react-native/expo',
        {
          organization: process.env.SENTRY_ORG || 'heywood8',
          project: process.env.SENTRY_PROJECT || 'penny',
          // This org lives in Sentry's EU/DE data region, so source-map uploads
          // must target de.sentry.io rather than the default https://sentry.io/.
          url: process.env.SENTRY_URL || 'https://de.sentry.io/',
        },
      ],
      './plugins/withR8Config.js',
      // Declares a no-op NotificationListenerService so the app can request the
      // "Notification access" special permission (read notifications in the
      // background). No notifications are read or processed.
      './plugins/withNotificationListener.js',
      // Local notifications for the opt-in background "transactions to review"
      // alert. Only local (scheduled) notifications are used — no push/FCM setup
      // is required. The plugin also declares the POST_NOTIFICATIONS permission
      // needed on Android 13+.
      'expo-notifications',
    ],
    updates: {
      'url': 'https://u.expo.dev/89372eb2-93f5-475a-a630-9caa827d8406',
    },
    runtimeVersion: {
      policy: 'sdkVersion',
    },
  },
};

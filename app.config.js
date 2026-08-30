// Architecture filtering to speed up build time:
//  - preview:  arm64-v8a only (real devices; ~75% faster than all-ABI)
//  - emulator: arm64-v8a + x86_64 (installable on x86_64 AVDs for UI testing)
//  - x86:      x86_64 only (parallel CI build for x86_64 AVDs / Chromebooks)
//  - other:    all architectures
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';
const IS_EMULATOR = process.env.APP_VARIANT === 'emulator';
const IS_X86 = process.env.APP_VARIANT === 'x86';
const ANDROID_ARCHITECTURES = IS_PREVIEW
  ? ['arm64-v8a']
  : IS_EMULATOR
    ? ['arm64-v8a', 'x86_64']
    : IS_X86
      ? ['x86_64']
      : undefined; // undefined = all architectures

module.exports = {
  expo: {
    name: 'Penny',
    slug: 'app',
    version: '0.280.2', // x-release-please-version
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true, // Required for react-native-worklets (used by reanimated 4.x)
    packagerOpts: {
      hostType: 'tunnel',
    },
    scheme: 'com.heywood8.monkeep',
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
        // Android 13+ themed icons tint a single-colour layer with the user's
        // wallpaper palette. Without one the launcher falls back to the full
        // adaptive icon, so Penny's mascot sat unthemed among themed icons.
        // The layer is the mascot itself, extracted from the foreground artwork
        // as a silhouette with the face punched out of it (a flat silhouette of
        // a character drawn on a disc is just a disc); see
        // scripts/generate-notification-icon.js.
        monochromeImage: './assets/monochrome-icon.png',
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
      // The splash is configured through the plugin rather than the deprecated
      // top-level `splash` key so the icon size can be pinned: `resizeMode:
      // 'contain'` scaled it to the screen width, which made it jump when
      // ColdStartScreen took over. `imageWidth` must stay equal to MARK_SIZE in
      // app/components/startup/ColdStartScreen.js, and the background is the
      // brand navy (BRAND.surface) in both themes so the handover has no seam.
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 200,
          backgroundColor: '#001329',
        },
      ],
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
      //
      // `icon` is required, not cosmetic: Android draws the small icon as an
      // alpha mask, so without a purpose-made monochrome asset it falls back to
      // the launcher icon and every alert shows up as a featureless white blob.
      // This one is the default; the per-alert icons are set by the plugin below.
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#007AFF',
        },
      ],
      // Gives the "transactions to review" and "operations added" alerts their
      // own status-bar icons, which expo-notifications alone cannot express.
      './plugins/withNotificationIcons.js',
    ],
    updates: {
      'url': 'https://u.expo.dev/89372eb2-93f5-475a-a630-9caa827d8406',
    },
    runtimeVersion: {
      policy: 'sdkVersion',
    },
  },
};

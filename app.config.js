// Architecture filtering: Only arm64-v8a for preview builds to speed up build time
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';
const ANDROID_ARCHITECTURES = IS_PREVIEW ? ['arm64-v8a'] : undefined; // undefined = all architectures

// Google OAuth reversed client ID scheme for Android OAuth redirect
// Android OAuth clients only accept com.googleusercontent.apps.{clientId}:/ as redirect URI
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const GOOGLE_REVERSED_CLIENT_ID = GOOGLE_CLIENT_ID.split('.').reverse().join('.');

module.exports = {
  expo: {
    name: 'Penny',
    slug: 'app',
    version: '0.82.0', // x-release-please-version
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
      permissions: ['android.permission.REQUEST_INSTALL_PACKAGES'],
      intentFilters: [
        {
          action: 'VIEW',
          data: [{ scheme: GOOGLE_REVERSED_CLIENT_ID }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    extra: {
      eas: {
        projectId: '89372eb2-93f5-475a-a630-9caa827d8406',
      },
    },
    owner: 'lopatinikita',
    platforms: ['android'],
    plugins: [
      'expo-sqlite',
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
      './plugins/withR8Config.js',
    ],
    updates: {
      'url': 'https://u.expo.dev/89372eb2-93f5-475a-a630-9caa827d8406',
    },
    runtimeVersion: {
      policy: 'sdkVersion',
    },
  },
};

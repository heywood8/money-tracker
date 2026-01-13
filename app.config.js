// Determine if this is a development build:
// - Local dev: no APP_VARIANT set → use 'PennyDev'
// - EAS development profile: APP_VARIANT === 'development' → use 'PennyDev'
// - EAS preview/production: APP_VARIANT === 'preview'/'production' → use 'Penny'
const IS_DEV = !process.env.APP_VARIANT || process.env.APP_VARIANT === 'development';

// App name: PennyDev for local dev/development, Penny for preview/production
const APP_NAME = IS_DEV ? 'PennyDev' : 'Penny';

// Package name: .dev suffix for local dev/development, clean for preview/production
const PACKAGE_NAME = IS_DEV ? 'com.heywood8.monkeep.dev' : 'com.heywood8.monkeep';

// Architecture filtering: Only arm64-v8a for preview builds to speed up build time
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';
const ANDROID_ARCHITECTURES = IS_PREVIEW ? ['arm64-v8a'] : undefined; // undefined = all architectures

module.exports = {
  expo: {
    name: APP_NAME,
    slug: 'app',
    version: '0.31.2', // x-release-please-version
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    packagerOpts: {
      hostType: 'tunnel',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      package: PACKAGE_NAME,
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

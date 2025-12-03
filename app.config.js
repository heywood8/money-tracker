const IS_DEV = process.env.EAS_BUILD_PROFILE === 'development' || !process.env.EAS_BUILD_PROFILE;


// App name: PennyDev for local dev, Penny for preview/production
const APP_NAME = IS_DEV ? 'PennyDev' : 'Penny';

// Package name: .dev suffix for local dev, clean for preview/production
const PACKAGE_NAME = IS_DEV ? 'com.heywood8.monkeep.dev' : 'com.heywood8.monkeep';

module.exports = {
  expo: {
    name: APP_NAME,
    slug: 'app',
    version: '0.6.0', // x-release-please-version
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
      [
        '@sentry/react-native/expo',
        {
          url: 'https://sentry.io/',
          project: 'penny',
          organization: 'heywood8',
        },
      ],
    ],
  },
};

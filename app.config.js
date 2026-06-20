// Architecture filtering: Only arm64-v8a for preview builds to speed up build time
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';
const ANDROID_ARCHITECTURES = IS_PREVIEW ? ['arm64-v8a'] : undefined; // undefined = all architectures

module.exports = {
  expo: {
    name: 'Penny',
    slug: 'app',
    version: '0.146.0', // x-release-please-version
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
      // Register Penny as a handler for opening SQLite database backup files.
      // When the user opens a .db/.sqlite file from a file manager, email
      // attachment, etc., Android offers Penny as one of the apps, and the
      // launching ACTION_VIEW intent's content/file URI is delivered to JS via
      // expo/react-native Linking (see app/hooks/useSqliteFileImport.js).
      //
      // SQLite files on disk are usually typed as application/octet-stream by
      // Android (there is no standard registered MIME type for the .db
      // extension), so we match that alongside the SQLite-specific MIME types
      // and an extension-based pathPattern fallback for the file:// scheme.
      // Files that turn out not to be valid backups are rejected gracefully by
      // the import flow after the confirmation warning.
      intentFilters: [
        {
          action: 'VIEW',
          category: ['DEFAULT', 'BROWSABLE'],
          data: [
            { scheme: 'content', mimeType: 'application/x-sqlite3' },
            { scheme: 'content', mimeType: 'application/vnd.sqlite3' },
            { scheme: 'content', mimeType: 'application/octet-stream' },
            { scheme: 'file', mimeType: 'application/x-sqlite3' },
            { scheme: 'file', mimeType: 'application/vnd.sqlite3' },
            { scheme: 'file', mimeType: 'application/octet-stream' },
            { scheme: 'file', mimeType: '*/*', pathPattern: '.*\\.db' },
            { scheme: 'file', mimeType: '*/*', pathPattern: '.*\\.sqlite' },
            { scheme: 'file', mimeType: '*/*', pathPattern: '.*\\.sqlite3' },
          ],
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
      '@react-native-google-signin/google-signin',
      '@react-native-community/datetimepicker',
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

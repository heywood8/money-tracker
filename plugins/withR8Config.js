const { withGradleProperties, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to configure gradle.properties for R8/ProGuard
 * This ensures consistent build settings across local and EAS builds
 */
const withR8Config = (config) => {
  // Configure gradle properties
  config = withGradleProperties(config, (config) => {
    // Get existing properties or initialize empty array
    config.modResults = config.modResults || [];

    // Properties to add/update
    // CI detection: Check for common CI environment variables
    const isCI = process.env.CI === 'true' ||
                 process.env.GITHUB_ACTIONS === 'true' ||
                 process.env.EAS_BUILD === 'true';

    const properties = {
      'android.enableMinifyInReleaseBuilds': 'true',
      'android.enableShrinkResourcesInReleaseBuilds': 'true',
      'android.enablePngCrunchInReleaseBuilds': 'true',
      // Gradle JVM args - optimized for CI (GitHub Actions: 7GB RAM)
      // CI: Conservative settings to avoid OOM
      // Local: More aggressive settings for faster builds
      'org.gradle.jvmargs': isCI
        ? '-Xmx3072m -XX:MaxMetaspaceSize=768m -XX:+HeapDumpOnOutOfMemoryError -XX:+UseG1GC'
        : '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -XX:+UseG1GC',
      // Disable parallel/daemon in CI for better memory control
      'org.gradle.parallel': isCI ? 'false' : 'true',
      'org.gradle.daemon': isCI ? 'false' : 'true',
      'org.gradle.configureondemand': 'true',
      'org.gradle.caching': 'true',
    };

    if (isCI) {
      console.log('🔧 CI detected: Using conservative Gradle memory settings (3GB heap + 768MB metaspace)');
    }

    // For preview builds, restrict to arm64-v8a only for faster builds
    // This is a more reliable method than expo-build-properties buildArchs (known issues)
    if (process.env.APP_VARIANT === 'preview') {
      properties['reactNativeArchitectures'] = 'arm64-v8a';
      console.log('🏗️  Building for arm64-v8a only (preview build)');
    }

    // Update or add each property
    Object.entries(properties).forEach(([key, value]) => {
      const existingIndex = config.modResults.findIndex((item) => item.key === key);
      if (existingIndex >= 0) {
        // Update existing property
        config.modResults[existingIndex] = { type: 'property', key, value };
      } else {
        // Add new property
        config.modResults.push({ type: 'property', key, value });
      }
    });

    return config;
  });

  // Copy ProGuard rules from project root to android/app/
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const sourceProguardFile = path.join(projectRoot, 'proguard-rules.pro');
      const targetProguardFile = path.join(
        projectRoot,
        'android',
        'app',
        'proguard-rules.pro',
      );

      // Only copy if source file exists
      if (fs.existsSync(sourceProguardFile)) {
        const proguardContent = fs.readFileSync(sourceProguardFile, 'utf-8');

        // Ensure target directory exists
        const targetDir = path.dirname(targetProguardFile);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        fs.writeFileSync(targetProguardFile, proguardContent);
        console.log('✅ ProGuard rules copied to android/app/proguard-rules.pro');
      } else {
        console.warn('⚠️  proguard-rules.pro not found in project root');
      }

      return config;
    },
  ]);

  return config;
};

module.exports = withR8Config;

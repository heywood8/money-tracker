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
    const properties = {
      'android.enableMinifyInReleaseBuilds': 'true',
      'android.enableShrinkResourcesInReleaseBuilds': 'true',
      'android.enablePngCrunchInReleaseBuilds': 'true',
    };

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

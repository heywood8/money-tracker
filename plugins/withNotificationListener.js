const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin: declare a NotificationListenerService so the app can ask
 * the user for permission to read notifications in the background.
 *
 * On Android, reading other apps' notifications requires a service that extends
 * NotificationListenerService and is guarded by
 * BIND_NOTIFICATION_LISTENER_SERVICE. Only when such a service is declared does
 * the app appear in the system "Notification access" screen, where the user
 * grants the special-access permission.
 *
 * This plugin only wires up the permission request. The service it registers is
 * a deliberate no-op: it does not read, store, or process any notifications.
 */

const ANDROID_PACKAGE = 'com.heywood8.monkeep';
const SERVICE_CLASS = 'PennyNotificationListenerService';

const SERVICE_SOURCE = `package ${ANDROID_PACKAGE}

import android.service.notification.NotificationListenerService

/**
 * No-op notification listener.
 *
 * This service exists solely so that Penny appears in Android's
 * "Notification access" settings screen, allowing the user to grant the
 * BIND_NOTIFICATION_LISTENER_SERVICE permission. It intentionally does NOT
 * read, store, or process any notifications — no functionality beyond enabling
 * the permission request is implemented here.
 */
class ${SERVICE_CLASS} : NotificationListenerService()
`;

/**
 * Adds the <service> declaration (and its intent-filter) to AndroidManifest.xml.
 */
const addServiceToManifest = (config) =>
  withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error(
        'withNotificationListener: <application> not found in AndroidManifest.xml',
      );
    }

    application.service = application.service || [];

    const serviceName = `.${SERVICE_CLASS}`;
    const alreadyDeclared = application.service.some(
      (service) => service?.$?.['android:name'] === serviceName,
    );

    if (!alreadyDeclared) {
      application.service.push({
        $: {
          'android:name': serviceName,
          'android:label': '@string/app_name',
          // The system binds to this service from outside the app, so it must
          // be exported (required explicitly on Android 12+).
          'android:exported': 'true',
          'android:permission':
            'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name':
                    'android.service.notification.NotificationListenerService',
                },
              },
            ],
          },
        ],
      });
    }

    return config;
  });

/**
 * Writes the no-op native service class. The android/ folder is managed by Expo
 * (gitignored), so the source must be generated at prebuild time.
 */
const addServiceSourceFile = (config) =>
  withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packagePath = ANDROID_PACKAGE.split('.').join(path.sep);
      const targetDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        packagePath,
      );
      const targetFile = path.join(targetDir, `${SERVICE_CLASS}.kt`);

      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(targetFile, SERVICE_SOURCE);
      console.log(
        `✅ Wrote no-op ${SERVICE_CLASS}.kt for notification access permission`,
      );

      return config;
    },
  ]);

const withNotificationListener = (config) => {
  config = addServiceToManifest(config);
  config = addServiceSourceFile(config);
  return config;
};

module.exports = withNotificationListener;

/**
 * Expo Config Plugin for Custom Notification Listener
 *
 * This plugin adds a custom Android NotificationListenerService to the app.
 * It's needed because react-native-notification-listener doesn't support React 19.
 *
 * The plugin:
 * 1. Adds NotificationListenerService to AndroidManifest.xml
 * 2. Creates necessary Java files for the native module
 * 3. Registers the module in the app
 */

const { withAndroidManifest, withMainApplication, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Add NotificationListenerService to AndroidManifest.xml
 */
function withNotificationListener(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const application = androidManifest.manifest.application[0];

    // Check if service already exists
    const serviceExists = application.service?.some(
      (service) => service.$?.['android:name'] === '.PennyNotificationListenerService'
    );

    if (!serviceExists) {
      // Add the PennyNotificationListenerService
      if (!application.service) {
        application.service = [];
      }

      application.service.push({
        $: {
          'android:name': '.PennyNotificationListenerService',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.service.notification.NotificationListenerService',
                },
              },
            ],
          },
        ],
      });

      console.log('✅ Added PennyNotificationListenerService to AndroidManifest.xml');
    }

    return config;
  });
}

/**
 * Add native module package to MainApplication.java
 */
function withNotificationListenerPackage(config) {
  return withMainApplication(config, async (config) => {
    const mainApplication = config.modResults;

    // Add import statement
    if (!mainApplication.contents.includes('import com.heywood8.monkeep.NotificationListenerPackage;')) {
      mainApplication.contents = mainApplication.contents.replace(
        /(import .*?;\n)/g,
        '$1import com.heywood8.monkeep.NotificationListenerPackage;\n'
      );
    }

    // Add package to getPackages()
    if (!mainApplication.contents.includes('new NotificationListenerPackage()')) {
      mainApplication.contents = mainApplication.contents.replace(
        /(packages\.add\(new ModuleRegistryAdapter.*?\);)/,
        '$1\n        packages.add(new NotificationListenerPackage());'
      );
    }

    console.log('✅ Added NotificationListenerPackage to MainApplication.java');

    return config;
  });
}

/**
 * Copy Java source files to android/app/src/main/java
 */
function withNotificationListenerJavaFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;

    const androidDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'heywood8', 'monkeep');

    // Ensure directory exists
    if (!fs.existsSync(androidDir)) {
      fs.mkdirSync(androidDir, { recursive: true });
    }

    // Create PennyNotificationListenerService.java
    const serviceCode = `package com.heywood8.monkeep;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.bridge.ReactContext;

public class PennyNotificationListenerService extends NotificationListenerService {
    private static final String TAG = "NotificationListener";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String packageName = sbn.getPackageName();
            String title = sbn.getNotification().extras.getString("android.title");
            String text = sbn.getNotification().extras.getString("android.text");

            // Get app name
            String appName = getApplicationLabel(packageName);

            // Send to React Native
            WritableMap params = Arguments.createMap();
            params.putString("packageName", packageName);
            params.putString("title", title != null ? title : "");
            params.putString("text", text != null ? text : "");
            params.putString("app", appName);
            params.putDouble("timestamp", System.currentTimeMillis());

            sendEvent("onNotificationReceived", params);
        } catch (Exception e) {
            android.util.Log.e(TAG, "Error processing notification", e);
        }
    }

    private String getApplicationLabel(String packageName) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo ai = pm.getApplicationInfo(packageName, 0);
            return pm.getApplicationLabel(ai).toString();
        } catch (Exception e) {
            return packageName;
        }
    }

    private void sendEvent(String eventName, WritableMap params) {
        try {
            ReactApplication reactApplication = (ReactApplication) getApplication();
            ReactInstanceManager reactInstanceManager = reactApplication.getReactNativeHost().getReactInstanceManager();
            ReactContext reactContext = reactInstanceManager.getCurrentReactContext();

            if (reactContext != null) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(eventName, params);
            }
        } catch (Exception e) {
            android.util.Log.e(TAG, "Error sending event to React Native", e);
        }
    }
}
`;

    // Create NotificationListenerModule.java
    const moduleCode = `package com.heywood8.monkeep;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import android.content.Intent;
import android.provider.Settings;

public class NotificationListenerModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "NotificationListenerModule";

    public NotificationListenerModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    @ReactMethod
    public void checkPermission(Promise promise) {
        try {
            String enabledListeners = Settings.Secure.getString(
                getReactApplicationContext().getContentResolver(),
                "enabled_notification_listeners"
            );

            boolean hasPermission = enabledListeners != null &&
                enabledListeners.contains(getReactApplicationContext().getPackageName());

            promise.resolve(hasPermission);
        } catch (Exception e) {
            promise.reject("ERROR", "Failed to check permission", e);
        }
    }

    @ReactMethod
    public void requestPermission(Promise promise) {
        try {
            Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", "Failed to open settings", e);
        }
    }
}
`;

    // Create NotificationListenerPackage.java
    const packageCode = `package com.heywood8.monkeep;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class NotificationListenerPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new NotificationListenerModule(reactContext));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
`;

    // Write files
    fs.writeFileSync(path.join(androidDir, 'PennyNotificationListenerService.java'), serviceCode);
    fs.writeFileSync(path.join(androidDir, 'NotificationListenerModule.java'), moduleCode);
    fs.writeFileSync(path.join(androidDir, 'NotificationListenerPackage.java'), packageCode);

    console.log('✅ Created Java source files for NotificationListener');

    return config;
    },
  ]);
}

module.exports = (config) => {
  config = withNotificationListener(config);
  config = withNotificationListenerPackage(config);
  config = withNotificationListenerJavaFiles(config);
  return config;
};

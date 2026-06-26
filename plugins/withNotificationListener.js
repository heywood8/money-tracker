const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin: wire up a NotificationListenerService plus a small native
 * module so the app can (1) ask the user for permission to read notifications
 * and (2) show the text of the most recent notifications in-app.
 *
 * On Android, reading other apps' notifications requires a service that extends
 * NotificationListenerService and is guarded by
 * BIND_NOTIFICATION_LISTENER_SERVICE. Only when such a service is declared does
 * the app appear in the system "Notification access" screen, where the user
 * grants the special-access permission.
 *
 * The service records only a tiny rolling window (the latest few notifications)
 * to private SharedPreferences so the "Notification access" settings subpanel
 * can display them. Nothing is uploaded or shared off the device. The companion
 * native module (PennyNotifications) exposes that window — and the current
 * permission state — to JavaScript.
 */

const ANDROID_PACKAGE = 'com.heywood8.monkeep';
const SERVICE_CLASS = 'PennyNotificationListenerService';
const MODULE_CLASS = 'PennyNotificationsModule';
const PACKAGE_CLASS = 'PennyNotificationsPackage';

const SERVICE_SOURCE = `package ${ANDROID_PACKAGE}

import android.app.Notification
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

/**
 * Records the text of the most recent notifications so Penny can show them in
 * the in-app "Notification access" subpanel.
 *
 * Only the latest [MAX_STORED] notifications are kept, persisted to private
 * SharedPreferences. Nothing ever leaves the device.
 */
class ${SERVICE_CLASS} : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val extras = sbn?.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        if (title.isBlank() && text.isBlank()) return
        record(applicationContext, title, text, sbn.packageName ?: "", sbn.postTime)
    }

    companion object {
        const val PREFS_NAME = "penny_notification_access"
        const val KEY_RECENT = "recent_notifications"
        const val MAX_STORED = 5

        @Synchronized
        fun record(
            context: Context,
            title: String,
            text: String,
            packageName: String,
            postTime: Long,
        ) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val current = try {
                JSONArray(prefs.getString(KEY_RECENT, "[]"))
            } catch (e: Exception) {
                JSONArray()
            }
            val entry = JSONObject().apply {
                put("title", title)
                put("text", text)
                put("packageName", packageName)
                put("postTime", postTime)
            }
            // Newest first, capped at MAX_STORED.
            val updated = JSONArray()
            updated.put(entry)
            var i = 0
            while (i < current.length() && updated.length() < MAX_STORED) {
                updated.put(current.get(i))
                i++
            }
            prefs.edit().putString(KEY_RECENT, updated.toString()).apply()
        }
    }
}
`;

const MODULE_SOURCE = `package ${ANDROID_PACKAGE}

import android.content.Context
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import org.json.JSONArray

/**
 * Bridges the recorded notifications — and the listener-permission state — to JS.
 */
class ${MODULE_CLASS}(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /** Whether the user has granted Penny notification-access in system settings. */
    @ReactMethod
    fun isNotificationAccessEnabled(promise: Promise) {
        try {
            val context = reactApplicationContext
            val flat = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners",
            ).orEmpty()
            val pkg = context.packageName
            val enabled = flat.split(":").any { it.startsWith("$pkg/") }
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /** The latest recorded notifications, newest first. */
    @ReactMethod
    fun getRecentNotifications(promise: Promise) {
        try {
            val context = reactApplicationContext
            val prefs = context.getSharedPreferences(
                ${SERVICE_CLASS}.PREFS_NAME,
                Context.MODE_PRIVATE,
            )
            val stored = prefs.getString(${SERVICE_CLASS}.KEY_RECENT, "[]")
            val array = JSONArray(stored)
            val result: WritableArray = Arguments.createArray()
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                val map = Arguments.createMap()
                map.putString("title", obj.optString("title"))
                map.putString("text", obj.optString("text"))
                map.putString("packageName", obj.optString("packageName"))
                map.putDouble("postTime", obj.optLong("postTime", 0L).toDouble())
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.resolve(Arguments.createArray())
        }
    }

    companion object {
        const val NAME = "PennyNotifications"
    }
}
`;

const PACKAGE_SOURCE = `package ${ANDROID_PACKAGE}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class ${PACKAGE_CLASS} : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): List<NativeModule> = listOf(${MODULE_CLASS}(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<*, *>> = emptyList()
}
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
 * Writes the native Kotlin sources (listener service, bridge module, and its
 * ReactPackage). The android/ folder is managed by Expo (gitignored), so the
 * sources must be generated at prebuild time.
 */
const addNativeSources = (config) =>
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

      fs.mkdirSync(targetDir, { recursive: true });

      const files = [
        [`${SERVICE_CLASS}.kt`, SERVICE_SOURCE],
        [`${MODULE_CLASS}.kt`, MODULE_SOURCE],
        [`${PACKAGE_CLASS}.kt`, PACKAGE_SOURCE],
      ];
      files.forEach(([filename, source]) => {
        fs.writeFileSync(path.join(targetDir, filename), source);
      });
      console.log(
        '✅ Wrote notification-access native sources (service, module, package)',
      );

      return config;
    },
  ]);

/**
 * Registers the ReactPackage in MainApplication so the native module is reachable
 * from JS. Idempotent: re-running prebuild won't duplicate the registration.
 */
const addPackageRegistration = (config) =>
  withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    if (contents.includes(`${PACKAGE_CLASS}()`)) {
      return config;
    }

    // Modern Expo/RN templates (SDK 50+, RN 0.73+) return
    // `PackageList(this).packages.apply { … }`, so we add inside the apply
    // block. Older templates assign to a `val packages` first; handle that too.
    const applyAnchor = 'PackageList(this).packages.apply {';
    const valAnchor = 'val packages = PackageList(this).packages';
    if (contents.includes(applyAnchor)) {
      contents = contents.replace(
        applyAnchor,
        `${applyAnchor}\n            add(${PACKAGE_CLASS}())`,
      );
    } else if (contents.includes(valAnchor)) {
      contents = contents.replace(
        valAnchor,
        `${valAnchor}\n            packages.add(${PACKAGE_CLASS}())`,
      );
    } else {
      throw new Error(
        'withNotificationListener: could not find the package list in MainApplication',
      );
    }

    config.modResults.contents = contents;
    return config;
  });

const withNotificationListener = (config) => {
  config = addServiceToManifest(config);
  config = addNativeSources(config);
  config = addPackageRegistration(config);
  return config;
};

module.exports = withNotificationListener;

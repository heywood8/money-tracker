# Notification Listener Setup Guide

This guide explains how to set up the Android notification listener for automatic transaction reading from bank notifications.

## ⚠️ Current Status: Pending Package Compatibility

**IMPORTANT**: The `react-native-notification-listener` package currently has a peer dependency on React 18, but this project uses React 19.1.0. This causes an installation conflict:

```
npm error peer react@"^18.0.0" from react-native-notification-listener@5.0.2
npm error Found: react@19.1.0
```

### Available Options:

1. **Wait for Package Update** (Recommended)
   - Wait for `react-native-notification-listener` to support React 19
   - Track issue: https://github.com/giocapardi/react-native-notification-listener/issues
   - All infrastructure code is ready and tested

2. **Force Install** (Not Recommended)
   ```bash
   npm install react-native-notification-listener --legacy-peer-deps
   ```
   - May cause runtime issues
   - Not guaranteed to work with React 19

3. **Downgrade React** (Not Recommended)
   - Would require downgrading entire project to React 18
   - May break other dependencies

4. **Custom Native Module** (Advanced)
   - Implement NotificationListenerService directly in native Android code
   - Requires Android development expertise
   - See "Custom Implementation" section below

**Current Implementation**: All JavaScript/TypeScript code is complete and tested. Only the native bridge package is pending.

## Overview

The notification listener feature allows the Penny app to read notifications from bank apps and automatically create expense operations. This requires:

1. Installing a native notification listener package (currently blocked by React 19 compatibility)
2. Configuring Android permissions
3. User granting notification access in system settings

## Prerequisites

- React Native / Expo development environment
- Android device or emulator (API level 18+)
- Custom development client (Expo Go does NOT support this feature)
- **React 18.x** (current project uses React 19.1.0 - compatibility issue)

## Installation Steps (When Package is Compatible)

### 1. Install Required Package

When the package supports React 19, install with:

```bash
npm install react-native-notification-listener
```

**Package**: [react-native-notification-listener](https://github.com/giocapardi/react-native-notification-listener)

**Current Version**: 5.0.2 (requires React 18)

### 2. Configure Expo Config

Update `app.config.js` to add the notification listener plugin and permissions:

```javascript
module.exports = {
  expo: {
    // ... existing config
    plugins: [
      'expo-sqlite',
      // ... other plugins
      [
        'react-native-notification-listener',
        {
          // Optional: Add configuration if needed
        }
      ],
    ],
    android: {
      // ... existing android config
      permissions: [
        // ... existing permissions
        'BIND_NOTIFICATION_LISTENER_SERVICE',
      ],
    },
  },
};
```

### 3. Update AndroidManifest.xml (if needed)

If the package doesn't automatically add the required service, manually add to `android/app/src/main/AndroidManifest.xml`:

```xml
<service
    android:name="com.giocapardi.rn.notificationlistener.RNNotificationListenerService"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService" />
    </intent-filter>
</service>
```

### 4. Build Custom Development Client

Since this feature requires native code, you MUST build a custom development client:

```bash
# Build Android development client
npx expo run:android

# Or use EAS Build for development
eas build --profile development --platform android
```

**Note**: This feature will NOT work with Expo Go.

### 5. Configure Bank Package Names

Update the monitored bank packages in `app/services/notification/NotificationListener.js`:

```javascript
const BANK_PACKAGES = {
  ARCA: 'am.arca.bank',        // Update with actual package name
  ACBA: 'am.acba.mobile',       // Update with actual package name
  INECO: 'am.ineco.bank',       // Update with actual package name
  // Add more banks as needed
};
```

To find the correct package name for a bank app:

1. Install the bank app on your device
2. Use `adb shell pm list packages | grep <bank-name>` to find the package
3. Or use apps like "Package Name Viewer" from Play Store

## User Setup

After installation, users must grant notification access:

### Requesting Permission in App

The app will prompt users to grant notification access. When requested:

1. App opens Android system settings
2. User navigates to: **Settings → Apps → Penny → Notifications → Notification access**
3. User toggles on notification access for Penny
4. User returns to the app

### Manual Permission Grant

Users can also manually grant permission:

1. Open Android **Settings**
2. Go to **Apps & notifications** → **Special app access** → **Notification access**
3. Find **Penny** in the list
4. Toggle **Allow notification access** to ON

## Usage in App

### Basic Usage

```javascript
import { useNotificationListener } from '../hooks/useNotificationListener';

function MyComponent() {
  const {
    isListening,
    hasPermission,
    lastNotification,
    startListening,
    stopListening,
    requestPermission,
  } = useNotificationListener({
    onNotificationReceived: (notification) => {
      console.log('Bank notification:', notification);
      // Process notification (parse, check bindings, create operation)
    },
    onPermissionChange: (granted) => {
      console.log('Permission status:', granted);
    },
    onError: (error) => {
      console.error('Listener error:', error);
    },
    autoStart: true, // Auto-start listening on mount
  });

  return (
    <View>
      {!hasPermission && (
        <Button onPress={requestPermission}>
          Grant Notification Access
        </Button>
      )}

      <Text>Status: {isListening ? 'Listening' : 'Not listening'}</Text>

      <Button onPress={startListening}>Start</Button>
      <Button onPress={stopListening}>Stop</Button>
    </View>
  );
}
```

### Permission Check Only

```javascript
import { useNotificationPermission } from '../hooks/useNotificationListener';

function PermissionStatus() {
  const { hasPermission, checking, requestPermission } = useNotificationPermission();

  if (checking) {
    return <Text>Checking permission...</Text>;
  }

  return (
    <View>
      <Text>Permission: {hasPermission ? 'Granted' : 'Not granted'}</Text>
      {!hasPermission && (
        <Button onPress={requestPermission}>Request Access</Button>
      )}
    </View>
  );
}
```

## Notification Format

Notifications received from banks should contain:

```javascript
{
  title: 'ARCA transactions',
  body: 'PRE-PURCHASE | 1,300.00 AMD | 4083***7027 | YANDEX.GO, AM | 11.12.2025 12:09 | BALANCE: 475,760.04 AMD',
  packageName: 'am.arca.bank',
  app: 'ARCA',
  timestamp: '2025-01-15T12:09:00.000Z',
  parsed: {
    type: 'expense',
    amount: '1300.00',
    currency: 'AMD',
    cardMask: '4083***7027',
    merchantName: 'YANDEX.GO, AM',
    date: '2025-12-11T12:09:00.000Z',
    balance: '475760.04',
    bankName: 'ARCA'
  }
}
```

## Testing

### Testing with Real Notifications

1. Grant notification access to the app
2. Start the notification listener
3. Open a bank app and perform a transaction
4. Check app logs for notification receipt
5. Verify notification parsing and operation creation

### Testing without Bank Apps

For development testing without real bank apps:

1. Use the test notification utility (to be created)
2. Manually trigger notification processing with sample data
3. Mock the notification listener in tests

### Debugging

Enable verbose logging:

```javascript
// In NotificationListener.js
const DEBUG = true; // Set to true for detailed logs

if (DEBUG) {
  console.log('[NotificationListener] Received:', notification);
}
```

Check logs:

```bash
# View Android logs
adb logcat | grep NotificationListener

# Or use React Native debugger
npx react-native log-android
```

## Troubleshooting

### Permission Not Granted

**Problem**: User grants permission but app still shows "not granted"

**Solution**:
1. Completely close and restart the app
2. Check that the correct package name is in AndroidManifest.xml
3. Verify notification listener service is running: `adb shell dumpsys notification`

### Notifications Not Received

**Problem**: Notifications are sent but app doesn't receive them

**Solution**:
1. Verify bank app package name is in monitored list
2. Check that notification listener service is active
3. Test with a simple notification from another app
4. Ensure app is not battery optimized (Settings → Battery → Battery optimization)

### Expo Go Compatibility

**Problem**: Feature doesn't work in Expo Go

**Solution**: This is expected. You MUST use a custom development client:
```bash
npx expo run:android
```

### Package Not Found

**Problem**: Cannot find module 'react-native-notification-listener'

**Solution**:
1. Ensure package is installed: `npm install react-native-notification-listener`
2. Rebuild the native code: `npx expo run:android`
3. Check that node_modules contains the package

## Security & Privacy

### Permission Explanation

The app requires notification access to:
- Read bank transaction notifications only
- Automatically create expense records
- Map transactions to accounts and categories

The app does NOT:
- Store notification content beyond transaction parsing
- Share notification data with third parties
- Access non-bank notifications
- Read message content from messaging apps

### Best Practices

1. **Transparent Permission Request**: Always explain WHY notification access is needed
2. **Filtered Monitoring**: Only monitor specific bank app packages
3. **Data Minimization**: Only extract and store transaction-relevant data
4. **User Control**: Allow users to enable/disable listener at any time
5. **Security**: Never log or store sensitive notification content

### Privacy Policy

Update your privacy policy to disclose:
- Collection of bank notification data
- Purpose: automatic transaction recording
- Data retention: only parsed transaction details
- No third-party sharing
- User control over feature

## Platform Limitations

### Android Only

This feature is **Android-only** because:
- iOS does not allow apps to read other apps' notifications
- iOS notification system is sandboxed per app

### API Level Requirements

- **Minimum**: Android API 18 (4.3 Jelly Bean)
- **Recommended**: Android API 21+ (5.0 Lollipop)
- **Target**: Current Android SDK

### Background Limitations

- Service may be killed by Android's battery optimization
- May not work reliably with "Doze mode" on some devices
- Consider using foreground service for critical scenarios

## Custom Native Implementation (Advanced)

If you need notification listening functionality now and can't wait for package compatibility, you can implement a custom native module. This requires Android development expertise.

### Architecture Overview

The notification listener requires three components:

1. **Native Android Service** - NotificationListenerService implementation
2. **React Native Bridge** - Native module to communicate with JavaScript
3. **JavaScript Interface** - Already implemented in `NotificationListener.js`

### Implementation Steps

#### 1. Create Android NotificationListenerService

Create `android/app/src/main/java/com/yourapp/NotificationListener.java`:

```java
package com.yourapp;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.content.Intent;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class NotificationListener extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String packageName = sbn.getPackageName();
        String title = sbn.getNotification().extras.getString("android.title");
        String text = sbn.getNotification().extras.getString("android.text");

        // Send to React Native
        WritableMap params = Arguments.createMap();
        params.putString("packageName", packageName);
        params.putString("title", title);
        params.putString("text", text);
        params.putString("app", getApplicationLabel(packageName));

        sendEvent("onNotificationReceived", params);
    }

    private void sendEvent(String eventName, WritableMap params) {
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, params);
    }
}
```

#### 2. Create React Native Module

Create `android/app/src/main/java/com/yourapp/NotificationListenerModule.java`:

```java
package com.yourapp;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import android.content.Intent;
import android.provider.Settings;

public class NotificationListenerModule extends ReactContextBaseJavaModule {
    public NotificationListenerModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "NotificationListener";
    }

    @ReactMethod
    public void checkPermission(Promise promise) {
        // Check if notification access is granted
        String enabledListeners = Settings.Secure.getString(
            getReactApplicationContext().getContentResolver(),
            "enabled_notification_listeners"
        );

        boolean hasPermission = enabledListeners != null &&
            enabledListeners.contains(getReactApplicationContext().getPackageName());

        promise.resolve(hasPermission);
    }

    @ReactMethod
    public void requestPermission() {
        // Open notification listener settings
        Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getReactApplicationContext().startActivity(intent);
    }
}
```

#### 3. Update AndroidManifest.xml

Add to `android/app/src/main/AndroidManifest.xml`:

```xml
<service
    android:name=".NotificationListener"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService" />
    </intent-filter>
</service>
```

#### 4. Register Native Module

Update `android/app/src/main/java/com/yourapp/MainApplication.java`:

```java
@Override
protected List<ReactPackage> getPackages() {
  return Arrays.asList(
      new MainReactPackage(),
      new NotificationListenerPackage() // Add this
  );
}
```

#### 5. Update JavaScript Code

The existing `NotificationListener.js` service is designed to work with any native bridge. Simply update the require statements to use your custom module instead:

```javascript
// In NotificationListener.js, replace:
// const RNNotificationListener = require('react-native-notification-listener');

// With your custom module:
import { NativeModules, NativeEventEmitter } from 'react-native';
const { NotificationListener: RNNotificationListener } = NativeModules;
const notificationEmitter = new NativeEventEmitter(RNNotificationListener);
```

### Testing Custom Implementation

1. Build the app: `npx expo run:android`
2. Grant notification access in Android Settings
3. Send a test notification from a bank app
4. Check logs for notification events

### Maintenance Considerations

- **Updates**: You'll need to maintain the native code yourself
- **Compatibility**: Test across Android versions (API 18+)
- **Battery**: Consider foreground service for reliability
- **Security**: Validate all notification data before processing

## Future Enhancements

Potential improvements:

1. **Custom notification parser per bank** - Support more bank formats
2. **Notification history** - Store and process missed notifications
3. **Smart scheduling** - Optimize listener battery usage
4. **Multi-bank support** - Handle notifications from multiple banks
5. **Fallback mechanism** - Manual notification entry if listener fails

## Additional Resources

- [React Native Notification Listener GitHub](https://github.com/giocapardi/react-native-notification-listener)
- [Android NotificationListenerService Docs](https://developer.android.com/reference/android/service/notification/NotificationListenerService)
- [Expo Custom Development Clients](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android Special Permissions](https://developer.android.com/guide/topics/permissions/overview#special)

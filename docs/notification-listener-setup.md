# Notification Listener Setup Guide

This guide explains how to set up the Android notification listener for automatic transaction reading from bank notifications.

## Overview

The notification listener feature allows the Penny app to read notifications from bank apps and automatically create expense operations. This requires:

1. Installing a native notification listener package
2. Configuring Android permissions
3. User granting notification access in system settings

## Prerequisites

- React Native / Expo development environment
- Android device or emulator (API level 18+)
- Custom development client (Expo Go does NOT support this feature)

## Installation Steps

### 1. Install Required Package

Install the notification listener package:

```bash
npm install react-native-notification-listener
```

**Package**: [react-native-notification-listener](https://github.com/giocapardi/react-native-notification-listener)

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

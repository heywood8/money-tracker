# Custom Notification Listener - Build Guide

This guide explains how to build and use the custom Android notification listener implementation for the Penny app.

## Overview

Because `react-native-notification-listener` doesn't support React 19, we've implemented a custom native Android module using an Expo config plugin. This provides the same functionality without requiring a third-party package.

**What's Included:**
- ✅ Custom Android NotificationListenerService
- ✅ React Native bridge module (NotificationListenerModule)
- ✅ Expo config plugin for automatic integration
- ✅ Full JavaScript API compatibility

## Prerequisites

- Node.js and npm installed
- Android development environment (Android Studio recommended)
- Expo CLI: `npm install -g expo-cli`
- EAS CLI (optional, for cloud builds): `npm install -g eas-cli`

## Build Methods

### Method 1: Local Build with Expo (Recommended for Development)

This method builds the app locally on your machine.

#### Step 1: Install Dependencies

```bash
cd /path/to/money-tracker
npm install
```

#### Step 2: Prebuild (Generate Native Files)

```bash
npx expo prebuild --platform android
```

This will:
- Generate the `android/` directory
- Run the `withNotificationListener.js` plugin
- Create Java source files for the notification listener
- Update AndroidManifest.xml with the service declaration
- Register the native module in MainApplication.java

#### Step 3: Build and Run

```bash
# Build and install on connected device/emulator
npx expo run:android

# Or build without running
cd android
./gradlew assembleDebug
```

The APK will be in: `android/app/build/outputs/apk/debug/app-debug.apk`

#### Step 4: Grant Permission

After installation:
1. Open Android **Settings**
2. Go to **Apps** → **Penny** (or PennyDev)
3. Go to **Notifications** → **Notification access**
4. Toggle **ON** for Penny

Or use the in-app permission request button.

### Method 2: EAS Build (Recommended for Production)

Build in the cloud using Expo Application Services.

#### Step 1: Configure EAS (if not already done)

```bash
eas build:configure
```

#### Step 2: Build

```bash
# Development build (for testing)
eas build --profile development --platform android

# Production build
eas build --profile production --platform android
```

#### Step 3: Install

Download the APK from the EAS website and install on your device.

#### Step 4: Grant Permission

Same as Method 1, Step 4.

### Method 3: Android Studio

For advanced debugging and development.

#### Step 1: Prebuild

```bash
npx expo prebuild --platform android
```

#### Step 2: Open in Android Studio

```bash
# Open the android directory in Android Studio
open -a "Android Studio" android/
# Or on Windows/Linux, use File → Open → select android directory
```

#### Step 3: Build and Run

Use Android Studio's build and run buttons, or:
- Build: **Build** → **Make Project** (Ctrl/Cmd + F9)
- Run: **Run** → **Run 'app'** (Shift + F10)

## Verification

### Check Native Module is Available

Add this to any component:

```javascript
import { NativeModules } from 'react-native';

console.log('NotificationListenerModule:', NativeModules.NotificationListenerModule);
// Should log: NotificationListenerModule: {checkPermission: [Function], requestPermission: [Function]}
```

### Test Permission Check

```javascript
import { notificationListener } from './app/services/notification/NotificationListener';

async function testPermission() {
  const hasPermission = await notificationListener.checkPermission();
  console.log('Has permission:', hasPermission);
}
```

### Test Notification Listening

```javascript
import { useNotificationListener } from './app/hooks/useNotificationListener';

function TestComponent() {
  const {
    isListening,
    hasPermission,
    lastNotification,
    startListening,
    requestPermission,
  } = useNotificationListener({
    onNotificationReceived: (notification) => {
      console.log('Received notification:', notification);
    },
  });

  return (
    <View>
      <Text>Has Permission: {hasPermission ? 'Yes' : 'No'}</Text>
      <Text>Is Listening: {isListening ? 'Yes' : 'No'}</Text>

      {!hasPermission && (
        <Button onPress={requestPermission}>
          Grant Permission
        </Button>
      )}

      {hasPermission && !isListening && (
        <Button onPress={startListening}>
          Start Listening
        </Button>
      )}

      {lastNotification && (
        <Text>Last: {lastNotification.parsed.merchantName}</Text>
      )}
    </View>
  );
}
```

## File Structure

After building, you'll have:

```
android/
├── app/
│   └── src/
│       └── main/
│           ├── AndroidManifest.xml (service added)
│           └── java/
│               └── com/
│                   └── heywood8/
│                       └── monkeep/
│                           ├── NotificationListenerService.java (NEW)
│                           ├── NotificationListenerModule.java (NEW)
│                           ├── NotificationListenerPackage.java (NEW)
│                           └── MainApplication.java (updated)
```

## Implementation Details

### NotificationListenerService.java

The Android service that listens to system notifications:
- Extends `NotificationListenerService`
- Filters notifications by package name
- Extracts title, text, app name
- Sends to React Native via event emitter

### NotificationListenerModule.java

The bridge between Java and JavaScript:
- `checkPermission()` - Checks if notification access is granted
- `requestPermission()` - Opens system settings for granting access

### Expo Config Plugin

The plugin (`plugins/withNotificationListener.js`):
- Automatically creates Java files during prebuild
- Updates AndroidManifest.xml
- Registers the module in MainApplication.java

## Troubleshooting

### Native Module Not Found

**Error**: `NotificationListenerModule is undefined`

**Solutions**:
1. Ensure you've run `npx expo prebuild --platform android`
2. Rebuild the app: `npx expo run:android`
3. Check that the plugin is in `app.config.js`
4. Clean build: `cd android && ./gradlew clean && cd ..`

### Permission Always Returns False

**Problem**: `checkPermission()` always returns `false`

**Solutions**:
1. Grant permission manually in Android Settings
2. Check that the service is declared in AndroidManifest.xml
3. Restart the app after granting permission
4. Check logs: `adb logcat | grep NotificationListener`

### Notifications Not Received

**Problem**: Service doesn't receive notifications

**Solutions**:
1. Verify permission is granted: `adb shell dumpsys notification`
2. Ensure bank app package name is in `BANK_PACKAGES`
3. Send a test notification from the bank app
4. Check that the service is running: `adb shell dumpsys activity services`
5. Battery optimization may kill the service - disable for the app

### Build Fails

**Error**: Build fails with various errors

**Solutions**:
1. Clean build: `cd android && ./gradlew clean`
2. Delete `android/` and rebuild: `rm -rf android && npx expo prebuild`
3. Update Expo: `npm install expo@latest`
4. Check Java version: Should be Java 11 or 17
5. Sync Gradle: In Android Studio, **File** → **Sync Project with Gradle Files**

## Development Workflow

### After Code Changes

**JavaScript changes only:**
```bash
# Hot reload should work - just save the file
# If not, reload: press 'r' in Metro terminal
```

**Native changes (Java/plugin):**
```bash
# Regenerate native files and rebuild
npx expo prebuild --platform android --clean
npx expo run:android
```

### Debugging

**View Android logs:**
```bash
# All logs
adb logcat

# Filter for your app
adb logcat | grep "com.heywood8.monkeep"

# Filter for NotificationListener
adb logcat | grep "NotificationListener"
```

**React Native debugger:**
- Shake device or press Cmd/Ctrl + M
- Select "Debug"
- Open Chrome DevTools

**Android Studio debugger:**
- Open `android/` in Android Studio
- Set breakpoints in Java files
- Run → Debug 'app'

## Updating Bank Package Names

To monitor different bank apps, update in `NotificationListener.js`:

```javascript
const BANK_PACKAGES = {
  ARCA: 'am.arca.bank',
  ACBA: 'am.acba.mobile',
  INECO: 'am.ineco.bank',
  NEWBANK: 'am.newbank.app', // Add new bank
};
```

Find package name:
```bash
# List all installed packages
adb shell pm list packages

# Search for specific app
adb shell pm list packages | grep bank
```

## Performance Considerations

**Battery Usage:**
- The NotificationListenerService runs in the background
- Android may kill it to save battery
- Consider requesting battery optimization exemption

**Memory:**
- Service is lightweight (~2-5MB)
- Only active when notifications are posted

**Testing Battery Impact:**
```bash
# Check battery stats
adb shell dumpsys batterystats
```

## Security

**Data Handling:**
- Service only reads notification title and text
- No notification content is stored permanently
- Only bank app notifications are processed
- All sensitive data (card numbers) is masked in notifications

**Permissions:**
- Notification access is a sensitive permission
- User must manually grant in system settings
- Can be revoked at any time

## Production Checklist

Before releasing:

- [ ] Test on multiple Android versions (API 21+)
- [ ] Test on different devices (Samsung, Pixel, etc.)
- [ ] Verify battery impact
- [ ] Test permission flow
- [ ] Test with actual bank notifications
- [ ] Add error tracking (Sentry)
- [ ] Document for users in app
- [ ] Add privacy policy disclosure
- [ ] Test what happens when service is killed
- [ ] Test notifications while app is in background/closed

## Additional Resources

- [Android NotificationListenerService Docs](https://developer.android.com/reference/android/service/notification/NotificationListenerService)
- [Expo Config Plugins](https://docs.expo.dev/guides/config-plugins/)
- [Expo Prebuild](https://docs.expo.dev/workflow/prebuild/)
- [React Native Native Modules](https://reactnative.dev/docs/native-modules-android)

## Getting Help

If you encounter issues:

1. Check this guide's Troubleshooting section
2. Check logs: `adb logcat`
3. Review plugin code: `plugins/withNotificationListener.js`
4. Check Android manifest: `android/app/src/main/AndroidManifest.xml`
5. Verify native module: `NativeModules.NotificationListenerModule`

## Next Steps

After building successfully:

1. Grant notification permission
2. Test with bank app notifications
3. Proceed with Phase 6 (Notification Processing Flow)
4. Implement card and merchant binding prompts
5. Test end-to-end transaction creation

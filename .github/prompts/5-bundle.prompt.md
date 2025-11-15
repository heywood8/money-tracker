# Plan: Bundle React Native App into Android APK

This guide outlines the steps to bundle your React Native app into an Android APK file for testing or distribution.

## Prerequisites
- Node.js and npm installed
- Android Studio installed (with SDK and emulator/device setup)
- Java Development Kit (JDK) 11+
- React Native CLI installed globally (`npm install -g react-native-cli`)
- All dependencies installed (`npm install` in project root)

## Steps

1. **Prepare the Android Project**
   - Ensure the `android/` directory exists. If not, generate it with:
     ```sh
     npx react-native eject
     ```
   - Open the project in Android Studio and let it sync/resolve dependencies.

2. **Configure App Details**
   - Update `android/app/build.gradle` with correct `applicationId`, version, and signing config (for release builds).
   - Set app name, icon, and permissions as needed.

3. **Build the APK**
   - For a debug APK (no signing):
     ```sh
     cd android
     ./gradlew assembleDebug
     ```
   - For a release APK (signed):
     - Set up a signing key in `android/app` and configure `build.gradle`.
     - Build with:
       ```sh
       ./gradlew assembleRelease
       ```

4. **Locate the APK**
   - The APK will be in `android/app/build/outputs/apk/debug/` or `release/`.

5. **Test the APK**
   - Install on a device/emulator:
     ```sh
     adb install android/app/build/outputs/apk/debug/app-debug.apk
     ```

## Notes
- For Expo projects, use `eas build -p android` or `expo build:android` instead.
- For Play Store distribution, follow Google Play guidelines and use a signed release APK/AAB.

---
_Replace placeholders and adjust steps as needed for your project structure._

# EAS Build Credentials Setup

This guide explains how to configure Android signing credentials for EAS builds, particularly for the preview environment.

## Problem

When running `eas build --platform android --profile preview --non-interactive`, you may encounter:

```
Generating a new Keystore is not supported in --non-interactive mode
Error: build command failed.
```

This happens because EAS needs Android signing credentials (a keystore) to build the app, but can't create them in non-interactive mode.

## Solution

### Option 1: Set Up Credentials Interactively (Recommended)

Run the build command **once** without the `--non-interactive` flag:

```bash
npx eas-cli build --platform android --profile preview
```

This will:
1. Prompt you to generate a new Android keystore
2. Store the keystore securely on Expo's servers
3. Allow future builds (including CI/CD builds) to use these credentials automatically

After this initial setup, non-interactive builds will work.

### Option 2: Use Local Credentials

If you want to manage credentials locally:

1. Generate a keystore locally:
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore penny-preview.keystore \
  -alias penny-preview -keyalg RSA -keysize 2048 -validity 10000
```

2. Update `eas.json` to use local credentials:
```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "credentialsSource": "local"
      }
    }
  }
}
```

3. Create `credentials.json`:
```json
{
  "android": {
    "keystore": {
      "keystorePath": "./penny-preview.keystore",
      "keystorePassword": "YOUR_KEYSTORE_PASSWORD",
      "keyAlias": "penny-preview",
      "keyPassword": "YOUR_KEY_PASSWORD"
    }
  }
}
```

4. **Important**: Add `credentials.json` and `*.keystore` to `.gitignore`!

### Option 3: Configure Credentials via Environment Variables

For CI/CD environments, you can use environment variables:

1. Store your keystore as base64:
```bash
base64 penny-preview.keystore > keystore.base64.txt
```

2. Set environment variables in your CI/CD:
   - `ANDROID_KEYSTORE_BASE64`: Base64-encoded keystore
   - `ANDROID_KEYSTORE_PASSWORD`: Keystore password
   - `ANDROID_KEY_ALIAS`: Key alias
   - `ANDROID_KEY_PASSWORD`: Key password

3. Update your CI/CD script to decode and use the keystore before building.

## Current Configuration

The preview build profile is configured in `eas.json` to:
- Build an APK (easier for internal distribution)
- Use internal distribution
- Support both development (`com.heywood8.monkeep.dev`) and production (`com.heywood8.monkeep`) packages

## Build Profiles

- **development**: Local development builds with dev client
- **preview**: Internal testing builds (APK format)
- **production**: Production builds for Google Play (AAB format)

## Next Steps

1. Choose one of the options above
2. Run the build command to verify credentials work
3. Document which option you chose for your team

## References

- [EAS Build Configuration](https://docs.expo.dev/build/eas-json/)
- [Android App Signing](https://docs.expo.dev/app-signing/app-credentials/)
- [Local Credentials](https://docs.expo.dev/app-signing/local-credentials/)

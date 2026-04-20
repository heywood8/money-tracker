---
name: r8-expo-config
description: "Configures R8 minification, ProGuard rules, and Gradle JVM memory for Expo managed workflow Android builds. Use when the user asks about R8, ProGuard, build minification, shrinking, obfuscation, Gradle memory, EAS build hangs, or OOM errors during Android builds."
context: fork
user-invocable: true
---

# Skill: R8 & Expo Config Plugin

This project uses Expo managed workflow — the `android/` folder is **not committed**. All Gradle and R8 configuration is applied via a config plugin that runs during `expo prebuild`.

## Architecture

```
proguard-rules.pro          ← source of truth for ProGuard rules
plugins/withR8Config.js     ← Expo config plugin (applies rules + Gradle props)
app.config.js               ← registers the plugin
eas.json                    ← build profiles (production uses app-bundle + R8)
```

Never edit `android/gradle.properties` or `android/app/proguard-rules.pro` directly — they are regenerated on every prebuild.

## Config Plugin (`plugins/withR8Config.js`)

Uses `withGradleProperties` to inject into `gradle.properties` and `withDangerousMod` to copy `proguard-rules.pro` into `android/app/`.

### Gradle properties set by the plugin

| Property | Value | Purpose |
|---|---|---|
| `android.enableMinifyInReleaseBuilds` | `true` | Enables R8 |
| `android.enableShrinkResourcesInReleaseBuilds` | `true` | Removes unused resources |
| `android.enablePngCrunchInReleaseBuilds` | `true` | Optimizes PNGs |
| `org.gradle.jvmargs` | `-Xmx4096m -XX:MaxMetaspaceSize=1024m` | Memory (tuned for GitHub Actions 7GB runners) |
| `org.gradle.parallel` | `true` | Parallel module compilation |
| `org.gradle.caching` | `true` | Build cache |
| `org.gradle.daemon` | `true` | Gradle daemon |

### Memory budget rule

GitHub Actions runners have 7GB RAM. Keep JVM heap + Metaspace ≤ 5GB total to leave headroom for OS, Node.js, and EAS CLI. The current setting (4GB heap + 1GB Metaspace = 5GB) is the safe maximum. If builds hang, reduce `Xmx` — do NOT increase it.

### Preview builds (arm64-v8a only)

When `APP_VARIANT=preview`, the plugin adds:
```
reactNativeArchitectures=arm64-v8a
```
This halves build time for preview APKs by skipping x86_64.

## ProGuard Rules (`proguard-rules.pro`)

Keep rules are required for:
- React Native core (`com.facebook.react.**`)
- Hermes engine (`com.facebook.hermes.**`, `com.facebook.jni.**`)
- Expo modules (`expo.modules.**`)
- expo-sqlite (`org.sqlite.**`)
- Kotlin runtime (`kotlin.**`, `kotlinx.**`)
- BuildConfig (`com.heywood8.monkeep.BuildConfig`)

Always use `-dontwarn` alongside `-keep` for Expo Kotlin canary classes to suppress false-positive warnings.

## Modifying R8 Configuration

### To change Gradle JVM memory

Edit `plugins/withR8Config.js`, property `org.gradle.jvmargs`. Keep total ≤ 5GB for CI.

### To add a new ProGuard keep rule

Add to `proguard-rules.pro` in the project root. It is automatically copied to `android/app/` during prebuild.

### To add a new Gradle property

Add it to the `properties` object in `plugins/withR8Config.js`:
```javascript
const properties = {
  'your.new.property': 'value',
  // ...existing props
};
```

## Verification Commands

```bash
# Regenerate android/ and verify plugin ran
npx expo prebuild --clean
cat android/gradle.properties | grep -E "(Minify|Shrink|jvmargs)"
cat android/app/proguard-rules.pro | head -5

# Local release build (requires Android SDK)
cd android && ./gradlew :app:bundleRelease
ls -lh app/build/outputs/mapping/release/mapping.txt
```

## Troubleshooting

**Build hangs on GitHub Actions** → Reduce `Xmx` in `org.gradle.jvmargs`. Check for OOM in logs.

**ProGuard rules not applied** → Confirm `./plugins/withR8Config.js` is listed in `plugins` array in `app.config.js`.

**Missing class warnings** → Add `-dontwarn your.package.**` to `proguard-rules.pro`.

**Crash deobfuscation** → Download `mapping.txt` from EAS dashboard, then:
```bash
$ANDROID_HOME/cmdline-tools/latest/bin/retrace mapping.txt stacktrace.txt
```

## References

- Full setup docs: `docs/R8_CICD_SETUP.md`
- [R8 shrink code](https://developer.android.com/studio/build/shrink-code)
- [Expo Config Plugins](https://docs.expo.dev/config-plugins/introduction/)
- [EAS Build profiles](https://docs.expo.dev/build/eas-json/)

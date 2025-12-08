# Penny App - ProGuard Rules
# These rules are applied during EAS Build for production releases
# Place this file in your project root and it will be copied to android/app/proguard-rules.pro

# React Native Reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Hermes Engine
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# React Native Core
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}

# JavaScriptCore (JSC)
-keep class org.webkit.** { *; }

# Expo Modules
-keep class expo.modules.** { *; }
-keep class com.facebook.react.** { *; }

# SQLite / expo-sqlite
-keep class org.sqlite.** { *; }
-keep class org.sqlite.database.** { *; }

# Sentry
-keepattributes LineNumberTable,SourceFile
-dontwarn org.slf4j.**
-dontwarn javax.**

# Keep BuildConfig
-keep class com.heywood8.monkeep.BuildConfig { *; }
-keep class com.heywood8.monkeep.dev.BuildConfig { *; }

# Preserve source file names for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Penny App - ProGuard Rules
# These rules are applied during EAS Build for production releases
# Place this file in your project root and it will be copied to android/app/proguard-rules.pro

# Allow R8 to continue despite missing class references (canary SDK compatibility)
-ignorewarnings

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

# Expo Modules - keep all classes and members
-keep class expo.modules.** { *; }
-keep interface expo.modules.** { *; }
-keepclassmembers class expo.modules.** { *; }

# Expo Kotlin Runtime - required for expo-file-system and other Kotlin modules
-keep class expo.modules.kotlin.** { *; }
-keep interface expo.modules.kotlin.** { *; }
-keepclassmembers class expo.modules.kotlin.** { *; }
-dontwarn expo.modules.kotlin.**
-dontwarn expo.modules.kotlin.runtime.**
-dontwarn expo.modules.kotlin.services.**

# Ignore missing class warnings for expo modules (canary version compatibility)
-dontwarn expo.modules.filesystem.**

# React Native
-keep class com.facebook.react.** { *; }

# SQLite / expo-sqlite
-keep class org.sqlite.** { *; }
-keep class org.sqlite.database.** { *; }

# Keep BuildConfig
-keep class com.heywood8.monkeep.BuildConfig { *; }
-keep class com.heywood8.monkeep.dev.BuildConfig { *; }

# Kotlin support - required for Expo Kotlin modules
-keep class kotlin.** { *; }
-keep class kotlin.Metadata { *; }
-keepclassmembers class kotlin.Metadata {
    public <methods>;
}
-keepclassmembers class * {
    @kotlin.Metadata *;
}
-dontwarn kotlin.**
-dontwarn kotlinx.**

# Preserve source file names for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Capacitor / Hobbeast R8 keep rules.
# Capacitor registers plugins and bridges JS<->native by class name and via
# annotations, so R8 must not rename/strip them.

# Readable crash reports + keep annotation/signature metadata.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Core Capacitor + Cordova bridge
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-keep class com.getcapacitor.community.** { *; }

# App package (MainActivity, any custom plugins)
-keep class com.expericentre.hobbeast.** { *; }

# Capacitor plugin annotations and the reflective callback surface
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}

# Firebase Cloud Messaging (push) — reflectively referenced
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# JavascriptInterface members exposed to the WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# AndroidX WebKit
-dontwarn androidx.webkit.**

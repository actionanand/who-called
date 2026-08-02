# Android R8 and deobfuscation files

## Play Console warning

Google Play may report that an App Bundle has no associated deobfuscation file. This is a warning,
not an upload failure. Without the mapping created for an obfuscated build, Play cannot reconstruct
readable Java or Kotlin crash and ANR stack traces.

## Who Called release configuration

The Android project is generated during CI. After Capacitor synchronization,
`scripts/patch-android.mjs` changes the generated release build to enable R8 and resource shrinking:

```groovy
release {
    minifyEnabled true
    shrinkResources true
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
}
```

R8 can remove unreachable native code, optimize bytecode, and shorten class and member names.
Resource shrinking removes Android resources that are no longer reachable after code shrinking.
Obfuscation is not encryption and is not treated as a security boundary.

Who Called exposes native methods to Angular through WebView JavaScript interfaces. Those methods
are invoked by name at runtime, so the patch adds this rule to the generated
`android/app/proguard-rules.pro`:

```proguard
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
```

This keeps the application’s existing native bridge working while allowing unrelated native code
to be optimized.

## Mapping-file generation and retention

Every optimized release produces a mapping unique to that exact build:

```text
android/app/build/outputs/mapping/release/mapping.txt
```

The Android workflow requires this file to exist and copies it to:

```text
releases/who-called-<version>-mapping.txt
```

The mapping is committed with `main-android` release artifacts, uploaded as a GitHub Actions
artifact, and attached to tagged GitHub Releases. The workflow fails rather than publish an
optimized APK/AAB without preserving its mapping.

The App Bundle also carries R8 metadata. Google Play normally associates the embedded mapping when
the AAB is uploaded. If Play still shows the warning, open the exact version in **Test and release →
App bundle explorer** and upload that version’s matching `-mapping.txt` as its ReTrace mapping.

Never use a mapping generated for another `versionCode`. Keep each published version’s mapping for
as long as that version remains supported. Mapping files contain original native symbol names, but
they do not contain signing keys, passwords, or contact data.

## Local verification

After generating and patching the Android project:

```bash
cd android
./gradlew assembleRelease bundleRelease
test -s app/build/outputs/mapping/release/mapping.txt
```

You can inspect the AAB as a ZIP archive and confirm that its `BUNDLE-METADATA` directory contains
the R8/ProGuard mapping metadata.

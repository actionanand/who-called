# Who Called? Android build guide

Who Called? uses Capacitor and GitHub Actions to package the Angular application as Android APK and AAB artifacts. The `android/` directory is generated locally or in CI and is not committed.

## Build files

| File                                  | Purpose                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `capacitor.config.ts`                 | App ID, name, Angular output directory, splash and notification defaults                                                        |
| `.github/workflows/android-build.yml` | Lints, tests, builds, signs, verifies and uploads Android artifacts                                                             |
| `android-version.json`                | Android `versionCode` and `versionName`                                                                                         |
| `scripts/bump-android-version.js`     | Increments Android versions                                                                                                     |
| `scripts/patch-android.mjs`           | Applies splash, share-target, biometric unlock, optional permission, notification-icon and light/dark system-bar native changes |
| `scripts/generate-keystore.mjs`       | Creates a PKCS12 release keystore                                                                                               |
| `scripts/detect-keystore-format.mjs`  | Reports a keystore's internal format                                                                                            |
| `public/who-called.png`               | Canonical launcher, splash and Play Store icon source                                                                           |

## Local workflow

From WSL2:

```bash
npm run build
npm run android:add
npm run android:sync
```

`android:sync` rebuilds Angular, synchronizes Capacitor and reapplies the idempotent native patch. Open the generated project from an environment with Android Studio:

```bash
npm run android:open
```

## Biometric application unlock

Biometric unlock is available only in the generated Android application and requires an
application PIN plus an enrolled strong biometric. The native patch adds AndroidX Biometric and
stores the PIN only as AES-GCM ciphertext protected by a non-exportable, authentication-bound
Android Keystore key. A biometric enrollment change invalidates that key, after which the user must
unlock with the PIN and enable biometrics again.

Run `npm run android:sync` after changing the native patch. No separate JavaScript package is
required.

If `android/` does not exist, `npx cap sync android` reporting a missing platform is expected; run `npm run android:add` first.

## Versioning

```bash
npm run android:version
npm run android:version:patch
npm run android:version:minor
npm run android:version:major
```

The plain command increments only `versionCode`. The other commands also update `versionName`. Google Play requires `versionCode` to increase for every uploaded release.

## CI triggers and artifacts

The workflow runs manually, on `main-android`, and on `v*` tags.

- Every run builds a release APK and AAB.
- When all signing secrets are available, CI creates signed `who-called-<version>.apk` and
  `who-called-<version>.aab` files.
- When signing secrets are missing or signing fails, CI publishes clearly named
  `who-called-<version>-unsigned.apk` and `who-called-<version>-unsigned.aab` files instead.
- Artifacts and `playstore-icon.png` are uploaded for 30 days, and a missing APK or AAB fails the
  workflow instead of producing an empty successful run.
- Builds on `main-android` also commit the generated files to the branch under `releases/`.
- Tag builds also create a GitHub Release.

The CI environment uses minimum SDK 24, target SDK 35, Java 21 and Node 24.16.

## Signing secrets

Add these under **Repository Settings → Secrets and variables → Actions**:

| Secret              | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `KEYSTORE_BASE64`   | Base64 text containing the complete keystore               |
| `KEYSTORE_PASSWORD` | Password used to open it                                   |
| `KEY_ALIAS`         | Signing-key alias; the included generator uses `whocalled` |
| `KEY_PASSWORD`      | Private-key password; for PKCS12 use the keystore password |

Generate the keystore once on a trusted WSL/Linux machine:

```bash
npm run generate-keystore
test -s release-keystore.jks && base64 -w 0 release-keystore.jks > keystore.b64.txt
```

Verify its type:

```bash
npm run keystore:type
```

Never commit the keystore, its Base64 representation or any password. Keep an offline backup; losing the release key can prevent future Play Store updates.

## Optional device call history

Call history is disabled by default:

```text
ENABLE_DEVICE_CALL_LOG=false
```

When disabled, `scripts/patch-android.mjs` removes `READ_CALL_LOG` from the manifest and the app must use permission-free recent activity. Restricted or Play-distributed builds should keep it disabled. For a separately distributed build where the feature is justified:

```bash
ENABLE_DEVICE_CALL_LOG=true npm run android:sync
```

The app must request the permission only after the user enables the corresponding setting and must remain useful when it is denied.

## Security notes

- `public/who-called.png` is the canonical brand input and has a transparent background.
- Android notification small icons are monochrome white artwork on transparency. Android supplies the system tint for light and dark surfaces.
- The normal call flow uses `ACTION_DIAL`, so direct-call permission is not required.
- The normal SMS flow opens the composer, so SMS-send permission is not required.
- The share target accepts user-selected plain text; it does not read the SMS inbox.
- Encrypted backup/restore should use Android's document picker instead of broad storage permission.

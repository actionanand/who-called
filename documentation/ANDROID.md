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

Enable it from **Settings → Security → Biometric login**. After it is enabled, the application lock
screen keeps both **Unlock with fingerprint or biometrics** and the application PIN fallback.

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
- Artifacts, the exact R8 `mapping.txt`, and `playstore-icon.png` are uploaded for 30 days. A
  missing APK, AAB, or mapping file fails the workflow instead of producing an incomplete release.
- Builds on `main-android` also commit the generated files to the branch under `releases/`.
- Tag builds also create a GitHub Release.

The CI environment uses minimum SDK 24, target SDK 36, Java 21 and Node 24.16.

Release builds use R8 code optimization and resource shrinking. See
[R8-DEOBFUSCATION.md](R8-DEOBFUSCATION.md) for mapping-file handling and Play Console guidance.

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

## Device call history

Phone call history is enabled in the Android workflow because it is a primary Who Called? feature.
The generated application declares `READ_CALL_LOG`, requests it at runtime, and reads at most the
100 most recent entries only after the user grants access. Numbers are matched locally against
Who Called? contacts and tagged numbers.

To produce a permission-free build, disable the feature while generating the native shell:

```bash
ENABLE_DEVICE_CALL_LOG=false npm run android:sync
```

`READ_CALL_LOG` is a restricted Google Play permission. A Play-distributed build must satisfy the
current Call Log permission policy or be distributed through an appropriate non-Play channel. The
application remains usable when permission is denied.

## Birthday and anniversary reminders

Keepsake reminders use `@capacitor/local-notifications` directly, following the same native-only
pattern as the reference CardNest application:

1. After the first unlocked render, an in-app explanation asks the user whether to enable local
   notifications. Android's system permission prompt opens only after the user chooses **Allow
   notifications**. That choice is recorded before Android takes over the activity, so an OEM WebView
   recreation cannot trap the user on the same explanation after reopening. Notification permission
   can still be enabled later from Settings. Permission and notification-channel setup run through
   the app's native `WhoCalledNative` bridge rather than Capacitor's permission callback. This uses
   the same activity-owned permission flow as device call history and avoids plugin lifecycle failure
   during the permission transition. Capacitor remains responsible only for storing and delivering
   scheduled alarms.
2. Each contact has stable notification IDs: one birthday reminder and up to three anniversary
   reminders. Editing a contact cancels and recreates that contact's schedules, preventing
   duplicates.
3. Following CardNest's stable native path, the app creates ordinary timestamp-based Android alarms
   at 6:00 AM instead of recurring-calendar payloads. The next two yearly occurrences are kept for
   every enabled event. Reminder changes and backup restores explicitly rebuild that two-occurrence
   horizon, without notification-plugin work during PIN/biometric login.
4. Trashing or permanently deleting a contact cancels its reminders. Restoring an encrypted backup
   clears every pending Who Called keepsake notification from the previous data set, then calculates
   and schedules all enabled birthday and anniversary reminders from the restored contacts. This
   also applies when the backup is moved to a different Android device.
5. The **Alert Directory** lists every contact with an active reminder and supports disabling one
   reminder or all of a contact's reminders without opening the editor.
6. If permission is newly granted after 6:00 AM on the event day, the first concrete alarm is
   scheduled one minute later instead of skipping the event until the following year. Schedules use
   `allowWhileIdle` so Android can deliver them during Doze.
7. Android restores Capacitor local-notification schedules after a reboot. The app does not request
   exact-alarm permission, so battery optimization may deliver a 6:00 AM reminder approximately.

The reminder channel is private on the lock screen and uses the existing monochrome
`ic_stat_who_called` notification icon. Web builds can store reminder choices for backup and later
Android use, but do not display browser notifications.

## Android storage clearing and backup

Who Called uses its own password-protected `.contactvault` export for device migration. The generated
Android manifest therefore disables Android Auto Backup and excludes the WebView database, files and
preferences from both cloud backup and device-to-device transfer rules. This prevents Android from
silently restoring private contacts or the PIN verifier after the user clears the app's storage.

When the encrypted settings record is absent, startup also removes any orphaned biometric-wrapped PIN
from Android SharedPreferences and the Android Keystore. **Clear storage/data** in Android Settings
therefore resets contacts, messages, tags, PIN and biometric unlock. **Clear cache** does not erase
user data and is intentionally different.

## Security notes

- `public/who-called.png` is the canonical brand input and has a transparent background.
- Android notification small icons are monochrome white artwork on transparency. Android supplies the system tint for light and dark surfaces.
- The native theme bridge updates the status bar, navigation bar, window, decor view and WebView
  backgrounds together, then reapplies the selected appearance when the window regains focus.
- The normal call flow uses `ACTION_DIAL`, so direct-call permission is not required.
- The normal SMS flow opens the composer, so SMS-send permission is not required.
- The share target accepts user-selected plain text; it does not read the SMS inbox.
- Encrypted backup/restore should use Android's document picker instead of broad storage permission.

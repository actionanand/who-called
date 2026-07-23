# Android splash, system bars and notification special cases

These Android surfaces appear before or outside Angular's WebView, so CSS alone cannot control them. `scripts/patch-android.mjs` applies the native parts after every Capacitor sync.

## Biometric prompt

The biometric prompt is an Android system surface and cannot be styled from Angular. Application
Lock exposes the control only when the native bridge reports an enrolled strong biometric. The
native bridge wraps the application PIN with an authentication-bound Android Keystore key and
returns it to Angular only after a successful prompt. Cancellation leaves the application locked;
adding or removing enrolled biometrics invalidates the key.

## Branded cold-start splash

Android 12+ draws a system launch window before Angular, JavaScript, Capacitor plugins or the WebView exist. Who Called? applies the brand in three layers:

1. `AndroidManifest.xml` assigns `AppTheme.NoActionBarLaunch` to `MainActivity`.
2. The launch theme uses the dark `#111B21` background and transparent `who_called_splash_icon`, then switches to `AppTheme.NoActionBar`.
3. `MainActivity` briefly shows the same transparent `public/who-called.png` while Angular renders. `ThemeService` calls `WhoCalledNative.hideSplash()` after application initialization.

`public/who-called.png` is the canonical source. Do not place it on a white tile or opaque canvas. Android controls the system splash icon mask and safe area.

Capacitor may generate a legacy `res/drawable/splash.png` during `cap sync`. The native patch intentionally removes generated `splash.png` files before writing `res/drawable/splash.xml`; Android cannot merge two resources with the same `@drawable/splash` name in one density bucket.

Verify a force-stopped cold launch on Android 12+ and one older supported version, in portrait and landscape. Confirm there is no white square, white flash, clipping, stretching or mismatched transition.

## Light and dark notification/status surfaces

The Angular theme service sends the effective theme to `WhoCalledSystemBars.setDarkMode(...)`. Native code then:

- Sets status and navigation bar backgrounds to `#F4F7F4` in light mode or `#0E1713` in dark mode.
- Enables dark system icons on light bars and light system icons on dark bars.
- Disables Android's automatic contrast scrims where supported.
- Reapplies the style when the app resumes or regains focus.

Automatic theme follows `prefers-color-scheme` in Angular and Android's night configuration during cold start.

The local-notification small icon is `ic_stat_who_called`. It is a white vector on transparent background. This is intentional: Android masks and tints notification small icons for the current system surface. Do not use the full-colour launcher image as a notification small icon; it can render as a solid square.

Test:

1. Light, Dark and Automatic themes.
2. Theme changes while the app is open.
3. Returning from WhatsApp, the dialler and the SMS composer.
4. Status icons, gesture/navigation bar icons and notification icons on both light and dark device themes.

## Android share target

The native patch adds an `ACTION_SEND` plain-text intent filter. `MainActivity` stores only the latest explicitly shared text until Angular consumes it through `WhoCalledNative.consumeSharedText()`. Do not add notification-listener or SMS-reading permissions; the user must choose Share from another application.

Shared content must be shown in the Saved Message editor for review before it is encrypted and saved. Never save automatically and never log the shared message.

## Optional call-log permission

`READ_CALL_LOG` is controlled at build time:

```text
ENABLE_DEVICE_CALL_LOG=false
```

The patch removes the permission when false. When true, native call-log work must still be gated behind a user-initiated explanation and runtime permission request. A denial must return to permission-free Recent Activity rather than an error-only screen.

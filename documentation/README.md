# Who Called?

A mobile-first, offline private contact organiser built with Angular and Capacitor. It keeps contacts separate from Android Contacts and provides quick WhatsApp, dialler and SMS workflows, saved important messages, OTP detection, tagged unknown numbers, and encrypted device-local browser storage.

## Current application

- Mobile-first Home, Contacts, WhatsApp, Saved Messages, Tagged Numbers and Settings screens
- Light, Dark and Automatic themes
- AES-GCM encrypted records stored in IndexedDB in the browser
- Private contact search including partial phone-number matching
- India and `+91` defaults with E.164-compatible normalization
- WhatsApp URLs with locally cleaned numbers and URL-encoded messages
- Saved-message OTP/reference detection
- Temporary notes and tags for unknown numbers, kept separate from contacts
- Capacitor Android configuration, branded launcher/splash inputs and native theme-aware system bars
- GitHub Actions debug APK and signed tag-release APK/AAB workflow

SQLite, secure Android key storage, optional call-log retrieval, full backup/restore, biometric PIN unlock, reminders, vCard/CSV, and contact import belong behind the interfaces under `src/app/core` as the native phases are completed. The browser build never requests Android-only permissions.

## Install and run

Use Node 24.16 or a compatible version from `package.json`.

```bash
npm install
npm run develop
```

Open `http://localhost:3029`.

Quality checks:

```bash
npm run lint
npm test -- --watch=false
npm run build
```

## Android

The Android project is generated, not committed:

```bash
npm run android:add
npm run android:sync
npm run android:open
```

See [ANDROID.md](ANDROID.md) for CI, signing, versions and local troubleshooting. See [ANDROID_SPECIAL_CASES.md](ANDROID_SPECIAL_CASES.md) before changing the splash screen, system bars, notification icon, share target or optional call-log flag.

## Privacy model

- Application records are not stored in localStorage, sessionStorage, cookies, analytics or cloud services.
- Browser records are encrypted with AES-GCM before entering IndexedDB.
- The browser encryption key is a non-extractable `CryptoKey` stored through IndexedDB structured cloning.
- Android production storage should use SQLite with its data key wrapped by Android Keystore.
- Call-log permission is excluded unless `ENABLE_DEVICE_CALL_LOG=true` at native patch time.
- Calls use `ACTION_DIAL`; SMS opens the composer; WhatsApp opens an external handler. The app does not silently call, message or send.

The project intentionally keeps the entire Android call log out of its database and never reads the SMS inbox.

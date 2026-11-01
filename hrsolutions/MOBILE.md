# Bundled Android and iOS UI

The native app packages this repository's frontend inside the APK/IPA. No hosted frontend or CAPACITOR_SERVER_URL is needed for a normal build.

## Build and run

From hrsolutions:

```powershell
npm ci
npm run build:mobile
npm run cap:sync:android
npm run cap:android
```

For iOS on a Mac, use cap:sync:ios and cap:ios instead. Build/run the native project from Android Studio or Xcode after syncing.

build:mobile creates an isolated .mobile-build workspace, statically exports the frontend, and copies the generated HTML, scripts, styles, fonts, icons, and route assets into out/. Capacitor uses out/ as its webDir. The www/ placeholder is no longer packaged.

## APIs

The UI runs locally on the device. Live data still comes from the backend.

- NEXT_PUBLIC_BACKEND_URL is the backend origin; mobile builds default to https://api.pixbe.in.
- The backend must allow native origins https://localhost (Android) and capacitor://localhost (iOS) in its CORS allowlist.
- Next.js proxy, API routes, and server actions stay in the web project and are excluded from the mobile export. Existing setup screens call the backend client directly.
- Reset-password, invitation, and email-verification query parameters are read on the client, so those screens work without a Next.js server.
- The optional AI assistant requires NEXT_PUBLIC_SERVER_API_ORIGIN pointing to an API service that provides /api/ai/assistant. If absent, the feature reports that its service is not configured; no server key is bundled.
- Workplace picker and attendance maps need NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Maps JavaScript API + Geocoding API). This value is inlined at `build:mobile` time; local `.env.local` does not reach GitHub-built APKs/IPAs.
- Google/Firebase integrations still require their provider configuration to support native sign-in.

## GitHub Actions

Android and iOS workflows run build:mobile before syncing the native project. They do not request or default to a frontend server_url.

Repository variables:
- MOBILE_BACKEND_URL: optional backend origin (defaults to https://api.pixbe.in).
- MOBILE_SERVER_API_ORIGIN: optional API origin for server-only assistant requests.

Repository secrets:
- MOBILE_GOOGLE_MAPS_API_KEY: Google Maps JavaScript API key baked into CI APK/IPA builds. Without it, maps show “API key is not set” on devices. Prefer Android package / iOS bundle restrictions (or none for WebView) over HTTP referrer restrictions — Capacitor does not use browser referrers.

Existing signing secrets are still required for signed releases or TestFlight. Building the UI successfully does not replace real-device tests for login, camera, geolocation, notifications, and external authentication.

## Push notifications (FCM / APNs)

Background alerts use Capacitor Push Notifications + Firebase Cloud Messaging. The JS layer already registers the device token with the backend after login.

### Shared (Android + iOS)

1. Create a Firebase project (current: `hr-solutions-51cc2`) and register apps with id `in.pixbe.hrsolutions`.
2. On the backend, set a Firebase **service account** in env:

```
FCM_PROJECT_ID=...
FCM_CLIENT_EMAIL=...
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

3. After plugin changes, run `npm run cap:sync:android` / `npm run cap:sync:ios`.

### Android

1. Download `google-services.json` into `hrsolutions/android/app/` (Google Services plugin applies when this file exists).

### iOS

1. Add an iOS app in Firebase with bundle id `in.pixbe.hrsolutions`.
2. Download `GoogleService-Info.plist` into `hrsolutions/ios/App/App/` (see `GoogleService-Info.plist.example`). It must be a real member of the Xcode App target.
3. Apple Developer → create an **APNs Auth Key** (`.p8`) → upload it in Firebase → Project settings → Cloud Messaging → Apple app config.
4. Native project already wires:
   - `App.entitlements` Push (`aps-environment`)
   - `UIBackgroundModes` → `remote-notification`
   - `AppDelegate` Firebase Messaging so Capacitor receives an **FCM** token (required by the backend)
   - FirebaseMessaging SPM package on the App target
5. On a Mac: open Xcode (`npm run cap:ios`), confirm Signing team + Push Notifications capability, resolve Swift packages, run on a **physical iPhone**.
6. For local debug builds with a Development profile, set `aps-environment` to `development` in `App.entitlements`. App Store / TestFlight CI should use `production`.

Geofence monitoring: while an office punch is open, the native app runs `@capacitor-community/background-geolocation` (Android foreground service + iOS `location` background mode) and posts `/attendance/presence` over Capacitor HTTP so pings continue while the app is backgrounded or swiped away. Attendance tracking and office punch-in require **Allow all the time** (Android background location / iOS Always); while-in-use alone is rejected and the app opens settings. A sticky “Attendance location active” notification appears on Android while tracking. Force-stop (Android) or force-quit (iOS) still ends tracking until the app is opened again with an open punch. Leaving the fence triggers a 15-minute clock-out warning (inbox + push); staying outside auto-punches out.

## Optional live reload

For development only, you can explicitly point the WebView at a running frontend:

```powershell
npm run mobile:dev
# In another terminal:
$env:CAPACITOR_SERVER_URL = 'http://10.0.2.2:3010'
npm run cap:sync:android
```

Use http://localhost:3010 for an iOS simulator or your PC's LAN address for a physical phone. Clear CAPACITOR_SERVER_URL and sync again to return to bundled assets.

The ordinary web build remains npm run build and continues supporting Next.js server features.

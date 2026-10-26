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
- Google/Firebase integrations still require their provider configuration to support native sign-in.

## GitHub Actions

Android and iOS workflows run build:mobile before syncing the native project. They do not request or default to a frontend server_url.

Repository variables:
- MOBILE_BACKEND_URL: optional backend origin (defaults to https://api.pixbe.in).
- MOBILE_SERVER_API_ORIGIN: optional API origin for server-only assistant requests.

Existing signing secrets are still required for signed releases or TestFlight. Building the UI successfully does not replace real-device tests for login, camera, geolocation, notifications, and external authentication.

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

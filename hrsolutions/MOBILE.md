# Running the new mobile UI

The native app loads the frontend named by Capacitor's `server.url`. The UI in this repository is a Next.js app; `www` is only a native fallback page, not a compiled copy of that UI.

There is no longer an automatic fallback to `app.pixbe.in`. Loading that site showed the older deployed frontend regardless of local UI changes.

## Android emulator

Start the new UI in one terminal:

```powershell
cd hrsolutions
npm run mobile:dev
```

In another terminal:

```powershell
cd hrsolutions
npm run cap:sync:android
npm run cap:android
```

Run the app again from Android Studio. The emulator loads `http://10.0.2.2:3010`, which reaches this computer's frontend. The local browser preview is `http://localhost:3010`. Keep the development server running.

## iOS simulator

On a Mac, start `npm run mobile:dev`, then run `npm run cap:sync:ios` and `npm run cap:ios`. The simulator loads `http://localhost:3010`.

## Physical phone

Use the computer's LAN IPv4 address on the same network:

```powershell
$env:CAPACITOR_SERVER_URL = 'http://YOUR_PC_LAN_IP:3010'
npm run cap:sync:android
```

Allow the development server through the computer's firewall when prompted. A physical phone cannot reach the computer through the Android emulator's `10.0.2.2` address.

## Installed builds and GitHub Actions

To run independently of your computer, deploy the frontend from this repository to its own HTTPS URL. Then set `CAPACITOR_SERVER_URL` to that URL and sync before rebuilding the APK or IPA.

Android and iOS workflows accept `server_url`, or use the GitHub repository variable `MOBILE_UI_URL`. They now fail clearly when neither is set instead of silently shipping the old website. A UI deployment and an installed native rebuild are separate steps; syncing source files does not update an APK already installed on a phone.

The backend is configured separately through `NEXT_PUBLIC_BACKEND_URL`. When unset, browser API requests use `/api/v1` on the current frontend, and Next.js forwards them using `BACKEND_INTERNAL_URL` / `NEXT_PUBLIC_BACKEND_URL` (or the local backend on port 8080). Native devices therefore do not send fallback API requests to their own `localhost:8080`.

## Native features

Camera, geolocation, local notifications, downloads, and browser helpers remain in `src/lib/native/`. Android builds require Android Studio and a JDK; iOS builds require macOS and Xcode.

Direct `npx cap sync` uses the Android development target by default. Prefer the platform-specific scripts so the iOS target is set correctly. An explicit `CAPACITOR_SERVER_URL` always overrides development defaults.

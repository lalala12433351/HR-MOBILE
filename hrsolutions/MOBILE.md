# Capacitor Mobile App (Android & iOS)

HR Solutions runs as a **Capacitor native shell** that loads the hosted Next.js app. This keeps SSR, Server Actions, AI routes, and API rewrites — no static export, no lost functionality.

## Architecture

| Layer | Role |
|-------|------|
| `android/` / `ios/` | Native WebView + plugins (camera, GPS, browser, share…) |
| `capacitor.config.ts` | App id, splash/status bar, `server.url` |
| Hosted Next (`https://app.pixbe.in`) | Full web UI (existing API via env) |

Default app id: `in.pixbe.hrsolutions`  
Default server URL: `https://app.pixbe.in`

## Prerequisites

- Node 20+
- [Android Studio](https://developer.android.com/studio) (Windows/macOS/Linux) for Android builds
- macOS + Xcode for iOS builds (project files are generated; build only on a Mac)
- JDK 17+ for Android Gradle

## Install & sync

```bash
cd hrsolutions
npm install
npx cap sync
```

From repo root:

```bash
npm run cap:sync
```

## Configure server URL

Set before `cap sync` / `cap copy`:

```bash
# Production (default)
set CAPACITOR_SERVER_URL=https://app.pixbe.in

# Android emulator → host machine Next.js
set CAPACITOR_SERVER_URL=http://10.0.2.2:3000

# Physical device on LAN → your PC IP
set CAPACITOR_SERVER_URL=http://192.168.x.x:3000
```

Then:

```bash
npx cap sync
```

`capacitor.config.ts` also enables cleartext / mixed content when the URL is `http://` (dev only).

## Run Android

```bash
cd hrsolutions
npx cap open android
```

Or: `npm run cap:android`  
In Android Studio: select a device/emulator → Run.

Permissions already declared: camera, fine/coarse location, media images.

## Run iOS (Mac only)

```bash
cd hrsolutions
npx cap open ios
```

Or: `npm run cap:ios`  
Open in Xcode → select simulator/device → Run.

Usage strings are in `ios/App/App/Info.plist` for camera, location, and photo library.

## Native helpers in the web app

Code under `src/lib/native/` wraps Capacitor plugins and falls back to browser APIs on web:

| Helper | Purpose |
|--------|---------|
| `getCurrentPosition` | Attendance / office GPS |
| `getSelfieStream` / `captureSelfiePhoto` | Punch selfie |
| `openExternalUrl` | Google / meeting links |
| `downloadBlob` | CSV / document exports (share sheet on device) |
| `initNativeShell` | Status bar, splash, Android back button |

`NativeShellBootstrap` is mounted from the root layout.

## Google Workspace sign-in

On native, Firebase uses `signInWithRedirect` instead of `signInWithPopup` (popups fail in WebViews). Desktop web still uses popup.

## npm scripts

**`hrsolutions/package.json`**

- `cap:sync` — copy web assets + update native projects  
- `cap:android` / `cap:ios` — open IDE  
- `cap:add:android` / `cap:add:ios` — re-add platforms if needed  

**Repo root**

- `cap:sync`, `cap:android`, `cap:ios`

## Checklist before store builds

1. Point `CAPACITOR_SERVER_URL` at production HTTPS  
2. `npx cap sync`  
3. Replace launcher icons / splash under `android/` and `ios/`  
4. Test attendance punch (GPS + camera permissions) on a real device  
5. Test report download / share sheet  
6. Test Google Drive/Meet connect flow  

## GitHub Actions (APK & IPA)

Workflows live at the **repo root**:

| Workflow | File | Output |
|----------|------|--------|
| Android APK | `.github/workflows/android-build.yml` | Debug APK (auto on push) or signed release APK (`workflow_dispatch`) |
| iOS IPA | `.github/workflows/ios-build.yml` | Signed IPA artifact; optional TestFlight upload |

### Android

- **Debug (no secrets):** push/PR touching Capacitor Android paths, or Actions → *Android APK* → `debug`.
- **Release:** Actions → *Android APK* → `release`. Requires repo secrets:

| Secret | Purpose |
|--------|---------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `.jks` / `.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

Encode a keystore (PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore")) | Set-Clipboard
```

### iOS / TestFlight

Manual only (`workflow_dispatch`) — needs a macOS runner and Apple signing material:

| Secret | Purpose |
|--------|---------|
| `IOS_BUILD_CERTIFICATE_BASE64` | Base64 `.p12` distribution certificate |
| `IOS_P12_PASSWORD` | Password for the `.p12` |
| `IOS_PROVISION_PROFILE_BASE64` | Base64 App Store provisioning profile |
| `IOS_KEYCHAIN_PASSWORD` | Temporary CI keychain password (any strong value) |
| `APPLE_TEAM_ID` | 10-character Apple Team ID |
| `IOS_CODE_SIGN_IDENTITY` | Optional; default `iPhone Distribution` |
| `ASC_KEY_ID` | App Store Connect API key id (TestFlight) |
| `ASC_ISSUER_ID` | App Store Connect issuer id (TestFlight) |
| `ASC_PRIVATE_KEY` | Contents of the `.p8` key (TestFlight) |

Bundle id: `in.pixbe.hrsolutions`. Enable *Upload IPA to TestFlight* in the workflow form when ASC secrets are set.

## Out of scope (current product)

- Push notifications (in-app list only)
- Offline / local sync
- Separate Master Admin native app

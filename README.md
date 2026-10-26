# Enterprise BOS / HR Solutions Platform

Frontend HRMS (Pixbe) with Capacitor Android/iOS shells. The UI lives in `hrsolutions/`; connect any existing backend via env (`NEXT_PUBLIC_BACKEND_URL`).

```text
HR-Solutions-Moblie/
├── hrsolutions/     # Next.js UI + Capacitor (android/ ios/)
└── .github/         # Android APK & iOS IPA workflows
```

---

## Frontend (`hrsolutions/`)

```bash
cd hrsolutions
npm install
npm run dev
```

### Mobile (Capacitor)

The native apps load the new frontend from this repository. Run `npm run mobile:dev` inside `hrsolutions` and sync with `npm run cap:sync:android` (Android emulator) or `npm run cap:sync:ios` (iOS simulator). Installed builds require this frontend’s deployed URL via `CAPACITOR_SERVER_URL`; no older website is selected automatically.

```bash
cd hrsolutions
npm install
npx cap sync
npm run cap:android   # Android Studio
npm run cap:ios       # Xcode (Mac)
```

Full guide: [hrsolutions/MOBILE.md](hrsolutions/MOBILE.md)

---

## CI/CD (GitHub Actions)

| Workflow | File | What it does |
|----------|------|----------------|
| Sync from HR-Solutions | [`.github/workflows/sync-from-hr-solutions.yml`](.github/workflows/sync-from-hr-solutions.yml) | Opens a PR here when `lalala12433351/HR-Solutions` pushes (via `repository_dispatch`) or when run manually |
| Android APK | [`.github/workflows/android-build.yml`](.github/workflows/android-build.yml) | Debug APK on push; signed release via `workflow_dispatch` + keystore secrets |
| iOS IPA | [`.github/workflows/ios-build.yml`](.github/workflows/ios-build.yml) | Manual IPA build; optional TestFlight |

### Cross-repo sync secrets

**This repo (`iPrq/HR-Solutions-Moblie`):**
- `HR_SOLUTIONS_SYNC_TOKEN` (required) — PAT that can read `lalala12433351/HR-Solutions`
- `MOBILE_SYNC_PAT` (optional) — PAT for this repo so the sync PR can trigger other Actions (`GITHUB_TOKEN` cannot)

**Source repo (`lalala12433351/HR-Solutions`):**
- `MOBILE_REPO_TOKEN` — PAT that can send `repository_dispatch` to this repo  
  Workflow file: `.github/workflows/notify-mobile-sync.yml`

Capacitor paths (`android/`, `ios/`, `capacitor.config.ts`, etc.) are preserved during sync.

Secrets and mobile build steps: [hrsolutions/MOBILE.md](hrsolutions/MOBILE.md).

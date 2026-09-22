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

The native apps load the hosted UI (`https://app.pixbe.in` by default) so all web features stay intact.

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

After you connect this project to a GitHub repo, these workflows run from the root:

| Workflow | File | What it does |
|----------|------|----------------|
| Android APK | [`.github/workflows/android-build.yml`](.github/workflows/android-build.yml) | Debug APK on push; signed release via `workflow_dispatch` + keystore secrets |
| iOS IPA | [`.github/workflows/ios-build.yml`](.github/workflows/ios-build.yml) | Manual IPA build; optional TestFlight |

Secrets and steps are documented in [hrsolutions/MOBILE.md](hrsolutions/MOBILE.md).

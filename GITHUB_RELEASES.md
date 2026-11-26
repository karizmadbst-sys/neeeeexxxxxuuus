# NEXUS ROYALE — GitHub Actions & Release Guide

Both the **Android APK** (`ubuntu-latest`) and **Windows EXE Installer** (`windows-latest`) are built automatically via GitHub Actions—no local Android SDK, Java, or Windows build toolchain is required.

## 1. Repository Configuration & Secrets

In your GitHub repository, open **Settings → Secrets and variables → Actions**:

### Variables / Secrets (Recommended)
| Name | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `VITE_BACKEND_URL` | Variable or Secret | Optional (has default) | Production `https://` origin of the NEXUS ROYALE Express + WebSocket server. Defaults to `https://ais-pre-kgjgpnjbzvdsadro4u6lnw-688318389065.europe-west3.run.app`. Never use `localhost`. |
| `ANDROID_GOOGLE_SERVICES_JSON` | Secret | Recommended for Play/Release Google Sign-In | Base64-encoded `google-services.json` from Firebase Console for Android package `com.nexusroyale.game` with your keystore SHA-1 / SHA-256 fingerprints registered. |
| `ANDROID_KEYSTORE_BASE64` | Secret | Required for Play Store / production signing | Base64-encoded `.jks` or `.keystore` file (`base64 -w0 release.keystore`). If omitted, Gradle signs the release APK with Android's debug keystore for test installs. |
| `ANDROID_KEYSTORE_PASSWORD` | Secret | Required with `ANDROID_KEYSTORE_BASE64` | Keystore password. |
| `ANDROID_KEY_ALIAS` | Secret | Required with `ANDROID_KEYSTORE_BASE64` | Signing key alias. |
| `ANDROID_KEY_PASSWORD` | Secret | Required with `ANDROID_KEYSTORE_BASE64` | Signing key password. |
| `WIN_CSC_LINK` | Secret | Optional | Base64-encoded Windows Authenticode `.pfx` / `.p12` certificate for code signing the `.exe`. |
| `WIN_CSC_KEY_PASSWORD` | Secret | Optional | Password for `WIN_CSC_LINK`. |

## 2. Firebase & Google Sign-In Setup Checklist

1. **Android (`com.nexusroyale.game`)**:
   - In **Firebase Console → Project Settings → Your apps → Add Android app**, register package name `com.nexusroyale.game`.
   - Add the **SHA-1** and **SHA-256** fingerprints of your Android signing keystore (`keytool -list -v -keystore release.keystore`).
   - Download `google-services.json`, base64-encode it, and save it to GitHub Secret `ANDROID_GOOGLE_SERVICES_JSON`.
2. **Windows EXE**:
   - Uses Firebase project `authDomain` (`gen-lang-client-0539248410.firebaseapp.com`), which is already authorized in Firebase Authentication.

## 3. Triggering Builds & Publishing Releases

### Option A — Push a Version Tag (Publishes Artifacts + GitHub Release)
```bash
git add .
git commit -m "Configure Android APK and Windows EXE builds"
git push origin main

git tag v1.0.0
git push origin v1.0.0
```
Both workflows automatically run and attach:
- `NEXUS-ROYALE-1.0.0.apk`
- `NEXUS-ROYALE-Setup-1.0.0.exe`

to the **GitHub Release** under **Releases → `v1.0.0`**.

### Option B — Automatic `main` Push or Manual `workflow_dispatch`
- Pushing to `main` or opening **Actions → Build Android APK / Build Windows Installer → Run workflow** produces downloadable artifacts (`nexus-royale-android-apk` and `nexus-royale-windows-exe`) on the workflow run summary page.

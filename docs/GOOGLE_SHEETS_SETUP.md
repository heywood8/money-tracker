# Google Sheets Export — GCP Setup

Documents the Google Cloud Platform configuration required for the native Google Sign-In + Sheets export feature.

## GCP Project

The OAuth client lives in the same GCP project as the rest of the app's credentials. Navigate there via **APIs & Services** (or the newer **Google Auth Platform** if redirected).

---

## Required: Android OAuth Client

The native SDK (`@react-native-google-signin/google-signin`) identifies the app via **package name + SHA-1 fingerprint**. A web client alone is not sufficient — you need a dedicated Android client.

**APIs & Services → Credentials → + Create Credentials → OAuth client ID → Android**

| Field | Value |
|-------|-------|
| Package name | `com.heywood8.monkeep` |
| SHA-1 (debug builds) | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |
| SHA-1 (release/EAS builds) | `C9:36:A3:3B:CF:F9:17:DF:75:A5:1F:C9:F3:E7:2B:BE:87:C4:5B:5E` |

Create **two separate Android clients** — one per SHA-1 — or one client per environment. GCP does not support multiple SHA-1s on a single Android client.

### SHA-1 source notes

- **Debug SHA-1** comes from `android/app/debug.keystore` (Expo's own debug keystore, generated during prebuild). Do NOT use `~/.android/debug.keystore` — it is a different keystore.
  ```
  keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android
  ```
- **Release SHA-1** comes from `credentials/android/keystore.jks` (the EAS production keystore).
  ```
  keytool -list -v -keystore credentials/android/keystore.jks -alias <alias> -storepass <password>
  ```

---

## Required: OAuth Consent Screen (Google Auth Platform → Audience)

**Publishing status:** Testing (sufficient for development; publish when releasing to users)

**Test users:** Add every Google account used during development under **Audience → Test users → + Add users**. Without this, Google silently rejects scope authorization for accounts not on the list.

---

## Required: Scopes (Google Auth Platform → Data Access)

Add both scopes via **Data Access → Add or remove scopes**:

| API | Scope | Classification |
|-----|-------|----------------|
| Google Drive API | `.../auth/drive.file` | Non-sensitive |
| Google Sheets API | `.../auth/spreadsheets` | Sensitive |

---

## Required: APIs Enabled

Confirm both APIs are enabled under **APIs & Services → Enabled APIs**:
- Google Sheets API
- Google Drive API

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `DEVELOPER_ERROR (code 10)` | No Android OAuth client matching package + SHA-1 | Create Android client with correct SHA-1 (see above) |
| Sign-in fails silently, no dialog | `isErrorWithCode` used as comparator (it's a type guard in v16) | Use `error?.code === statusCodes.SIGN_IN_CANCELLED` directly |
| Auth fails with no error dialog after account selected | Test user not added to OAuth consent screen | Add account to Audience → Test users |
| Dark screen for ~2s then fails | Scope consent failing — scopes not declared | Add scopes in Data Access |

# Google Sheets Export — Design Spec

**Date:** 2026-05-04  
**Issue:** heywood8/money-tracker#364  
**Status:** Approved

---

## Summary

Add Google Sheets as a 4th export format option in the existing Settings → Export sub-panel. On tap, the app completes an OAuth PKCE flow, then creates or updates a Google Sheets document with 6 sheets covering all app data. Subsequent exports update the same document.

---

## Architecture

### New file

**`app/services/GoogleSheetsService.js`**

Owns all Google Sheets logic as plain async functions:
- Token exchange (auth code → access + refresh tokens)
- Secure token storage and retrieval via `expo-secure-store`
- Silent token refresh before each export
- Re-auth fallback when refresh token is invalid/revoked
- Spreadsheet creation on first export
- Sheet clear + rewrite on subsequent exports
- Data fetching (delegates to `createBackup()` from `BackupRestore.js`)
- Data mapping and `batchUpdate` payload construction

### Modified files

| File | Change |
|---|---|
| `app/modals/SettingsModal.js` | Add `useAuthRequest` + `useAutoDiscovery` hooks; add Google Sheets option to export sub-panel; call service; show result dialog |
| `app/services/PreferencesDB.js` | Add `GOOGLE_SHEETS_SPREADSHEET_ID` to `PREF_KEYS` |
| `assets/i18n/*.json` (7 files) | Add new i18n strings |
| `package.json` | Add 3 new dependencies |

### New dependencies

| Package | Purpose |
|---|---|
| `expo-auth-session` | OAuth 2.0 PKCE flow |
| `expo-web-browser` | Opens auth browser tab (required by auth-session) |
| `expo-secure-store` | Persists refresh token securely |

---

## Auth Flow

**Hook/component boundary:**  
`expo-auth-session` hooks (`useAuthRequest`, `useAutoDiscovery`) must live in a React component. They stay in `SettingsModal`, which passes `promptAsync` to the service. The service handles all stateless work (token exchange, storage, API calls).

**Sequence:**

1. User taps "Google Sheets" in export sub-panel
2. `GoogleSheetsService.tryRefreshToken()` checks `expo-secure-store` for a stored refresh token
3. If found and valid → exchange for new access token silently → proceed to export
4. If missing or refresh fails → call `promptAsync()` to open Google sign-in in browser
5. User signs in and grants Sheets + Drive permissions
6. App receives auth code via redirect URI `com.heywood8.monkeep://`
7. Service POSTs to `https://oauth2.googleapis.com/token` to exchange code for tokens
8. Refresh token saved to `expo-secure-store`; access token kept in memory for the session
9. Proceed to export

**OAuth config:**
```js
const discovery = useAutoDiscovery('https://accounts.google.com');
const [request, response, promptAsync] = useAuthRequest(
  {
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
    redirectUri: makeRedirectUri({ scheme: 'com.heywood8.monkeep' }),
  },
  discovery
);
```

**`WebBrowser.maybeCompleteAuthSession()` must be called at module level in SettingsModal.**

**Token refresh:**  
Before each export, decode the access token's `exp` claim. If expired, POST to `https://oauth2.googleapis.com/token` with the stored refresh token. If refresh returns 400/401, clear stored tokens and fall through to full re-auth.

---

## Sheets API

**Endpoint:** `https://sheets.googleapis.com/v4/spreadsheets`

**First export:**
- `POST /v4/spreadsheets` with sheet titles → returns `spreadsheetId`
- Store `spreadsheetId` in `PreferencesDB` under key `google_sheets_spreadsheet_id`

**Subsequent exports:**
- Load `spreadsheetId` from `PreferencesDB`
- `POST /v4/spreadsheets/{id}/values:batchClear` to clear all sheet ranges
- `POST /v4/spreadsheets/{id}/values:batchUpdate` to write fresh data

**Data source:**  
Call `createBackup()` from `BackupRestore.js` to fetch all raw data in one pass. No duplicate DB queries.

---

## Sheet Structure (6 sheets)

### Accounts
`id | name | balance | currency`
- Source: `SELECT * FROM accounts` (including hidden accounts)
- Balances always shown as real values (no masking)

### Operations
`id | date | type | amount | currency | category | account | to_account | description`
- `category`, `account`, `to_account` are human-readable names (joined from DB)
- `to_account` empty for non-transfers
- Amounts always shown as real values

### Categories
`id | name | type | category_type | icon`
- All categories included, including shadow categories (`is_shadow = 1`)

### Budgets
`id | category | amount | currency | period_type | start_date | end_date | is_recurring | rollover_enabled`
- `category` is the human-readable name

### Planned Operations
`id | name | type | amount | account | category | to_account | description | is_recurring`
- `account`, `category`, `to_account` are human-readable names

### Balance History
`account | date | balance`
- `account` is the human-readable name

**Spreadsheet title:** `"Penny – export"` (static)

---

## UX & Error Handling

**Loading state:** spinner on the Google Sheets option in the export panel while auth/export runs. Rest of UI disabled.

**Success:** dialog with "Exported to Google Sheets" message + "Open" button (`Linking.openURL` to sheet URL) + "OK" to dismiss.

**Error states** (all via existing `showDialog`):

| Situation | Behavior |
|---|---|
| User cancels auth | Silent dismiss, no dialog |
| Auth failure | `"Google sign-in failed. Please try again."` |
| Token revoked | `"Google access was revoked. Please sign in again."` → clears tokens → re-auth on next tap |
| No network | `"Export failed: no internet connection."` |
| Sheets API error | `"Export failed. Please try again."` (error logged) |
| Quota exceeded | `"Google Sheets quota exceeded. Try again later."` |

No automatic retry — user taps again to retry.

---

## Testing

### Unit — `__tests__/services/GoogleSheetsService.test.js`

- Token exchange happy path
- Silent token refresh when access token expired
- Re-auth triggered when refresh token is invalid (400 response)
- Spreadsheet created on first export (no stored `spreadsheetId`)
- Existing spreadsheet updated on re-export (stored `spreadsheetId` present)
- Data mapping: correct columns and values for each of the 6 sheets
- `batchUpdate` payload structure and request format

**Mocks:** `expo-secure-store`, `expo-auth-session`, `expo-web-browser`, global `fetch`

### Integration — `__tests__/integration/GoogleSheetsExport.test.js`

- Full flow: SettingsModal tap → auth → API call → success dialog with sheet link
- Error flow: auth failure → correct error dialog
- Error flow: API failure → correct error dialog

---

## Out of Scope

- Import / two-way sync from Google Sheets
- iOS support (app is Android-only)
- Automatic background sync
- Disconnect / reset to new document (always updates same doc)
- Balance masking (export always shows real values)

---

## Environment

| Variable | Where stored |
|---|---|
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | `.env.local` (local), EAS env var (cloud builds), GitHub Actions secret |

GCP setup completed: Google Sheets API + Google Drive API enabled, OAuth consent screen configured, Android OAuth client created with SHA-1 from production keystore.

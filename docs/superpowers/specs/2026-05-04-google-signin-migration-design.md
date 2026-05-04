# Google Auth Migration: expo-auth-session → @react-native-google-signin/google-signin

**Date:** 2026-05-04  
**Status:** Approved

## Problem

`expo-auth-session/providers/google` with `androidClientId` is deprecated. Android OAuth clients in GCP use SHA-1 package validation — they are incompatible with browser-based PKCE flows. Every sign-in attempt results in `Error 400: invalid_request` from Google's OAuth endpoint.

## Solution

Replace the browser PKCE flow with `@react-native-google-signin/google-signin`, which uses the native Google Sign-In SDK. The native SDK handles token acquisition, refresh, and revocation internally — no manual SecureStore token management required.

## Architecture

### Auth flow (before)
1. `useAuthRequest()` builds PKCE request
2. `promptAsync()` opens browser to accounts.google.com
3. Browser redirects back with `code`
4. `exchangeAndStoreTokens(code, codeVerifier, redirectUri)` calls token endpoint
5. Stores `refresh_token` in SecureStore
6. On subsequent calls, `getValidAccessToken()` reads refresh token and calls token endpoint again

### Auth flow (after)
1. `GoogleSignin.hasPlayServices()` checks device readiness
2. `GoogleSignin.signIn()` shows native account picker (first time or no previous sign-in)
3. `GoogleSignin.getTokens()` returns `{ accessToken, idToken }` — refreshes automatically
4. No manual token storage, no SecureStore for tokens

## Component Changes

### `app.config.js`
- Add `"@react-native-google-signin/google-signin"` to plugins array (no options needed — Android-only, no Firebase)
- Remove `GOOGLE_REVERSED_CLIENT_ID` constant and the `intentFilters` block (library handles this internally)

### `app/services/GoogleSheetsService.js`
- Add module-level `GoogleSignin.configure({ scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'] })` — self-contained, no changes to `App.js`
- Remove: `exchangeAndStoreTokens`, `clearStoredAuth` (entire manual token exchange removed)
- Replace `getValidAccessToken()`: if `hasPreviousSignIn()` → `getTokens().accessToken`; else throw `'not_signed_in'`
- Add `signIn()`: `hasPlayServices()` + `GoogleSignin.signIn()` + return `getTokens().accessToken`
- Add `signOut()`: `GoogleSignin.revokeAccess()` + `GoogleSignin.signOut()`
- Sheets API functions (`createSpreadsheet`, `batchClear`, `batchUpdate`, `exportToSheets`) unchanged — they only consume an access token string

### `app/modals/SettingsModal.js`
- Remove: `Google` import from `expo-auth-session/providers/google`, `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`, `useAuthRequest` hook usage
- `handleGoogleSheetsExport` new flow:
  1. Try `getValidAccessToken()`
  2. If throws `not_signed_in` → call `GoogleSheetsService.signIn()` (shows native picker)
  3. On success: call `exportToSheets(accessToken, backup)` 
  4. Error mapping: `not_signed_in` after failed signIn → `google_sheets_signin_failed` dialog; `refresh_failed` / other → `google_sheets_access_revoked` dialog

### `jest.setup.js`
- Remove `expo-auth-session` and `expo-auth-session/providers/google` mocks
- Add `@react-native-google-signin/google-signin` mock:
  - `GoogleSignin.configure` → no-op
  - `GoogleSignin.hasPlayServices` → resolves true
  - `GoogleSignin.signIn` → resolves `{ type: 'success', data: { user: {...} } }`
  - `GoogleSignin.getTokens` → resolves `{ accessToken: 'test-token', idToken: 'test-id-token' }`
  - `GoogleSignin.hasPreviousSignIn` → returns false (default; override per test)
  - `GoogleSignin.signOut`, `revokeAccess` → resolves

### `__tests__/services/GoogleSheetsService.test.js`
- Remove `exchangeAndStoreTokens` and `clearStoredAuth` test blocks
- Add tests for `signIn()` and `signOut()`
- `getValidAccessToken()` tests: mock `hasPreviousSignIn` + `getTokens`; test `not_signed_in` throw when no previous sign-in

### `__tests__/integration/GoogleSheetsExport.test.js`
- Remove `useAuthRequest` mock usage
- Mock `getValidAccessToken` and `signIn` from `GoogleSheetsService` directly
- Success test: `getValidAccessToken` resolves → export succeeds
- Sign-in error test: `getValidAccessToken` throws `not_signed_in`, `signIn` throws → `signin_failed` dialog
- Revoked access test: `getValidAccessToken` throws `refresh_failed` → `access_revoked` dialog

## Installation

```bash
npm install @react-native-google-signin/google-signin
npx expo prebuild --clean
npx expo run:android
```

## GCP Setup

No new OAuth client needed. The existing Android client (`694046477037-sjel2raftqler4s6obghi51sfi22a6jd.apps.googleusercontent.com`) works with the native SDK via SHA-1 package fingerprint validation, which is already registered.

## Testing Strategy

- Unit tests: mock the native module (`GoogleSignin.*`) at jest.setup level
- Integration tests: mock `GoogleSheetsService` functions directly, test dialog outcomes
- Manual: run on emulator/device, verify native account picker appears, verify Sheets export succeeds end-to-end

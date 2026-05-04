# Google Auth Migration: expo-auth-session → @react-native-google-signin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken browser PKCE OAuth flow with the native Google Sign-In SDK so that the Google Sheets export feature works on Android.

**Architecture:** `@react-native-google-signin/google-signin` wraps the native Android Google Sign-In SDK. `GoogleSignin.configure()` is called once at module level in `GoogleSheetsService.js`. `GoogleSignin.signIn()` shows the native account picker; `GoogleSignin.getTokens()` returns a fresh access token (handles refresh internally). No manual SecureStore token management.

**Tech Stack:** `@react-native-google-signin/google-signin`, Expo managed workflow, Jest with `@testing-library/react-native`.

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Add `@react-native-google-signin/google-signin` |
| `app.config.js` | Add plugin, remove reversed-client-ID intent filter |
| `app/services/GoogleSheetsService.js` | Remove `exchangeAndStoreTokens`, `clearStoredAuth`; replace `getValidAccessToken`; add `signIn`, `signOut` |
| `__tests__/services/GoogleSheetsService.test.js` | Remove old auth tests; add `signIn`/`signOut`/`getValidAccessToken` tests; update 401 expectations |
| `app/modals/SettingsModal.js` | Remove `useAuthRequest` hook; update `handleGoogleSheetsExport` |
| `__tests__/integration/GoogleSheetsExport.test.js` | Replace `useAuthRequest` mock with `GoogleSheetsService` direct mocks |
| `jest.setup.js` | Replace expo-auth-session/providers/google mock; add google-signin mock |

---

### Task 1: Install package and update app.config.js

**Files:**
- Run: `npm install @react-native-google-signin/google-signin`
- Modify: `app.config.js`

- [ ] **Step 1: Install the package**

Run:
```bash
npm install @react-native-google-signin/google-signin
```
Expected: Package added to `node_modules` and `package.json` dependencies.

- [ ] **Step 2: Update app.config.js**

The current file has `GOOGLE_CLIENT_ID`, `GOOGLE_REVERSED_CLIENT_ID`, and an `intentFilters` block that were needed for the PKCE browser redirect. The native SDK doesn't need any of this. Add the plugin.

Replace the top of `app.config.js` (lines 1–8) — remove the Google OAuth redirect URI constants — and update `android.intentFilters` — remove it entirely — and add the plugin:

```javascript
// Architecture filtering: Only arm64-v8a for preview builds to speed up build time
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';
const ANDROID_ARCHITECTURES = IS_PREVIEW ? ['arm64-v8a'] : undefined; // undefined = all architectures

module.exports = {
  expo: {
    name: 'Penny',
    slug: 'app',
    version: '0.82.0', // x-release-please-version
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    packagerOpts: {
      hostType: 'tunnel',
    },
    scheme: 'com.heywood8.monkeep',
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      package: 'com.heywood8.monkeep',
      permissions: ['android.permission.REQUEST_INSTALL_PACKAGES'],
    },
    extra: {
      eas: {
        projectId: '89372eb2-93f5-475a-a630-9caa827d8406',
      },
    },
    owner: 'lopatinikita',
    platforms: ['android'],
    plugins: [
      'expo-sqlite',
      '@react-native-google-signin/google-signin',
      [
        'expo-build-properties',
        {
          android: {
            ...(ANDROID_ARCHITECTURES && { buildArchs: ANDROID_ARCHITECTURES }),
          },
        },
      ],
      './plugins/withR8Config.js',
    ],
    updates: {
      'url': 'https://u.expo.dev/89372eb2-93f5-475a-a630-9caa827d8406',
    },
    runtimeVersion: {
      policy: 'sdkVersion',
    },
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add app.config.js package.json package-lock.json
git commit -m "feat(google-sheets): install @react-native-google-signin/google-signin, add config plugin"
```

---

### Task 2: Update jest.setup.js mocks

**Files:**
- Modify: `jest.setup.js` (lines 680–708)

- [ ] **Step 1: Replace the expo-auth-session/providers/google mock and add google-signin mock**

Open `jest.setup.js`. Find the block starting at line 680:
```javascript
// Mock expo-auth-session
jest.mock('expo-auth-session', () => ({
```

Replace lines 680–708 (the entire expo-auth-session and expo-web-browser mock block) with:

```javascript
// Mock expo-auth-session (kept for any non-Google auth usage)
jest.mock('expo-auth-session', () => ({
  useAutoDiscovery: jest.fn(() => ({
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  })),
  useAuthRequest: jest.fn(() => [
    { codeVerifier: 'test-verifier' },
    { type: 'success', params: { code: 'test-code' } },
    jest.fn().mockResolvedValue({ type: 'success', params: { code: 'test-code' } }),
  ]),
  makeRedirectUri: jest.fn(() => 'com.heywood8.monkeep://'),
  ResponseType: { Code: 'code' },
}));

// Mock @react-native-google-signin/google-signin
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn().mockResolvedValue({ type: 'success', data: { user: { email: 'test@example.com', name: 'Test User' } } }),
    signInSilently: jest.fn().mockResolvedValue({ type: 'success', data: { user: { email: 'test@example.com' } } }),
    getTokens: jest.fn().mockResolvedValue({ accessToken: 'test-access-token', idToken: 'test-id-token' }),
    hasPreviousSignIn: jest.fn().mockReturnValue(false),
    signOut: jest.fn().mockResolvedValue(undefined),
    revokeAccess: jest.fn().mockResolvedValue(undefined),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
  isErrorWithCode: jest.fn((error, code) => error?.code === code),
}));

// Mock expo-web-browser
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(() => ({ type: 'success' })),
  openBrowserAsync: jest.fn(),
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
```

- [ ] **Step 2: Run all tests to see which break (expected)**

Run:
```bash
npm test -- --silent --testPathPattern="GoogleSheets"
```
Expected: `GoogleSheetsService.test.js` and `GoogleSheetsExport.test.js` will fail because the service still has the old API. That's fine — we fix them in Tasks 3 and 4.

- [ ] **Step 3: Commit**

```bash
git add jest.setup.js
git commit -m "test(google-sheets): replace expo-auth-session mock with google-signin mock"
```

---

### Task 3: Refactor GoogleSheetsService.js (TDD)

**Files:**
- Modify: `app/services/GoogleSheetsService.js`
- Modify: `__tests__/services/GoogleSheetsService.test.js`

- [ ] **Step 1: Rewrite the service tests first**

Replace the entire content of `__tests__/services/GoogleSheetsService.test.js` with:

```javascript
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import {
  getValidAccessToken,
  signIn,
  signOut,
  buildSheetsData,
  exportToSheets,
} from '../../app/services/GoogleSheetsService';

jest.mock('../../app/services/PreferencesDB', () => ({
  PREF_KEYS: { GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id' },
  getPreference: jest.fn(),
  setPreference: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GoogleSheetsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('getValidAccessToken', () => {
    it('returns access token from GoogleSignin when user has previous sign-in', async () => {
      GoogleSignin.hasPreviousSignIn.mockReturnValue(true);
      GoogleSignin.getTokens.mockResolvedValue({ accessToken: 'fresh-token', idToken: 'id' });

      const token = await getValidAccessToken();

      expect(token).toBe('fresh-token');
      expect(GoogleSignin.getTokens).toHaveBeenCalled();
    });

    it('throws not_signed_in when no previous sign-in', async () => {
      GoogleSignin.hasPreviousSignIn.mockReturnValue(false);

      await expect(getValidAccessToken()).rejects.toThrow('not_signed_in');
      expect(GoogleSignin.getTokens).not.toHaveBeenCalled();
    });

    it('propagates errors from getTokens as refresh_failed', async () => {
      GoogleSignin.hasPreviousSignIn.mockReturnValue(true);
      GoogleSignin.getTokens.mockRejectedValue(new Error('network error'));

      await expect(getValidAccessToken()).rejects.toThrow('refresh_failed');
    });
  });

  describe('signIn', () => {
    it('calls hasPlayServices, signIn, getTokens and returns access token', async () => {
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockResolvedValue({ type: 'success', data: { user: { email: 'u@g.com' } } });
      GoogleSignin.getTokens.mockResolvedValue({ accessToken: 'new-token', idToken: 'id' });

      const token = await signIn();

      expect(GoogleSignin.hasPlayServices).toHaveBeenCalled();
      expect(GoogleSignin.signIn).toHaveBeenCalled();
      expect(token).toBe('new-token');
    });

    it('throws when signIn is cancelled', async () => {
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      const cancelError = new Error('cancelled');
      cancelError.code = statusCodes.SIGN_IN_CANCELLED;
      GoogleSignin.signIn.mockRejectedValue(cancelError);

      await expect(signIn()).rejects.toThrow('sign_in_cancelled');
    });

    it('throws auth_failed on other sign-in errors', async () => {
      GoogleSignin.hasPlayServices.mockResolvedValue(true);
      GoogleSignin.signIn.mockRejectedValue(new Error('something went wrong'));

      await expect(signIn()).rejects.toThrow('auth_failed');
    });
  });

  describe('signOut', () => {
    it('calls revokeAccess and signOut', async () => {
      GoogleSignin.revokeAccess.mockResolvedValue(undefined);
      GoogleSignin.signOut.mockResolvedValue(undefined);

      await signOut();

      expect(GoogleSignin.revokeAccess).toHaveBeenCalled();
      expect(GoogleSignin.signOut).toHaveBeenCalled();
    });

    it('still calls signOut even if revokeAccess throws', async () => {
      GoogleSignin.revokeAccess.mockRejectedValue(new Error('already revoked'));
      GoogleSignin.signOut.mockResolvedValue(undefined);

      await signOut();

      expect(GoogleSignin.signOut).toHaveBeenCalled();
    });
  });

  describe('buildSheetsData', () => {
    const mockBackup = {
      data: {
        accounts: [
          { id: 1, name: 'Checking', balance: '1000', currency: 'USD' },
        ],
        categories: [
          { id: 'cat-1', name: 'Food', type: 'entry', category_type: 'expense', icon: 'food', is_shadow: 0 },
          { id: 'shadow-adj', name: 'Balance Adj', type: 'entry', category_type: 'expense', icon: 'cash', is_shadow: 1 },
        ],
        operations: [
          {
            id: 10, type: 'expense', amount: '50', account_id: 1,
            category_id: 'cat-1', to_account_id: null,
            date: '2026-01-01', description: 'Groceries', source_currency: 'USD',
          },
        ],
        budgets: [
          {
            id: 'bud-1', category_id: 'cat-1', amount: '500', currency: 'USD',
            period_type: 'monthly', start_date: '2026-01-01', end_date: null,
            is_recurring: 1, rollover_enabled: 0,
          },
        ],
        planned_operations: [
          {
            id: 'plan-1', name: 'Rent', type: 'expense', amount: '1200',
            account_id: 1, category_id: 'cat-1', to_account_id: null,
            description: 'Monthly rent', is_recurring: 1,
          },
        ],
        balance_history: [
          { account_id: 1, date: '2026-01-01', balance: '1000' },
        ],
      },
    };

    it('returns 6 sheets with correct titles', () => {
      const sheets = buildSheetsData(mockBackup);
      const titles = sheets.map(s => s.range.split('!')[0]);
      expect(titles).toEqual([
        'Accounts', 'Operations', 'Categories', 'Budgets', 'Planned Operations', 'Balance History',
      ]);
    });

    it('maps Accounts sheet with correct headers and data row', () => {
      const sheets = buildSheetsData(mockBackup);
      const accounts = sheets.find(s => s.range.startsWith('Accounts'));
      expect(accounts.values[0]).toEqual(['id', 'name', 'balance', 'currency']);
      expect(accounts.values[1]).toEqual([1, 'Checking', '1000', 'USD']);
    });

    it('maps Operations sheet with human-readable account and category names', () => {
      const sheets = buildSheetsData(mockBackup);
      const ops = sheets.find(s => s.range.startsWith('Operations'));
      expect(ops.values[0]).toEqual([
        'id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description',
      ]);
      expect(ops.values[1][5]).toBe('Food');
      expect(ops.values[1][6]).toBe('Checking');
      expect(ops.values[1][7]).toBe('');
    });

    it('includes all categories including shadow ones', () => {
      const sheets = buildSheetsData(mockBackup);
      const cats = sheets.find(s => s.range.startsWith('Categories'));
      expect(cats.values).toHaveLength(3); // header + 2 categories
    });

    it('maps Budgets sheet with category name instead of id', () => {
      const sheets = buildSheetsData(mockBackup);
      const budgets = sheets.find(s => s.range.startsWith('Budgets'));
      expect(budgets.values[1][1]).toBe('Food');
    });

    it('maps Planned Operations with account and category names', () => {
      const sheets = buildSheetsData(mockBackup);
      const planned = sheets.find(s => s.range.startsWith('Planned Operations'));
      expect(planned.values[1][1]).toBe('Rent');
      expect(planned.values[1][4]).toBe('Checking');
      expect(planned.values[1][5]).toBe('Food');
    });

    it('maps Balance History with account name instead of id', () => {
      const sheets = buildSheetsData(mockBackup);
      const history = sheets.find(s => s.range.startsWith('Balance History'));
      expect(history.values[0]).toEqual(['account', 'date', 'balance']);
      expect(history.values[1][0]).toBe('Checking');
    });
  });

  describe('exportToSheets', () => {
    const { getPreference, setPreference } = require('../../app/services/PreferencesDB');

    const mockBackup = {
      data: {
        accounts: [{ id: 1, name: 'Cash', balance: '100', currency: 'USD' }],
        categories: [{ id: 'c1', name: 'Food', type: 'entry', category_type: 'expense', icon: 'food' }],
        operations: [],
        budgets: [],
        planned_operations: [],
        balance_history: [],
      },
    };

    it('creates a new spreadsheet and stores its ID on first export', async () => {
      getPreference.mockResolvedValue(null);
      setPreference.mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spreadsheetId: 'new-sheet-id' }),
      });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const url = await exportToSheets('access-token', mockBackup);

      expect(url).toBe('https://docs.google.com/spreadsheets/d/new-sheet-id');
      expect(setPreference).toHaveBeenCalledWith('google_sheets_spreadsheet_id', 'new-sheet-id');
    });

    it('updates existing spreadsheet without creating a new one on re-export', async () => {
      getPreference.mockResolvedValue('existing-sheet-id');
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const url = await exportToSheets('access-token', mockBackup);

      expect(url).toBe('https://docs.google.com/spreadsheets/d/existing-sheet-id');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(setPreference).not.toHaveBeenCalled();
    });

    it('throws refresh_failed and signs out when clearSheets returns 401', async () => {
      getPreference.mockResolvedValue('sheet-id');
      GoogleSignin.revokeAccess.mockResolvedValue(undefined);
      GoogleSignin.signOut.mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized' } }),
      });

      await expect(exportToSheets('expired-token', mockBackup)).rejects.toThrow('refresh_failed');
      expect(GoogleSignin.signOut).toHaveBeenCalled();
    });

    it('throws refresh_failed and signs out when writeSheets returns 401', async () => {
      getPreference.mockResolvedValue('sheet-id');
      GoogleSignin.revokeAccess.mockResolvedValue(undefined);
      GoogleSignin.signOut.mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized' } }),
      });

      await expect(exportToSheets('expired-token', mockBackup)).rejects.toThrow('refresh_failed');
      expect(GoogleSignin.signOut).toHaveBeenCalled();
    });

    it('throws quota_exceeded when batchUpdate returns 429', async () => {
      getPreference.mockResolvedValue('sheet-id');
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Quota exceeded' } }),
      });

      await expect(exportToSheets('access-token', mockBackup)).rejects.toThrow('quota_exceeded');
    });
  });
});
```

- [ ] **Step 2: Run the new tests — they should fail**

Run:
```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```
Expected: Multiple failures — `signIn`, `signOut`, `getValidAccessToken` not exported / wrong behavior.

- [ ] **Step 3: Rewrite GoogleSheetsService.js**

Replace the entire content of `app/services/GoogleSheetsService.js` with:

```javascript
import { GoogleSignin, statusCodes, isErrorWithCode } from '@react-native-google-signin/google-signin';
import { getPreference, setPreference, PREF_KEYS } from './PreferencesDB';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// Configure GoogleSignin once at module load. No webClientId needed since we
// only need client-side access tokens (no server-side offline access).
GoogleSignin.configure({
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
  ],
});

/**
 * Get a valid access token using the native Google Sign-In SDK.
 * Throws 'not_signed_in' if the user has never signed in.
 * Throws 'refresh_failed' if getTokens fails (revoked or network error).
 * @returns {Promise<string>} Access token
 */
export const getValidAccessToken = async () => {
  if (!GoogleSignin.hasPreviousSignIn()) {
    throw new Error('not_signed_in');
  }
  try {
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken;
  } catch {
    throw new Error('refresh_failed');
  }
};

/**
 * Trigger native Google Sign-In UI and return the resulting access token.
 * Throws 'sign_in_cancelled' if the user dismisses the picker.
 * Throws 'auth_failed' on any other error.
 * @returns {Promise<string>} Access token
 */
export const signIn = async () => {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  try {
    await GoogleSignin.signIn();
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken;
  } catch (error) {
    if (isErrorWithCode(error, statusCodes.SIGN_IN_CANCELLED)) {
      throw new Error('sign_in_cancelled');
    }
    throw new Error('auth_failed');
  }
};

/**
 * Revoke Google access and sign out (clears the native session).
 * Safe to call even if the user has already revoked access externally.
 */
export const signOut = async () => {
  try {
    await GoogleSignin.revokeAccess();
  } catch {
    // Access may already be revoked; continue to sign out
  }
  await GoogleSignin.signOut();
};

/**
 * Build the 6-sheet data structure from a backup object.
 * @param {Object} backup - Backup object from createBackup()
 * @returns {Array<{range: string, values: Array<Array>}>}
 */
export const buildSheetsData = (backup) => {
  const { accounts, categories, operations, budgets, planned_operations, balance_history } = backup.data;

  const accountNames = new Map(accounts.map(a => [a.id, a.name]));
  const categoryNames = new Map(categories.map(c => [c.id, c.name]));

  return [
    {
      range: 'Accounts!A1',
      values: [
        ['id', 'name', 'balance', 'currency'],
        ...accounts.map(a => [a.id, a.name, a.balance, a.currency]),
      ],
    },
    {
      range: 'Operations!A1',
      values: [
        ['id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description'],
        ...operations.map(o => [
          o.id,
          o.date,
          o.type,
          o.amount,
          o.source_currency || '',
          categoryNames.get(o.category_id) || '',
          accountNames.get(o.account_id) || '',
          o.to_account_id ? (accountNames.get(o.to_account_id) || '') : '',
          o.description || '',
        ]),
      ],
    },
    {
      range: 'Categories!A1',
      values: [
        ['id', 'name', 'type', 'category_type', 'icon'],
        ...categories.map(c => [c.id, c.name, c.type, c.category_type, c.icon || '']),
      ],
    },
    {
      range: 'Budgets!A1',
      values: [
        ['id', 'category', 'amount', 'currency', 'period_type', 'start_date', 'end_date', 'is_recurring', 'rollover_enabled'],
        ...(budgets || []).map(b => [
          b.id,
          categoryNames.get(b.category_id) || '',
          b.amount,
          b.currency,
          b.period_type,
          b.start_date,
          b.end_date || '',
          b.is_recurring,
          b.rollover_enabled,
        ]),
      ],
    },
    {
      range: 'Planned Operations!A1',
      values: [
        ['id', 'name', 'type', 'amount', 'account', 'category', 'to_account', 'description', 'is_recurring'],
        ...(planned_operations || []).map(p => [
          p.id,
          p.name,
          p.type,
          p.amount,
          accountNames.get(p.account_id) || '',
          categoryNames.get(p.category_id) || '',
          p.to_account_id ? (accountNames.get(p.to_account_id) || '') : '',
          p.description || '',
          p.is_recurring,
        ]),
      ],
    },
    {
      range: 'Balance History!A1',
      values: [
        ['account', 'date', 'balance'],
        ...(balance_history || []).map(h => [
          accountNames.get(h.account_id) || '',
          h.date,
          h.balance,
        ]),
      ],
    },
  ];
};

const createSpreadsheet = async (accessToken) => {
  const response = await fetch(SHEETS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: 'Penny – export' },
      sheets: [
        { properties: { title: 'Accounts' } },
        { properties: { title: 'Operations' } },
        { properties: { title: 'Categories' } },
        { properties: { title: 'Budgets' } },
        { properties: { title: 'Planned Operations' } },
        { properties: { title: 'Balance History' } },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'create_spreadsheet_failed');
  }
  return data.spreadsheetId;
};

const clearSheets = async (accessToken, spreadsheetId, ranges) => {
  const response = await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ranges }),
  });
  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) {
      await signOut();
      throw new Error('refresh_failed');
    }
    throw new Error(data.error?.message || 'clear_sheets_failed');
  }
  await response.json().catch(() => {});
};

const writeSheets = async (accessToken, spreadsheetId, sheets) => {
  const response = await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: sheets.map(s => ({ range: s.range, values: s.values })),
    }),
  });
  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) {
      await signOut();
      throw new Error('refresh_failed');
    }
    if (response.status === 429) throw new Error('quota_exceeded');
    throw new Error(data.error?.message || 'write_sheets_failed');
  }
  await response.json().catch(() => {});
};

/**
 * Export all app data to Google Sheets.
 * @param {string} accessToken - Valid Google OAuth access token
 * @param {Object} backup - Backup object from createBackup()
 * @returns {Promise<string>} URL of the spreadsheet
 */
export const exportToSheets = async (accessToken, backup) => {
  let spreadsheetId = await getPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID);

  if (!spreadsheetId) {
    spreadsheetId = await createSpreadsheet(accessToken);
    await setPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID, spreadsheetId);
  }

  const sheets = buildSheetsData(backup);
  await clearSheets(accessToken, spreadsheetId, sheets.map(s => s.range.split('!')[0]));
  await writeSheets(accessToken, spreadsheetId, sheets);

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
};
```

- [ ] **Step 4: Run service tests — should pass**

Run:
```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```
Expected: All tests in `GoogleSheetsService.test.js` pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/GoogleSheetsService.js __tests__/services/GoogleSheetsService.test.js
git commit -m "feat(google-sheets): replace PKCE token management with GoogleSignin native SDK"
```

---

### Task 4: Update integration tests and refactor SettingsModal.js

**Files:**
- Modify: `__tests__/integration/GoogleSheetsExport.test.js`
- Modify: `app/modals/SettingsModal.js`

- [ ] **Step 1: Rewrite the integration test**

Replace the entire content of `__tests__/integration/GoogleSheetsExport.test.js` with:

```javascript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SettingsModal from '../../app/modals/SettingsModal';

const mockShowDialog = jest.fn();

jest.mock('../../app/services/GoogleSheetsService', () => ({
  getValidAccessToken: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  exportToSheets: jest.fn(),
}));

jest.mock('../../app/services/BackupRestore', () => ({
  exportBackup: jest.fn(),
  importBackup: jest.fn(),
  restoreBackup: jest.fn(),
  createBackup: jest.fn().mockResolvedValue({ data: {} }),
}));

jest.mock('../../app/services/DailyBackupService', () => ({
  getStoredBackups: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../app/services/AppUpdateService', () => ({
  checkForAppUpdate: jest.fn(),
}));

jest.mock('../../app/services/PreferencesDB', () => ({
  setPreference: jest.fn(),
  getPreference: jest.fn(),
  PREF_KEYS: {
    UPDATE_LAST_CHECK_AT: 'update_last_check_at',
    GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id',
  },
}));

jest.mock('../../app/hooks/useLogEntries', () => ({
  useLogEntries: () => ({ entries: [], clearLogs: jest.fn(), getExportText: jest.fn() }),
}));

jest.mock('../../app/contexts/ImportProgressContext', () => ({
  useImportProgress: () => ({
    startImport: jest.fn(),
    cancelImport: jest.fn(),
    completeImport: jest.fn(),
  }),
}));

jest.mock('../../app/contexts/UpdateDownloadContext', () => ({
  useUpdateDownload: () => ({ startDownload: jest.fn() }),
}));

jest.mock('../../app/contexts/DisplaySettingsContext', () => ({
  useDisplaySettings: () => ({ hideBalances: false, setHideBalances: jest.fn() }),
}));

jest.mock('../../app/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key) => key,
    language: 'en',
    setLanguage: jest.fn(),
    availableLanguages: ['en'],
  }),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: mockShowDialog }),
}));

jest.mock('../../app/contexts/AccountsActionsContext', () => ({
  useAccountsActions: () => ({ resetDatabase: jest.fn() }),
}));

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn(),
}));

const { getValidAccessToken, signIn, exportToSheets } =
  require('../../app/services/GoogleSheetsService');

describe('GoogleSheetsExport integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderModal = () =>
    render(<SettingsModal visible={true} onClose={jest.fn()} />);

  it('shows success dialog with Open button after successful export (already signed in)', async () => {
    getValidAccessToken.mockResolvedValue('access-token');
    exportToSheets.mockResolvedValue('https://docs.google.com/spreadsheets/d/sheet-123');

    const { getByTestId } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(mockShowDialog).toHaveBeenCalledWith(
        expect.stringContaining('google_sheets'),
        expect.stringContaining('google_sheets_export_success'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'google_sheets_open' }),
        ]),
      );
    });
  });

  it('falls back to signIn when not signed in, then exports successfully', async () => {
    getValidAccessToken.mockRejectedValue(new Error('not_signed_in'));
    signIn.mockResolvedValue('new-access-token');
    exportToSheets.mockResolvedValue('https://docs.google.com/spreadsheets/d/sheet-456');

    const { getByTestId } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(signIn).toHaveBeenCalled();
      expect(mockShowDialog).toHaveBeenCalledWith(
        expect.stringContaining('google_sheets'),
        expect.stringContaining('google_sheets_export_success'),
        expect.anything(),
      );
    });
  });

  it('shows sign-in error dialog when signIn fails', async () => {
    getValidAccessToken.mockRejectedValue(new Error('not_signed_in'));
    signIn.mockRejectedValue(new Error('auth_failed'));

    const { getByTestId } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(mockShowDialog).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('google_sheets_signin_failed'),
        expect.anything(),
      );
    });
  });

  it('shows revoked-access error when refresh fails', async () => {
    getValidAccessToken.mockRejectedValue(new Error('refresh_failed'));

    const { getByTestId } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(mockShowDialog).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('google_sheets_access_revoked'),
        expect.anything(),
      );
    });
  });

  it('silently returns when sign-in is cancelled', async () => {
    getValidAccessToken.mockRejectedValue(new Error('not_signed_in'));
    signIn.mockRejectedValue(new Error('sign_in_cancelled'));

    const { getByTestId } = renderModal();
    fireEvent.press(getByTestId('settings-export-row'));

    await waitFor(() => {
      fireEvent.press(getByTestId('settings-export-google-sheets'));
    });

    await waitFor(() => {
      expect(mockShowDialog).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run the new integration tests — they should fail (SettingsModal not yet updated)**

Run:
```bash
npm test -- --silent --testPathPattern="GoogleSheetsExport"
```
Expected: Failures because `SettingsModal.js` still imports from `expo-auth-session`.

- [ ] **Step 3: Rewrite SettingsModal.js — update imports and handleGoogleSheetsExport**

In `app/modals/SettingsModal.js`, make these changes:

**Remove lines 22–31** (WebBrowser import, Google import, GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI):
```javascript
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { getValidAccessToken, exchangeAndStoreTokens, exportToSheets } from '../services/GoogleSheetsService';

WebBrowser.maybeCompleteAuthSession();

// Android OAuth clients only accept reversed-client-ID scheme as redirect URI.
// expo-auth-session defaults to applicationId:/oauthredirect which Google rejects.
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const GOOGLE_REDIRECT_URI = `${GOOGLE_CLIENT_ID.split('.').reverse().join('.')}:/oauthredirect`;
```

**Replace with:**
```javascript
import { getValidAccessToken, signIn as googleSignIn, exportToSheets } from '../services/GoogleSheetsService';
```

**Remove lines 59–69** (the `useAuthRequest` hook):
```javascript
  const [request, , promptAsync] = Google.useAuthRequest(
    {
      androidClientId: GOOGLE_CLIENT_ID,
      redirectUri: GOOGLE_REDIRECT_URI,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
      shouldAutoExchangeCode: false,
    },
  );
```
(Delete this entire block — it's replaced by nothing; no hook needed.)

**Replace the entire `handleGoogleSheetsExport` function** (lines 203–262) with:
```javascript
  const handleGoogleSheetsExport = useCallback(async () => {
    closeExportFormatModal();
    setGoogleSheetsLoading(true);
    try {
      let accessToken;
      try {
        accessToken = await getValidAccessToken();
      } catch (authError) {
        if (authError.message === 'refresh_failed') {
          throw authError;
        }
        // Not signed in — trigger native sign-in UI
        accessToken = await googleSignIn();
      }
      const backup = await createBackup();
      const sheetUrl = await exportToSheets(accessToken, backup);
      showDialog(
        t('google_sheets') || 'Google Sheets',
        t('google_sheets_export_success') || 'Exported to Google Sheets',
        [
          { text: t('google_sheets_open') || 'Open', onPress: () => Linking.openURL(sheetUrl) },
          { text: t('ok') || 'OK' },
        ],
      );
    } catch (error) {
      if (error.message === 'sign_in_cancelled') {
        return; // User dismissed — no error dialog
      }
      let dialogMsg;
      if (error.message === 'refresh_failed') {
        dialogMsg = t('google_sheets_access_revoked') || 'Google access was revoked. Please sign in again.';
      } else if (error.message === 'auth_failed') {
        dialogMsg = t('google_sheets_signin_failed') || 'Google sign-in failed. Please try again.';
      } else if (error.message === 'quota_exceeded') {
        dialogMsg = t('google_sheets_quota_exceeded') || 'Google Sheets quota exceeded. Try again later.';
      } else if (error.message === 'Network request failed') {
        dialogMsg = t('google_sheets_no_network') || 'Export failed: no internet connection.';
      } else {
        dialogMsg = t('google_sheets_export_failed') || 'Export failed. Please try again.';
      }
      showDialog(t('error') || 'Error', dialogMsg, [{ text: t('ok') || 'OK' }]);
    } finally {
      setGoogleSheetsLoading(false);
    }
  }, [closeExportFormatModal, t, showDialog]);
```

Also remove `request` and `promptAsync` from the `handleGoogleSheetsExport` `useCallback` deps array (already done above — deps are now `[closeExportFormatModal, t, showDialog]`).

- [ ] **Step 4: Run integration tests — should pass**

Run:
```bash
npm test -- --silent --testPathPattern="GoogleSheetsExport"
```
Expected: All 5 tests in `GoogleSheetsExport.test.js` pass.

- [ ] **Step 5: Run the full test suite**

Run:
```bash
npm test -- --silent
```
Expected: All tests pass. Zero failures.

- [ ] **Step 6: Commit**

```bash
git add app/modals/SettingsModal.js __tests__/integration/GoogleSheetsExport.test.js
git commit -m "feat(google-sheets): replace PKCE OAuth flow with native GoogleSignin in SettingsModal"
```

---

### Task 5: Prebuild and verify on device

**Files:** None (native build only)

- [ ] **Step 1: Run prebuild to regenerate native Android project**

Run:
```bash
npx expo prebuild --clean --platform android
```
Expected: `android/` directory regenerated. The `android/app/src/main/AndroidManifest.xml` should NOT contain the reversed-client-ID scheme intent filter (it's gone). The `android/app/build.gradle` should contain the google-services plugin or the library's native setup.

- [ ] **Step 2: Start the app on emulator/device**

Run:
```bash
npx expo run:android
```
Expected: App builds and launches on the Android device/emulator.

- [ ] **Step 3: Manual verification**

1. Open Settings modal → Export → Google Sheets
2. **First time:** Native Google account picker appears (not a browser window)
3. Select a Google account
4. Export completes → "Exported to Google Sheets" dialog with "Open" button
5. Tap "Open" → spreadsheet opens in browser
6. **Second time:** Export runs without showing the account picker (cached sign-in)
7. Close app, reopen, export again → still no picker (persistent sign-in)

- [ ] **Step 4: Final commit with push**

```bash
git add -A
git commit -m "chore(google-sheets): verify native sign-in working end-to-end"
git push
```

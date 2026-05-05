# Google Sheets Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Sheets as a 4th export format in Settings, authenticating via OAuth PKCE and writing 6 sheets (Accounts, Operations, Categories, Budgets, Planned Operations, Balance History) to a persistent spreadsheet.

**Architecture:** A new `GoogleSheetsService.js` handles all auth (token exchange, secure storage, silent refresh) and Sheets API calls as plain async functions. `SettingsModal` owns only the `useAuthRequest`/`useAutoDiscovery` hooks (required by expo-auth-session) and passes `promptAsync` + `request.codeVerifier` into the service. Data is fetched via the existing `createBackup()` from `BackupRestore.js`.

**Tech Stack:** `expo-auth-session` (PKCE), `expo-web-browser` (auth browser), `expo-secure-store` (refresh token), Google Sheets REST API v4, existing `PreferencesDB` (spreadsheetId persistence).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `app/services/GoogleSheetsService.js` | Token exchange, refresh, secure storage, spreadsheet CRUD, data mapping |
| Create | `__tests__/services/GoogleSheetsService.test.js` | Unit tests for all service functions |
| Create | `__tests__/integration/GoogleSheetsExport.test.js` | Integration test: SettingsModal → service → dialog |
| Modify | `package.json` | Add expo-auth-session, expo-web-browser, expo-secure-store |
| Modify | `app/services/PreferencesDB.js` | Add `GOOGLE_SHEETS_SPREADSHEET_ID` to `PREF_KEYS` |
| Modify | `assets/i18n/en.json` | 9 new strings |
| Modify | `assets/i18n/de.json` | 9 new strings |
| Modify | `assets/i18n/es.json` | 9 new strings |
| Modify | `assets/i18n/fr.json` | 9 new strings |
| Modify | `assets/i18n/hy.json` | 9 new strings |
| Modify | `assets/i18n/it.json` | 9 new strings |
| Modify | `assets/i18n/ru.json` | 9 new strings |
| Modify | `assets/i18n/zh.json` | 9 new strings |
| Modify | `jest.setup.js` | Add mocks for 3 new packages |
| Modify | `app/modals/SettingsModal.js` | Add auth hooks, handler, Google Sheets UI option |

---

## Task 1: Install dependencies, add PREF_KEY, add i18n strings

**Files:**
- Modify: `package.json`
- Modify: `app/services/PreferencesDB.js`
- Modify: `assets/i18n/en.json`, `de.json`, `es.json`, `fr.json`, `hy.json`, `it.json`, `ru.json`, `zh.json`

- [ ] **Step 1: Install the three new packages**

```bash
npx expo install expo-auth-session expo-web-browser expo-secure-store
```

Expected: packages added to `package.json` and installed in `node_modules`.

- [ ] **Step 2: Add the PREF_KEY for spreadsheet ID**

In `app/services/PreferencesDB.js`, add one key to `PREF_KEYS`:

```js
export const PREF_KEYS = {
  THEME: 'theme_preference',
  LANGUAGE: 'app_language',
  LAST_ACCOUNT: 'last_accessed_account_id',
  OPERATIONS_FILTERS: 'operations_active_filters',
  UPDATE_LAST_CHECK_AT: 'update_last_check_at',
  UPDATE_LAST_PROMPTED_VERSION: 'update_last_prompted_version',
  UPDATE_SKIP_UNTIL: 'update_skip_until',
  HIDE_BALANCES: 'hide_balances',
  GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id',
};
```

- [ ] **Step 3: Add i18n strings to `assets/i18n/en.json`**

Add these 9 keys (anywhere in the file, e.g. after `"sqlite_description"`):

```json
"google_sheets": "Google Sheets",
"google_sheets_description": "Export to a Google Sheets spreadsheet",
"google_sheets_export_success": "Exported to Google Sheets",
"google_sheets_open": "Open",
"google_sheets_signin_failed": "Google sign-in failed. Please try again.",
"google_sheets_access_revoked": "Google access was revoked. Please sign in again.",
"google_sheets_no_network": "Export failed: no internet connection.",
"google_sheets_export_failed": "Export failed. Please try again.",
"google_sheets_quota_exceeded": "Google Sheets quota exceeded. Try again later."
```

- [ ] **Step 4: Add i18n strings to `assets/i18n/de.json`**

```json
"google_sheets": "Google Tabellen",
"google_sheets_description": "In eine Google Tabelle exportieren",
"google_sheets_export_success": "In Google Tabellen exportiert",
"google_sheets_open": "Öffnen",
"google_sheets_signin_failed": "Google-Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
"google_sheets_access_revoked": "Google-Zugriff wurde widerrufen. Bitte erneut anmelden.",
"google_sheets_no_network": "Export fehlgeschlagen: keine Internetverbindung.",
"google_sheets_export_failed": "Export fehlgeschlagen. Bitte erneut versuchen.",
"google_sheets_quota_exceeded": "Google Tabellen-Kontingent überschritten. Später erneut versuchen."
```

- [ ] **Step 5: Add i18n strings to `assets/i18n/es.json`**

```json
"google_sheets": "Google Sheets",
"google_sheets_description": "Exportar a una hoja de cálculo de Google Sheets",
"google_sheets_export_success": "Exportado a Google Sheets",
"google_sheets_open": "Abrir",
"google_sheets_signin_failed": "Error al iniciar sesión en Google. Inténtalo de nuevo.",
"google_sheets_access_revoked": "El acceso a Google fue revocado. Inicia sesión de nuevo.",
"google_sheets_no_network": "Exportación fallida: sin conexión a internet.",
"google_sheets_export_failed": "Exportación fallida. Inténtalo de nuevo.",
"google_sheets_quota_exceeded": "Cuota de Google Sheets superada. Inténtalo más tarde."
```

- [ ] **Step 6: Add i18n strings to `assets/i18n/fr.json`**

```json
"google_sheets": "Google Sheets",
"google_sheets_description": "Exporter vers une feuille de calcul Google Sheets",
"google_sheets_export_success": "Exporté vers Google Sheets",
"google_sheets_open": "Ouvrir",
"google_sheets_signin_failed": "Échec de la connexion Google. Veuillez réessayer.",
"google_sheets_access_revoked": "L'accès Google a été révoqué. Veuillez vous reconnecter.",
"google_sheets_no_network": "Échec de l'export : pas de connexion internet.",
"google_sheets_export_failed": "Échec de l'export. Veuillez réessayer.",
"google_sheets_quota_exceeded": "Quota Google Sheets dépassé. Réessayez plus tard."
```

- [ ] **Step 7: Add i18n strings to `assets/i18n/hy.json`**

```json
"google_sheets": "Google Sheets",
"google_sheets_description": "Արտահանել Google Sheets աղյուսակ",
"google_sheets_export_success": "Արտահանվել է Google Sheets-ում",
"google_sheets_open": "Բացել",
"google_sheets_signin_failed": "Google-ի մուտքը ձախողվեց: Կրկին փորձեք:",
"google_sheets_access_revoked": "Google-ի մուտքը հետ կանչվեց: Կրկին մուտք գործեք:",
"google_sheets_no_network": "Արտահանումը ձախողվեց. կապ չկա:",
"google_sheets_export_failed": "Արտահանումը ձախողվեց: Կրկին փորձեք:",
"google_sheets_quota_exceeded": "Google Sheets-ի քվոտան գերազանցված է: Ավելի ուշ կրկին փորձեք:"
```

- [ ] **Step 8: Add i18n strings to `assets/i18n/it.json`**

```json
"google_sheets": "Google Sheets",
"google_sheets_description": "Esporta in un foglio di calcolo Google Sheets",
"google_sheets_export_success": "Esportato su Google Sheets",
"google_sheets_open": "Apri",
"google_sheets_signin_failed": "Accesso Google fallito. Riprova.",
"google_sheets_access_revoked": "L'accesso a Google è stato revocato. Accedi di nuovo.",
"google_sheets_no_network": "Esportazione fallita: nessuna connessione internet.",
"google_sheets_export_failed": "Esportazione fallita. Riprova.",
"google_sheets_quota_exceeded": "Quota Google Sheets superata. Riprova più tardi."
```

- [ ] **Step 9: Add i18n strings to `assets/i18n/ru.json`**

```json
"google_sheets": "Google Таблицы",
"google_sheets_description": "Экспорт в таблицу Google Sheets",
"google_sheets_export_success": "Данные экспортированы в Google Таблицы",
"google_sheets_open": "Открыть",
"google_sheets_signin_failed": "Не удалось войти в Google. Попробуйте ещё раз.",
"google_sheets_access_revoked": "Доступ к Google отозван. Войдите снова.",
"google_sheets_no_network": "Экспорт не удался: нет подключения к интернету.",
"google_sheets_export_failed": "Экспорт не удался. Попробуйте ещё раз.",
"google_sheets_quota_exceeded": "Превышена квота Google Sheets. Попробуйте позже."
```

- [ ] **Step 10: Add i18n strings to `assets/i18n/zh.json`**

```json
"google_sheets": "Google 表格",
"google_sheets_description": "导出到 Google 表格电子表格",
"google_sheets_export_success": "已导出到 Google 表格",
"google_sheets_open": "打开",
"google_sheets_signin_failed": "Google 登录失败，请重试。",
"google_sheets_access_revoked": "Google 访问权限已被撤销，请重新登录。",
"google_sheets_no_network": "导出失败：无网络连接。",
"google_sheets_export_failed": "导出失败，请重试。",
"google_sheets_quota_exceeded": "Google 表格配额已超出，请稍后重试。"
```

- [ ] **Step 11: Verify existing tests still pass**

```bash
npm test -- --silent
```

Expected: all existing tests pass (0 failures).

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json app/services/PreferencesDB.js assets/i18n/
git commit -m "feat(google-sheets): install deps, add pref key, add i18n strings"
```

---

## Task 2: Add test mocks for new packages

**Files:**
- Modify: `jest.setup.js`

- [ ] **Step 1: Add mocks at the bottom of `jest.setup.js`** (before the `beforeAll` block)

```js
// Mock expo-auth-session
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

- [ ] **Step 2: Verify all existing tests still pass**

```bash
npm test -- --silent
```

Expected: 0 failures.

- [ ] **Step 3: Commit**

```bash
git add jest.setup.js
git commit -m "test(google-sheets): add mocks for expo-auth-session, expo-web-browser, expo-secure-store"
```

---

## Task 3: Test and implement token exchange and clear auth

**Files:**
- Create: `__tests__/services/GoogleSheetsService.test.js`
- Create: `app/services/GoogleSheetsService.js` (partial — token exchange only)

- [ ] **Step 1: Create the test file with failing tests for token exchange**

Create `__tests__/services/GoogleSheetsService.test.js`:

```js
import * as SecureStore from 'expo-secure-store';
import {
  exchangeAndStoreTokens,
  clearStoredAuth,
} from '../../app/services/GoogleSheetsService';

process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = 'test-client-id';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GoogleSheetsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('exchangeAndStoreTokens', () => {
    it('exchanges auth code for tokens and stores refresh token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-123',
          refresh_token: 'refresh-456',
        }),
      });
      SecureStore.setItemAsync.mockResolvedValue(undefined);

      const accessToken = await exchangeAndStoreTokens(
        'auth-code',
        'code-verifier',
        'com.heywood8.monkeep://',
      );

      expect(accessToken).toBe('access-123');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'google_refresh_token',
        'refresh-456',
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws when token endpoint returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'invalid_grant' }),
      });

      await expect(
        exchangeAndStoreTokens('bad-code', 'verifier', 'com.heywood8.monkeep://'),
      ).rejects.toThrow('token_exchange_failed');
    });
  });

  describe('clearStoredAuth', () => {
    it('deletes the refresh token from secure store', async () => {
      SecureStore.deleteItemAsync.mockResolvedValue(undefined);

      await clearStoredAuth();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('google_refresh_token');
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: FAIL — `Cannot find module '../../app/services/GoogleSheetsService'`

- [ ] **Step 3: Create `app/services/GoogleSheetsService.js` with token exchange and clear auth**

```js
import * as SecureStore from 'expo-secure-store';
import { getPreference, setPreference, PREF_KEYS } from './PreferencesDB';
import { createBackup } from './BackupRestore';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SECURE_STORE_KEY = 'google_refresh_token';

/**
 * Exchange an OAuth authorization code for access + refresh tokens.
 * Stores the refresh token in SecureStore.
 * @param {string} code - Auth code from OAuth redirect
 * @param {string} codeVerifier - PKCE code verifier from the auth request
 * @param {string} redirectUri - Redirect URI used in the auth request
 * @returns {Promise<string>} Access token
 */
export const exchangeAndStoreTokens = async (code, codeVerifier, redirectUri) => {
  const body = new URLSearchParams({
    code,
    client_id: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  }).toString();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error('token_exchange_failed');
  }

  await SecureStore.setItemAsync(SECURE_STORE_KEY, data.refresh_token);
  return data.access_token;
};

/**
 * Delete the stored refresh token (e.g. after revocation).
 */
export const clearStoredAuth = async () => {
  await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: PASS (exchangeAndStoreTokens and clearStoredAuth tests).

- [ ] **Step 5: Commit**

```bash
git add app/services/GoogleSheetsService.js __tests__/services/GoogleSheetsService.test.js
git commit -m "feat(google-sheets): implement token exchange and clearStoredAuth"
```

---

## Task 4: Test and implement silent token refresh

**Files:**
- Modify: `__tests__/services/GoogleSheetsService.test.js`
- Modify: `app/services/GoogleSheetsService.js`

- [ ] **Step 1: Add failing tests for `getValidAccessToken`**

Append inside the `describe('GoogleSheetsService')` block in `__tests__/services/GoogleSheetsService.test.js`:

```js
  describe('getValidAccessToken', () => {
    it('returns a new access token using the stored refresh token', async () => {
      SecureStore.getItemAsync.mockResolvedValue('stored-refresh-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'new-access-token' }),
      });

      const token = await getValidAccessToken();

      expect(token).toBe('new-access-token');
      expect(mockFetch).toHaveBeenCalledWith(
        TOKEN_ENDPOINT,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws no_refresh_token when no token is stored', async () => {
      SecureStore.getItemAsync.mockResolvedValue(null);

      await expect(getValidAccessToken()).rejects.toThrow('no_refresh_token');
    });

    it('clears stored token and throws refresh_failed when refresh returns 400', async () => {
      SecureStore.getItemAsync.mockResolvedValue('bad-refresh-token');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'invalid_grant' }),
      });
      SecureStore.deleteItemAsync.mockResolvedValue(undefined);

      await expect(getValidAccessToken()).rejects.toThrow('refresh_failed');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('google_refresh_token');
    });
  });
```

Also add `TOKEN_ENDPOINT` constant and `getValidAccessToken` to the import at the top:

```js
import {
  exchangeAndStoreTokens,
  clearStoredAuth,
  getValidAccessToken,
  TOKEN_ENDPOINT,
} from '../../app/services/GoogleSheetsService';
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: 3 new failures for `getValidAccessToken`.

- [ ] **Step 3: Add `getValidAccessToken` to `app/services/GoogleSheetsService.js`** and export `TOKEN_ENDPOINT`

Add after `clearStoredAuth`:

```js
export { TOKEN_ENDPOINT };

/**
 * Get a valid access token using the stored refresh token.
 * Throws 'no_refresh_token' if no refresh token is stored.
 * Throws 'refresh_failed' if the refresh request fails (clears stored token).
 * @returns {Promise<string>} Access token
 */
export const getValidAccessToken = async () => {
  const refreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEY);
  if (!refreshToken) {
    throw new Error('no_refresh_token');
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    grant_type: 'refresh_token',
  }).toString();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEY);
    throw new Error('refresh_failed');
  }

  return data.access_token;
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/GoogleSheetsService.js __tests__/services/GoogleSheetsService.test.js
git commit -m "feat(google-sheets): implement silent token refresh"
```

---

## Task 5: Test and implement data mapping

**Files:**
- Modify: `__tests__/services/GoogleSheetsService.test.js`
- Modify: `app/services/GoogleSheetsService.js`

- [ ] **Step 1: Add failing tests for `buildSheetsData`**

Append inside the `describe('GoogleSheetsService')` block:

```js
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
      expect(ops.values[1][5]).toBe('Food');    // category name
      expect(ops.values[1][6]).toBe('Checking'); // account name
      expect(ops.values[1][7]).toBe('');          // to_account empty
    });

    it('includes all categories including shadow ones', () => {
      const sheets = buildSheetsData(mockBackup);
      const cats = sheets.find(s => s.range.startsWith('Categories'));
      expect(cats.values).toHaveLength(3); // header + 2 categories (including shadow)
    });

    it('maps Budgets sheet with category name instead of id', () => {
      const sheets = buildSheetsData(mockBackup);
      const budgets = sheets.find(s => s.range.startsWith('Budgets'));
      expect(budgets.values[1][1]).toBe('Food'); // category name
    });

    it('maps Planned Operations with account and category names', () => {
      const sheets = buildSheetsData(mockBackup);
      const planned = sheets.find(s => s.range.startsWith('Planned Operations'));
      expect(planned.values[1][1]).toBe('Rent');
      expect(planned.values[1][4]).toBe('Checking'); // account name
      expect(planned.values[1][5]).toBe('Food');     // category name
    });

    it('maps Balance History with account name instead of id', () => {
      const sheets = buildSheetsData(mockBackup);
      const history = sheets.find(s => s.range.startsWith('Balance History'));
      expect(history.values[0]).toEqual(['account', 'date', 'balance']);
      expect(history.values[1][0]).toBe('Checking'); // account name
    });
  });
```

Add `buildSheetsData` to the import at top of the test file:

```js
import {
  exchangeAndStoreTokens,
  clearStoredAuth,
  getValidAccessToken,
  buildSheetsData,
  TOKEN_ENDPOINT,
} from '../../app/services/GoogleSheetsService';
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: 7 new failures for `buildSheetsData`.

- [ ] **Step 3: Add `buildSheetsData` to `app/services/GoogleSheetsService.js`**

```js
/**
 * Build the 6-sheet data structure from a backup object.
 * Uses human-readable account/category names in place of IDs.
 * All categories included (including shadow). All balances shown as-is.
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/GoogleSheetsService.js __tests__/services/GoogleSheetsService.test.js
git commit -m "feat(google-sheets): implement buildSheetsData for 6-sheet export"
```

---

## Task 6: Test and implement full export flow

**Files:**
- Modify: `__tests__/services/GoogleSheetsService.test.js`
- Modify: `app/services/GoogleSheetsService.js`

- [ ] **Step 1: Add failing tests for `exportToSheets`**

Add to the top-level imports in the test file:

```js
import {
  exchangeAndStoreTokens,
  clearStoredAuth,
  getValidAccessToken,
  buildSheetsData,
  exportToSheets,
  TOKEN_ENDPOINT,
} from '../../app/services/GoogleSheetsService';

jest.mock('../../app/services/PreferencesDB', () => ({
  PREF_KEYS: { GOOGLE_SHEETS_SPREADSHEET_ID: 'google_sheets_spreadsheet_id' },
  getPreference: jest.fn(),
  setPreference: jest.fn(),
}));
```

Then append these tests inside the `describe('GoogleSheetsService')` block:

```js
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
      getPreference.mockResolvedValue(null); // no stored spreadsheetId
      setPreference.mockResolvedValue(undefined);

      // POST /v4/spreadsheets → create
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ spreadsheetId: 'new-sheet-id' }),
      });
      // POST batchClear
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // POST batchUpdate
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const url = await exportToSheets('access-token', mockBackup);

      expect(url).toBe('https://docs.google.com/spreadsheets/d/new-sheet-id');
      expect(setPreference).toHaveBeenCalledWith('google_sheets_spreadsheet_id', 'new-sheet-id');
    });

    it('updates existing spreadsheet without creating a new one on re-export', async () => {
      getPreference.mockResolvedValue('existing-sheet-id');

      // POST batchClear
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      // POST batchUpdate
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const url = await exportToSheets('access-token', mockBackup);

      expect(url).toBe('https://docs.google.com/spreadsheets/d/existing-sheet-id');
      // Only 2 fetch calls (clear + write), not 3 (create + clear + write)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(setPreference).not.toHaveBeenCalled();
    });

    it('throws quota_exceeded when batchUpdate returns 429', async () => {
      getPreference.mockResolvedValue('sheet-id');
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // batchClear
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Quota exceeded' } }),
      }); // batchUpdate

      await expect(exportToSheets('access-token', mockBackup)).rejects.toThrow('quota_exceeded');
    });
  });
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: 3 new failures for `exportToSheets`.

- [ ] **Step 3: Add `exportToSheets` and helpers to `app/services/GoogleSheetsService.js`**

```js
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
    throw new Error(data.error?.message || 'clear_sheets_failed');
  }
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
    if (response.status === 429) throw new Error('quota_exceeded');
    throw new Error(data.error?.message || 'write_sheets_failed');
  }
};

/**
 * Export all app data to Google Sheets.
 * Creates the spreadsheet on first call; updates it on subsequent calls.
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

- [ ] **Step 4: Run all service tests to confirm they pass**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: all tests pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npm test -- --silent
```

Expected: 0 failures.

- [ ] **Step 6: Commit**

```bash
git add app/services/GoogleSheetsService.js __tests__/services/GoogleSheetsService.test.js
git commit -m "feat(google-sheets): implement exportToSheets, createSpreadsheet, batchClear, batchUpdate"
```

---

## Task 7: Integration test and SettingsModal implementation

**Files:**
- Create: `__tests__/integration/GoogleSheetsExport.test.js`
- Modify: `app/modals/SettingsModal.js`

- [ ] **Step 1: Write the failing integration test**

Create `__tests__/integration/GoogleSheetsExport.test.js`:

```js
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SettingsModal from '../../app/modals/SettingsModal';

jest.mock('../../app/services/GoogleSheetsService', () => ({
  getValidAccessToken: jest.fn(),
  exchangeAndStoreTokens: jest.fn(),
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
  useDialog: () => ({ showDialog: jest.fn() }),
}));

jest.mock('../../app/contexts/AccountsActionsContext', () => ({
  useAccountsActions: () => ({ resetDatabase: jest.fn() }),
}));

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn(),
}));

const { getValidAccessToken, exchangeAndStoreTokens, exportToSheets } =
  require('../../app/services/GoogleSheetsService');

const { useDialog } = require('../../app/contexts/DialogContext');

describe('GoogleSheetsExport integration', () => {
  const mockShowDialog = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useDialog.mockReturnValue({ showDialog: mockShowDialog });
  });

  const renderModal = () =>
    render(<SettingsModal visible={true} onClose={jest.fn()} />);

  it('shows success dialog with Open button after successful export', async () => {
    getValidAccessToken.mockResolvedValue('access-token');
    exportToSheets.mockResolvedValue(
      'https://docs.google.com/spreadsheets/d/sheet-123',
    );

    const { getByTestId } = renderModal();

    // Open export sub-panel
    fireEvent.press(getByTestId('settings-export-row'));

    // Tap Google Sheets option
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

  it('shows sign-in error dialog when auth fails', async () => {
    getValidAccessToken.mockRejectedValue(new Error('no_refresh_token'));

    // promptAsync returns failure
    const { useAuthRequest } = require('expo-auth-session');
    useAuthRequest.mockReturnValue([
      { codeVerifier: 'verifier' },
      null,
      jest.fn().mockResolvedValue({ type: 'error' }),
    ]);

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

    const { useAuthRequest } = require('expo-auth-session');
    useAuthRequest.mockReturnValue([
      { codeVerifier: 'verifier' },
      null,
      jest.fn().mockResolvedValue({ type: 'error' }),
    ]);

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
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsExport"
```

Expected: FAIL — `settings-export-google-sheets` testID not found.

- [ ] **Step 3: Add imports and module-level call at the top of `app/modals/SettingsModal.js`**

After the existing imports, add:

```js
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuthRequest, useAutoDiscovery, makeRedirectUri } from 'expo-auth-session';
import { getValidAccessToken, exchangeAndStoreTokens, exportToSheets } from '../services/GoogleSheetsService';
import { createBackup } from '../services/BackupRestore';

WebBrowser.maybeCompleteAuthSession();
```

- [ ] **Step 4: Add auth hooks and handler inside the `SettingsModal` component**

Add after the existing `useState` declarations (around line 46):

```js
const discovery = useAutoDiscovery('https://accounts.google.com');
const [request, , promptAsync] = useAuthRequest(
  {
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
    redirectUri: makeRedirectUri({ scheme: 'com.heywood8.monkeep' }),
  },
  discovery,
);
const [googleSheetsLoading, setGoogleSheetsLoading] = useState(false);
```

Add the handler after `handleExportFormatSelect` (around line 178):

```js
const handleGoogleSheetsExport = useCallback(async () => {
  closeExportFormatModal();
  setGoogleSheetsLoading(true);
  try {
    let accessToken;
    try {
      accessToken = await getValidAccessToken();
    } catch {
      const result = await promptAsync();
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return;
      }
      if (result.type !== 'success') {
        throw new Error('auth_failed');
      }
      accessToken = await exchangeAndStoreTokens(
        result.params.code,
        request.codeVerifier,
        makeRedirectUri({ scheme: 'com.heywood8.monkeep' }),
      );
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
}, [closeExportFormatModal, promptAsync, request, t, showDialog]);
```

- [ ] **Step 5: Add Google Sheets option to the export format sub-panel in the JSX**

In the export format `ScrollView` (around line 745), after the SQLite `TouchableRipple` block and before `</ScrollView>`, add:

```jsx
<TouchableRipple
  onPress={handleGoogleSheetsExport}
  style={styles.languageItem}
  disabled={googleSheetsLoading}
  testID="settings-export-google-sheets"
>
  <View style={styles.languageItemContent}>
    <View style={styles.formatItemRow}>
      <Ionicons name="logo-google" size={24} color={colors.text} />
      <View style={styles.formatTextContainer}>
        <Text style={[styles.languageItemText, { color: colors.text }]}>
          Google Sheets
        </Text>
        <Text style={[styles.formatDescription, { color: colors.mutedText }]}>
          {t('google_sheets_description') || 'Export to a Google Sheets spreadsheet'}
        </Text>
      </View>
    </View>
    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
  </View>
</TouchableRipple>
```

- [ ] **Step 6: Run integration tests to confirm they pass**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsExport"
```

Expected: all 3 tests pass.

- [ ] **Step 7: Run the full test suite to confirm zero regressions**

```bash
npm test -- --silent
```

Expected: 0 failures.

- [ ] **Step 8: Commit**

```bash
git add app/modals/SettingsModal.js __tests__/integration/GoogleSheetsExport.test.js
git commit -m "feat(google-sheets): add Google Sheets export option to SettingsModal"
```

---

## Done

All tasks complete. The feature is live: Settings → Export → Google Sheets triggers PKCE auth, creates or updates a persistent spreadsheet with 6 sheets, and shows a success dialog with an Open link.

# Default Account Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Default account" preference that pins a specific account as pre-selected in the QuickAdd form, falling back to "Latest used" if not set or if the pinned account is deleted.

**Architecture:** New `DEFAULT_ACCOUNT_ID` key in `PreferencesDB`; `useQuickAddForm` checks it before `getLastAccessedAccount`; `AccountsActionsContext.deleteAccount` clears it if the deleted account matches; `SettingsScreen` gets a new row + `'defaultAccount'` subpanel that lists accounts and saves the selection instantly.

**Tech Stack:** React Native, SQLite via `PreferencesDB` key-value store, React Context API, Jest + React Native Testing Library.

---

## File Map

### Modified
- `app/services/PreferencesDB.js` — add `DEFAULT_ACCOUNT_ID` key + two helpers
- `app/hooks/useQuickAddForm.js` — check default account before last-accessed
- `app/contexts/AccountsActionsContext.js` — clear default pref on delete
- `app/screens/SettingsScreen.js` — new settings row + `'defaultAccount'` subpanel
- `assets/i18n/en.json` (+ 10 other language files) — two new keys

### Test files (add to existing or create)
- `__tests__/services/PreferencesDB.test.js`
- `__tests__/hooks/useQuickAddForm.test.js`
- `__tests__/contexts/AccountsActionsContext.test.js`
- `__tests__/screens/SettingsScreen.test.js`

---

## Task 1: PreferencesDB — add DEFAULT_ACCOUNT_ID key and helpers

**Files:**
- Modify: `app/services/PreferencesDB.js`
- Modify: `__tests__/services/PreferencesDB.test.js`

- [ ] **Step 1: Write the failing tests**

Open `__tests__/services/PreferencesDB.test.js`. The file already declares `mockQueryFirst` and `mockExecuteQuery` and imports from `PreferencesDB`. First update the import line to include the two new exports:

```javascript
// Find the existing import (something like):
import { PREF_KEYS, getPreference, setPreference, ... } from '../../app/services/PreferencesDB';
// Add getDefaultAccountId and setDefaultAccountId to the same import.
```

Then add these describe blocks at the end of the file:

```javascript
describe('DEFAULT_ACCOUNT_ID key', () => {
  it('is defined in PREF_KEYS', () => {
    expect(PREF_KEYS.DEFAULT_ACCOUNT_ID).toBe('default_account_id');
  });
});

describe('getDefaultAccountId', () => {
  it('returns null when preference is not set', async () => {
    mockQueryFirst.mockResolvedValueOnce(null);
    const result = await getDefaultAccountId();
    expect(result).toBeNull();
  });

  it('returns numeric id when preference is set', async () => {
    mockQueryFirst.mockResolvedValueOnce({ value: '42' });
    const result = await getDefaultAccountId();
    expect(result).toBe(42);
  });

  it('returns null on db error', async () => {
    mockQueryFirst.mockRejectedValueOnce(new Error('db error'));
    const result = await getDefaultAccountId();
    expect(result).toBeNull();
  });
});

describe('setDefaultAccountId', () => {
  it('stores id as string in app_metadata when id is provided', async () => {
    mockExecuteQuery.mockResolvedValueOnce(undefined);
    await setDefaultAccountId(42);
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO app_metadata'),
      ['default_account_id', '42', expect.any(String)],
    );
  });

  it('deletes preference when id is null', async () => {
    mockExecuteQuery.mockResolvedValueOnce(undefined);
    await setDefaultAccountId(null);
    expect(mockExecuteQuery).toHaveBeenCalledWith(
      'DELETE FROM app_metadata WHERE key = ?',
      ['default_account_id'],
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- --silent --testPathPattern="PreferencesDB"
```

Expected: FAIL — `getDefaultAccountId is not a function` and `PREF_KEYS.DEFAULT_ACCOUNT_ID` is undefined.

- [ ] **Step 3: Add key to PREF_KEYS**

In `app/services/PreferencesDB.js`, change:

```javascript
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

To:

```javascript
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
  DEFAULT_ACCOUNT_ID: 'default_account_id',
};
```

- [ ] **Step 4: Add the two helper functions**

Append at the end of `app/services/PreferencesDB.js` (after `getAllPreferences`):

```javascript
/**
 * Get the pinned default account ID for QuickAdd
 * @returns {Promise<number|null>} Account ID or null ("Latest used" mode)
 */
export const getDefaultAccountId = async () => {
  try {
    return await getNumberPreference(PREF_KEYS.DEFAULT_ACCOUNT_ID, null);
  } catch (e) {
    console.error('[PreferencesDB] Failed to get default account:', e);
    return null;
  }
};

/**
 * Set the pinned default account ID for QuickAdd
 * @param {number|null} id - Account ID to pin, or null to revert to "Latest used"
 */
export const setDefaultAccountId = async (id) => {
  try {
    if (id === null) {
      await deletePreference(PREF_KEYS.DEFAULT_ACCOUNT_ID);
    } else {
      await setPreference(PREF_KEYS.DEFAULT_ACCOUNT_ID, String(id));
    }
  } catch (e) {
    console.error('[PreferencesDB] Failed to set default account:', e);
  }
};
```

- [ ] **Step 5: Run tests to confirm they pass**

```
npm test -- --silent --testPathPattern="PreferencesDB"
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/services/PreferencesDB.js __tests__/services/PreferencesDB.test.js
git commit -m "feat: add DEFAULT_ACCOUNT_ID preference key and helpers to PreferencesDB"
```

---

## Task 2: useQuickAddForm — check pinned default before last-accessed

**Files:**
- Modify: `app/hooks/useQuickAddForm.js`
- Create or modify: `__tests__/hooks/useQuickAddForm.test.js`

- [ ] **Step 1: Write the failing tests**

If `__tests__/hooks/useQuickAddForm.test.js` does not exist, create it with the full content below. If it already exists, add the `describe` block to it.

```javascript
import { renderHook, waitFor } from '@testing-library/react-native';
import useQuickAddForm from '../../app/hooks/useQuickAddForm';
import { getDefaultAccountId } from '../../app/services/PreferencesDB';
import { getLastAccessedAccount } from '../../app/services/LastAccount';

jest.mock('../../app/services/PreferencesDB', () => ({
  getDefaultAccountId: jest.fn(),
}));

jest.mock('../../app/services/LastAccount', () => ({
  getLastAccessedAccount: jest.fn(),
}));

jest.mock('../../app/services/OperationsDB', () => ({
  getTopCategoriesFromLastMonth: jest.fn().mockResolvedValue([]),
  getTopTransferTargetAccounts: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../app/services/currency', () => ({
  fetchLiveExchangeRate: jest.fn().mockResolvedValue({ rate: null, source: null }),
  getExchangeRate: jest.fn().mockReturnValue(null),
  formatAmount: jest.fn((val) => String(val)),
}));

jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: { on: jest.fn(() => jest.fn()), emit: jest.fn() },
  EVENTS: { OPERATION_CHANGED: 'op_changed', RELOAD_ALL: 'reload_all' },
}));

const mockAccounts = [
  { id: 1, name: 'Savings', currency: 'USD', balance: '100' },
  { id: 2, name: 'Checking', currency: 'EUR', balance: '200' },
];
const mockT = (key) => key;

describe('useQuickAddForm — default account selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects pinned default account when it is set and visible', async () => {
    getDefaultAccountId.mockResolvedValue(2);
    getLastAccessedAccount.mockResolvedValue(1);

    const { result } = renderHook(() =>
      useQuickAddForm(mockAccounts, mockAccounts, [], mockT),
    );

    await waitFor(() => {
      expect(result.current.quickAddValues.accountId).toBe(2);
    });
  });

  it('falls back to last-accessed when pinned default is not in visible list', async () => {
    getDefaultAccountId.mockResolvedValue(99); // not in mockAccounts
    getLastAccessedAccount.mockResolvedValue(1);

    const { result } = renderHook(() =>
      useQuickAddForm(mockAccounts, mockAccounts, [], mockT),
    );

    await waitFor(() => {
      expect(result.current.quickAddValues.accountId).toBe(1);
    });
  });

  it('falls back to first-by-id when neither default nor last-accessed is valid', async () => {
    getDefaultAccountId.mockResolvedValue(null);
    getLastAccessedAccount.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useQuickAddForm(mockAccounts, mockAccounts, [], mockT),
    );

    await waitFor(() => {
      expect(result.current.quickAddValues.accountId).toBe(1); // id 1 sorts first
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- --silent --testPathPattern="useQuickAddForm"
```

Expected: FAIL — hook never calls `getDefaultAccountId`, so the pinned-default test fails.

- [ ] **Step 3: Add the PreferencesDB import**

In `app/hooks/useQuickAddForm.js`, change:

```javascript
import { getLastAccessedAccount } from '../services/LastAccount';
```

To:

```javascript
import { getLastAccessedAccount } from '../services/LastAccount';
import { getDefaultAccountId } from '../services/PreferencesDB';
```

- [ ] **Step 4: Update the setDefaultAccount logic**

In `app/hooks/useQuickAddForm.js`, change the `else if` branch inside the `setDefaultAccount` async function:

```javascript
      } else if (visibleAccounts.length > 1) {
        const lastId = await getLastAccessedAccount();
        let resolvedAcc;
        if (lastId && visibleAccounts.some(acc => acc.id === lastId)) {
          resolvedAcc = visibleAccounts.find(acc => acc.id === lastId);
        } else {
          resolvedAcc = visibleAccounts.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0];
        }
        setQuickAddValues(v => ({ ...v, accountId: resolvedAcc.id, operationCurrency: resolvedAcc.currency || v.operationCurrency }));
      }
```

To:

```javascript
      } else if (visibleAccounts.length > 1) {
        const defaultId = await getDefaultAccountId();
        let resolvedAcc;
        if (defaultId && visibleAccounts.some(acc => acc.id === defaultId)) {
          resolvedAcc = visibleAccounts.find(acc => acc.id === defaultId);
        } else {
          const lastId = await getLastAccessedAccount();
          if (lastId && visibleAccounts.some(acc => acc.id === lastId)) {
            resolvedAcc = visibleAccounts.find(acc => acc.id === lastId);
          } else {
            resolvedAcc = visibleAccounts.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0];
          }
        }
        setQuickAddValues(v => ({ ...v, accountId: resolvedAcc.id, operationCurrency: resolvedAcc.currency || v.operationCurrency }));
      }
```

- [ ] **Step 5: Run tests to confirm they pass**

```
npm test -- --silent --testPathPattern="useQuickAddForm"
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/hooks/useQuickAddForm.js __tests__/hooks/useQuickAddForm.test.js
git commit -m "feat: check pinned default account before last-accessed in useQuickAddForm"
```

---

## Task 3: AccountsActionsContext — clear default pref on delete

**Files:**
- Modify: `app/contexts/AccountsActionsContext.js`
- Create or modify: `__tests__/contexts/AccountsActionsContext.test.js`

- [ ] **Step 1: Write the failing tests**

If `__tests__/contexts/AccountsActionsContext.test.js` does not exist, create it with the content below. If it already exists, add the `describe` block.

```javascript
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AccountsActionsProvider, useAccountsActions } from '../../app/contexts/AccountsActionsContext';
import { getDefaultAccountId, setDefaultAccountId } from '../../app/services/PreferencesDB';

jest.mock('../../app/services/AccountsDB', () => ({
  deleteAccount: jest.fn().mockResolvedValue(undefined),
  createAccount: jest.fn(),
  getAllAccounts: jest.fn().mockResolvedValue([]),
  updateAccount: jest.fn(),
  adjustAccountBalance: jest.fn(),
  reorderAccounts: jest.fn(),
  getOperationCount: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../app/services/PreferencesDB', () => ({
  getDefaultAccountId: jest.fn(),
  setDefaultAccountId: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../app/contexts/DialogContext', () => ({
  useDialog: () => ({ showDialog: jest.fn() }),
}));

jest.mock('../../app/services/eventEmitter', () => ({
  appEvents: { emit: jest.fn(), on: jest.fn(() => jest.fn()) },
  EVENTS: { RELOAD_ALL: 'reload_all', DATABASE_RESET: 'db_reset' },
}));

const mockSetAccounts = jest.fn();

jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: () => ({
    accounts: [
      { id: 3, name: 'Cash', currency: 'USD', balance: '50' },
      { id: 5, name: 'Bank', currency: 'USD', balance: '500' },
    ],
    visibleAccounts: [
      { id: 3, name: 'Cash', currency: 'USD', balance: '50' },
      { id: 5, name: 'Bank', currency: 'USD', balance: '500' },
    ],
    _setAccounts: mockSetAccounts,
    _setLoading: jest.fn(),
    _setShowHiddenAccounts: jest.fn(),
    _initializeDefaultAccounts: jest.fn().mockResolvedValue([]),
  }),
}));

const wrapper = ({ children }) => (
  <AccountsActionsProvider>{children}</AccountsActionsProvider>
);

describe('deleteAccount — default account cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetAccounts.mockImplementation(fn => fn([]));
  });

  it('clears default account pref when deleted account is the pinned default', async () => {
    getDefaultAccountId.mockResolvedValue(5);

    const { result } = renderHook(() => useAccountsActions(), { wrapper });

    await act(async () => {
      await result.current.deleteAccount(5);
    });

    expect(setDefaultAccountId).toHaveBeenCalledWith(null);
  });

  it('does not touch default account pref when a different account is deleted', async () => {
    getDefaultAccountId.mockResolvedValue(5);

    const { result } = renderHook(() => useAccountsActions(), { wrapper });

    await act(async () => {
      await result.current.deleteAccount(3);
    });

    expect(setDefaultAccountId).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- --silent --testPathPattern="AccountsActionsContext"
```

Expected: FAIL — `setDefaultAccountId` is never called by `deleteAccount`.

- [ ] **Step 3: Add the PreferencesDB import**

In `app/contexts/AccountsActionsContext.js`, after the existing imports, add:

```javascript
import { getDefaultAccountId, setDefaultAccountId } from '../services/PreferencesDB';
```

- [ ] **Step 4: Update deleteAccount to clear the pref**

In `app/contexts/AccountsActionsContext.js`, change:

```javascript
      await AccountsDB.deleteAccount(id, transferToAccountId);
      _setAccounts(accs => accs.filter(a => a.id !== id));

      // If operations were transferred, reload all accounts to reflect balance changes
```

To:

```javascript
      await AccountsDB.deleteAccount(id, transferToAccountId);
      _setAccounts(accs => accs.filter(a => a.id !== id));

      const currentDefault = await getDefaultAccountId();
      if (currentDefault === id) {
        await setDefaultAccountId(null);
      }

      // If operations were transferred, reload all accounts to reflect balance changes
```

- [ ] **Step 5: Run tests to confirm they pass**

```
npm test -- --silent --testPathPattern="AccountsActionsContext"
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/contexts/AccountsActionsContext.js __tests__/contexts/AccountsActionsContext.test.js
git commit -m "feat: clear default account preference when pinned account is deleted"
```

---

## Task 4: i18n — add translation keys to all 11 language files

**Files:** `assets/i18n/*.json` (all 11 files)

- [ ] **Step 1: Add keys to en.json**

In `assets/i18n/en.json`, find `"all_accounts"` and add the two new keys after it:

```json
"default_account": "Default account",
"latest_used": "Latest used",
```

- [ ] **Step 2: Add keys to the remaining 10 files**

In each file, add the two keys in the accounts section (or before the closing `}`):

**`assets/i18n/ru.json`:**
```json
"default_account": "Счёт по умолчанию",
"latest_used": "Последний использованный",
```

**`assets/i18n/es.json`:**
```json
"default_account": "Cuenta predeterminada",
"latest_used": "Último usado",
```

**`assets/i18n/fr.json`:**
```json
"default_account": "Compte par défaut",
"latest_used": "Dernier utilisé",
```

**`assets/i18n/de.json`:**
```json
"default_account": "Standardkonto",
"latest_used": "Zuletzt verwendet",
```

**`assets/i18n/it.json`:**
```json
"default_account": "Conto predefinito",
"latest_used": "Ultimo usato",
```

**`assets/i18n/zh.json`:**
```json
"default_account": "默认账户",
"latest_used": "最近使用",
```

**`assets/i18n/hy.json`:**
```json
"default_account": "Default account",
"latest_used": "Latest used",
```

**`assets/i18n/ja.json`:**
```json
"default_account": "デフォルト口座",
"latest_used": "最後に使用",
```

**`assets/i18n/ko.json`:**
```json
"default_account": "기본 계좌",
"latest_used": "최근 사용",
```

**`assets/i18n/pt.json`:**
```json
"default_account": "Conta padrão",
"latest_used": "Último usado",
```

- [ ] **Step 3: Commit**

```bash
git add assets/i18n/
git commit -m "feat(i18n): add default_account and latest_used keys for all 11 languages"
```

---

## Task 5: SettingsScreen — row and subpanel

**Files:**
- Modify: `app/screens/SettingsScreen.js`
- Modify: `__tests__/screens/SettingsScreen.test.js`

- [ ] **Step 1: Write the failing tests**

Open `__tests__/screens/SettingsScreen.test.js`. At the top of the file (with the other `const mock...` declarations), add:

```javascript
const mockGetDefaultAccountId = jest.fn(() => Promise.resolve(null));
const mockSetDefaultAccountId = jest.fn(() => Promise.resolve());
const mockVisibleAccounts = [
  { id: 1, name: 'Savings', currency: 'USD', balance: '100' },
  { id: 2, name: 'Checking', currency: 'EUR', balance: '200' },
];
```

Add this mock block alongside the existing `jest.mock(...)` calls:

```javascript
jest.mock('../../app/contexts/AccountsDataContext', () => ({
  useAccountsData: () => ({
    visibleAccounts: mockVisibleAccounts,
  }),
}));
```

**Note:** Check if `PreferencesDB` is already mocked in this file. If so, add `getDefaultAccountId` and `setDefaultAccountId` to the existing mock object. If it is not mocked yet, add:

```javascript
jest.mock('../../app/services/PreferencesDB', () => ({
  getPreference: jest.fn(() => Promise.resolve(null)),
  setPreference: jest.fn(() => Promise.resolve()),
  PREF_KEYS: {
    THEME: 'theme_preference',
    LANGUAGE: 'app_language',
    LAST_ACCOUNT: 'last_accessed_account_id',
    HIDE_BALANCES: 'hide_balances',
    DEFAULT_ACCOUNT_ID: 'default_account_id',
  },
  getDefaultAccountId: (...args) => mockGetDefaultAccountId(...args),
  setDefaultAccountId: (...args) => mockSetDefaultAccountId(...args),
}));
```

Add this describe block at the end of the test file:

```javascript
describe('Default account setting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDefaultAccountId.mockResolvedValue(null);
  });

  it('renders the default account settings row', async () => {
    const { getByTestId } = render(
      <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
    );
    await waitFor(() => {
      expect(getByTestId('settings-default-account-row')).toBeTruthy();
    });
  });

  it('shows latest_used subtitle when no account is pinned', async () => {
    mockGetDefaultAccountId.mockResolvedValue(null);
    const { getByTestId, getByText } = render(
      <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
    );
    await waitFor(() => getByTestId('settings-default-account-row'));
    // t() returns the key itself in tests
    expect(getByText('latest_used')).toBeTruthy();
  });

  it('opens defaultAccount subpanel when row is tapped', async () => {
    const { getByTestId } = render(
      <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
    );
    await waitFor(() => getByTestId('settings-default-account-row'));
    fireEvent.press(getByTestId('settings-default-account-row'));
    await waitFor(() => {
      expect(getByTestId('settings-default-account-panel')).toBeTruthy();
    });
  });

  it('shows Latest used option in subpanel', async () => {
    const { getByTestId } = render(
      <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
    );
    await waitFor(() => getByTestId('settings-default-account-row'));
    fireEvent.press(getByTestId('settings-default-account-row'));
    await waitFor(() => {
      expect(getByTestId('default-account-option-null')).toBeTruthy();
    });
  });

  it('shows an option for each visible account in the subpanel', async () => {
    const { getByTestId } = render(
      <SettingsScreen setSubPanelActive={mockSetSubPanelActive} />,
    );
    await waitFor(() => getByTestId('settings-default-account-row'));
    fireEvent.press(getByTestId('settings-default-account-row'));
    await waitFor(() => {
      expect(getByTestId('default-account-option-1')).toBeTruthy();
      expect(getByTestId('default-account-option-2')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- --silent --testPathPattern="SettingsScreen"
```

Expected: FAIL — testIDs not found.

- [ ] **Step 3: Add imports to SettingsScreen**

In `app/screens/SettingsScreen.js`, change:

```javascript
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
```

To:

```javascript
import { getPreference, setPreference, PREF_KEYS, getDefaultAccountId, setDefaultAccountId } from '../services/PreferencesDB';
```

Add this import directly after `import AccountsScreen from './AccountsScreen';`:

```javascript
import { useAccountsData } from '../contexts/AccountsDataContext';
```

- [ ] **Step 4: Add state, load effect, and handler**

In `app/screens/SettingsScreen.js`, after the line:

```javascript
  const [activeSubPanel, setActiveSubPanel] = useState(null);
```

Add:

```javascript
  const [pinnedAccountId, setPinnedAccountId] = useState(null);
```

After the `closeWithShrink` callback, add:

```javascript
  useEffect(() => {
    getDefaultAccountId().then(id => setPinnedAccountId(id));
  }, []);

  const handleDefaultAccountSelect = useCallback(async (id) => {
    await setDefaultAccountId(id);
    setPinnedAccountId(id);
    closeSubPanel();
  }, [closeSubPanel]);
```

In the component body before the `return` statement (near other computed display values), add:

```javascript
  const { visibleAccounts } = useAccountsData();

  const defaultAccountName = pinnedAccountId
    ? (visibleAccounts.find(a => a.id === pinnedAccountId)?.name ?? t('latest_used'))
    : t('latest_used');
```

- [ ] **Step 5: Add the settings row**

In `app/screens/SettingsScreen.js`, find the closing `</TouchableRipple>` of the accounts row (the one with `testID="settings-accounts-row"`). Add the new row immediately after it:

```jsx
<TouchableRipple
  onPress={() => openSubPanel('defaultAccount')}
  style={styles.settingsRow}
  testID="settings-default-account-row"
>
  <View style={styles.settingsRowContent}>
    <View style={styles.settingsRowLeft}>
      <Ionicons name="bookmark-outline" size={22} color={colors.text} />
      <View style={styles.settingsRowText}>
        <Text style={[styles.settingsRowLabel, { color: colors.text }]}>{t('default_account')}</Text>
        <Text style={[styles.settingsRowValue, { color: colors.mutedText }]}>
          {defaultAccountName}
        </Text>
      </View>
    </View>
    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
  </View>
</TouchableRipple>
```

- [ ] **Step 6: Add the subpanel**

In `app/screens/SettingsScreen.js`, find the line:

```javascript
{activeSubPanel === 'language' && (
```

Insert the following block immediately before it:

```jsx
{activeSubPanel === 'defaultAccount' && (
  <ScrollView
    style={styles.listContainer}
    testID="settings-default-account-panel"
  >
    <TouchableRipple
      onPress={() => handleDefaultAccountSelect(null)}
      style={styles.listItem}
      testID="default-account-option-null"
    >
      <View style={styles.listItemContent}>
        <Text style={[styles.listItemText, { color: colors.text }]}>{t('latest_used')}</Text>
        {pinnedAccountId === null && (
          <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
        )}
      </View>
    </TouchableRipple>
    {visibleAccounts.map(acc => (
      <TouchableRipple
        key={acc.id}
        onPress={() => handleDefaultAccountSelect(acc.id)}
        style={styles.listItem}
        testID={`default-account-option-${acc.id}`}
      >
        <View style={styles.listItemContent}>
          <Text style={[styles.listItemText, { color: colors.text }]}>{acc.name}</Text>
          {pinnedAccountId === acc.id && (
            <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
          )}
        </View>
      </TouchableRipple>
    ))}
  </ScrollView>
)}
```

- [ ] **Step 7: Run SettingsScreen tests**

```
npm test -- --silent --testPathPattern="SettingsScreen"
```

Expected: PASS

- [ ] **Step 8: Run the full test suite**

```
npm test -- --silent
```

Expected: All tests PASS. Fix any failures before continuing.

- [ ] **Step 9: Commit**

```bash
git add app/screens/SettingsScreen.js __tests__/screens/SettingsScreen.test.js
git commit -m "feat: add default account setting row and subpanel to SettingsScreen"
```

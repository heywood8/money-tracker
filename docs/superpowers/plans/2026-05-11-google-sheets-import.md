# Google Sheets Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "From Google Sheets" to the Import subpanel and fix the export to produce a lossless, re-importable spreadsheet.

**Architecture:** `buildSheetsData` gets missing columns + hybrid ID/name FK columns so the sheet is both human-readable and round-trip safe. A new `importFromSheets` function reads all 6 sheets via a single `batchGet` call, resolves FKs by ID-first/name-fallback, and returns a backup object. The SettingsModal handler calls `importFromSheets`, then hands off to the existing `restoreBackup` + `ImportProgressModal` flow for the DB restore step.

**Tech Stack:** React Native, Google Sheets REST API v4 (`values:batchGet`), existing `restoreBackup` from `BackupRestore.js`, `@react-native-google-signin/google-signin`

---

## File Map

| File | Change |
|---|---|
| `app/services/GoogleSheetsService.js` | Fix `buildSheetsData`; add `parseSheet` helper + `importFromSheets` |
| `app/modals/SettingsModal.js` | Add `SHEETS_IMPORT_STEPS`; import `getPreference` + `importFromSheets`; add state, handler, back-button guard, title, "From Google Sheets" row, and progress JSX |
| `__tests__/services/GoogleSheetsService.test.js` | Add `buildSheetsData` column tests; add `importFromSheets` unit tests |
| `__tests__/integration/GoogleSheetsExport.test.js` | Add "From Google Sheets" import row render + tap tests |

---

## Task 1: Fix `buildSheetsData` — add missing columns

**Files:**
- Modify: `app/services/GoogleSheetsService.js`
- Test: `__tests__/services/GoogleSheetsService.test.js`

- [ ] **Step 1.1 — Write failing tests for new columns**

Add to the `describe('buildSheetsData')` block in `__tests__/services/GoogleSheetsService.test.js`. If no such block exists yet, add it:

```javascript
describe('buildSheetsData', () => {
  const mockBackup = {
    data: {
      accounts: [
        { id: 1, name: 'Checking', balance: '100', currency: 'USD', display_order: 0, hidden: 0, monthly_target: '500' },
      ],
      categories: [
        { id: 'cat-1', name: 'Food', type: 'entry', category_type: 'expense', icon: 'fast-food', parent_id: 'cat-root', color: '#ff0000', is_shadow: 0 },
      ],
      operations: [
        { id: 5, date: '2024-01-15', type: 'expense', amount: '50', source_currency: 'USD', category_id: 'cat-1', account_id: 1, to_account_id: null, description: 'Lunch', exchange_rate: null, destination_amount: null, destination_currency: null },
      ],
      budgets: [
        { id: 'bud-1', category_id: 'cat-1', amount: '200', currency: 'USD', period_type: 'monthly', start_date: '2024-01-01', end_date: null, is_recurring: 1, rollover_enabled: 0 },
      ],
      planned_operations: [
        { id: 'plan-1', name: 'Rent', type: 'expense', amount: '1000', account_id: 1, category_id: 'cat-1', to_account_id: null, description: 'Monthly rent', is_recurring: 1 },
      ],
      balance_history: [
        { account_id: 1, date: '2024-01-15', balance: '100' },
      ],
    },
  };

  it('Accounts sheet includes display_order, hidden, monthly_target', () => {
    const sheets = buildSheetsData(mockBackup);
    const accounts = sheets.find(s => s.range === 'Accounts!A1');
    expect(accounts.values[0]).toContain('display_order');
    expect(accounts.values[0]).toContain('hidden');
    expect(accounts.values[0]).toContain('monthly_target');
    expect(accounts.values[1]).toContain(0);   // display_order value
    expect(accounts.values[1]).toContain(0);   // hidden value
    expect(accounts.values[1]).toContain('500'); // monthly_target value
  });

  it('Categories sheet includes parent_id, color, is_shadow', () => {
    const sheets = buildSheetsData(mockBackup);
    const cats = sheets.find(s => s.range === 'Categories!A1');
    expect(cats.values[0]).toContain('parent_id');
    expect(cats.values[0]).toContain('color');
    expect(cats.values[0]).toContain('is_shadow');
    expect(cats.values[1]).toContain('cat-root');
    expect(cats.values[1]).toContain('#ff0000');
    expect(cats.values[1]).toContain(0);
  });

  it('Operations sheet includes account_id, category_id, to_account_id, exchange_rate, destination_amount, destination_currency', () => {
    const sheets = buildSheetsData(mockBackup);
    const ops = sheets.find(s => s.range === 'Operations!A1');
    expect(ops.values[0]).toContain('account_id');
    expect(ops.values[0]).toContain('category_id');
    expect(ops.values[0]).toContain('to_account_id');
    expect(ops.values[0]).toContain('exchange_rate');
    expect(ops.values[0]).toContain('destination_amount');
    expect(ops.values[0]).toContain('destination_currency');
    expect(ops.values[1]).toContain(1);       // account_id value
    expect(ops.values[1]).toContain('cat-1'); // category_id value
  });

  it('Budgets sheet includes category_id', () => {
    const sheets = buildSheetsData(mockBackup);
    const budgets = sheets.find(s => s.range === 'Budgets!A1');
    expect(budgets.values[0]).toContain('category_id');
    expect(budgets.values[1]).toContain('cat-1');
  });

  it('Planned Operations sheet includes account_id, category_id, to_account_id', () => {
    const sheets = buildSheetsData(mockBackup);
    const planned = sheets.find(s => s.range === 'Planned Operations!A1');
    expect(planned.values[0]).toContain('account_id');
    expect(planned.values[0]).toContain('category_id');
    expect(planned.values[0]).toContain('to_account_id');
    expect(planned.values[1]).toContain(1);
    expect(planned.values[1]).toContain('cat-1');
  });

  it('Balance History sheet includes account_id', () => {
    const sheets = buildSheetsData(mockBackup);
    const history = sheets.find(s => s.range === 'Balance History!A1');
    expect(history.values[0]).toContain('account_id');
    expect(history.values[1]).toContain(1);
  });
});
```

- [ ] **Step 1.2 — Run tests to verify they fail**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: FAIL — columns not yet present.

- [ ] **Step 1.3 — Update `buildSheetsData` in `app/services/GoogleSheetsService.js`**

Replace the `buildSheetsData` function body with:

```javascript
export const buildSheetsData = (backup) => {
  const { accounts, categories, operations, budgets, planned_operations, balance_history } = backup.data;

  const accountNames = new Map(accounts.map(a => [a.id, a.name]));
  const categoryNames = new Map(categories.map(c => [c.id, c.name]));

  return [
    {
      range: 'Accounts!A1',
      values: [
        ['id', 'name', 'balance', 'currency', 'display_order', 'hidden', 'monthly_target'],
        ...accounts.map(a => [
          a.id, a.name, a.balance, a.currency,
          a.display_order ?? '', a.hidden ?? 0, a.monthly_target ?? '',
        ]),
      ],
    },
    {
      range: 'Operations!A1',
      values: [
        ['id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description', 'account_id', 'category_id', 'to_account_id', 'exchange_rate', 'destination_amount', 'destination_currency'],
        ...operations.map(o => [
          o.id, o.date, o.type, o.amount,
          o.source_currency || '',
          categoryNames.get(o.category_id) || '',
          accountNames.get(o.account_id) || '',
          o.to_account_id ? (accountNames.get(o.to_account_id) || '') : '',
          o.description || '',
          o.account_id,
          o.category_id || '',
          o.to_account_id || '',
          o.exchange_rate || '',
          o.destination_amount || '',
          o.destination_currency || '',
        ]),
      ],
    },
    {
      range: 'Categories!A1',
      values: [
        ['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow'],
        ...categories.map(c => [
          c.id, c.name, c.type, c.category_type, c.icon || '',
          c.parent_id || '', c.color || '', c.is_shadow ?? 0,
        ]),
      ],
    },
    {
      range: 'Budgets!A1',
      values: [
        ['id', 'category', 'amount', 'currency', 'period_type', 'start_date', 'end_date', 'is_recurring', 'rollover_enabled', 'category_id'],
        ...(budgets || []).map(b => [
          b.id,
          categoryNames.get(b.category_id) || '',
          b.amount, b.currency, b.period_type, b.start_date, b.end_date || '',
          b.is_recurring, b.rollover_enabled,
          b.category_id || '',
        ]),
      ],
    },
    {
      range: 'Planned Operations!A1',
      values: [
        ['id', 'name', 'type', 'amount', 'account', 'category', 'to_account', 'description', 'is_recurring', 'account_id', 'category_id', 'to_account_id'],
        ...(planned_operations || []).map(p => [
          p.id, p.name, p.type, p.amount,
          accountNames.get(p.account_id) || '',
          categoryNames.get(p.category_id) || '',
          p.to_account_id ? (accountNames.get(p.to_account_id) || '') : '',
          p.description || '',
          p.is_recurring,
          p.account_id,
          p.category_id || '',
          p.to_account_id || '',
        ]),
      ],
    },
    {
      range: 'Balance History!A1',
      values: [
        ['account', 'date', 'balance', 'account_id'],
        ...(balance_history || []).map(h => [
          accountNames.get(h.account_id) || '',
          h.date, h.balance,
          h.account_id,
        ]),
      ],
    },
  ];
};
```

- [ ] **Step 1.4 — Run tests to verify they pass**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: all tests pass.

- [ ] **Step 1.5 — Commit**

```bash
git add app/services/GoogleSheetsService.js __tests__/services/GoogleSheetsService.test.js
git commit -m "feat(sheets): add missing columns to buildSheetsData export for lossless round-trip"
```

---

## Task 2: Add `importFromSheets` to `GoogleSheetsService.js`

**Files:**
- Modify: `app/services/GoogleSheetsService.js`
- Test: `__tests__/services/GoogleSheetsService.test.js`

- [ ] **Step 2.1 — Write failing tests for `importFromSheets`**

Add to `__tests__/services/GoogleSheetsService.test.js`:

```javascript
import {
  getValidAccessToken,
  signIn,
  signOut,
  buildSheetsData,
  exportToSheets,
  importFromSheets,
} from '../../app/services/GoogleSheetsService';
```

Add a new `describe('importFromSheets')` block:

```javascript
describe('importFromSheets', () => {
  const { getPreference } = require('../../app/services/PreferencesDB');

  const makeBatchGetResponse = (overrides = {}) => ({
    valueRanges: [
      {
        range: 'Accounts!A1:G3',
        values: [
          ['id', 'name', 'balance', 'currency', 'display_order', 'hidden', 'monthly_target'],
          ['1', 'Checking', '500', 'USD', '0', '0', ''],
          ['2', 'Savings', '1000', 'USD', '1', '0', '200'],
        ],
      },
      {
        range: 'Operations!A1:O3',
        values: [
          ['id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description', 'account_id', 'category_id', 'to_account_id', 'exchange_rate', 'destination_amount', 'destination_currency'],
          ['10', '2024-01-15', 'expense', '50', 'USD', 'Food', 'Checking', '', 'Lunch', '1', 'cat-1', '', '', '', ''],
          ['11', '2024-01-16', 'transfer', '100', 'USD', '', 'Checking', 'Savings', '', '1', '', '2', '', '', ''],
        ],
      },
      {
        range: 'Categories!A1:I2',
        values: [
          ['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow'],
          ['cat-1', 'Food', 'entry', 'expense', 'fast-food', '', '#ff0000', '0'],
        ],
      },
      {
        range: 'Budgets!A1:J1',
        values: [
          ['id', 'category', 'amount', 'currency', 'period_type', 'start_date', 'end_date', 'is_recurring', 'rollover_enabled', 'category_id'],
        ],
      },
      {
        range: 'Planned Operations!A1:L1',
        values: [
          ['id', 'name', 'type', 'amount', 'account', 'category', 'to_account', 'description', 'is_recurring', 'account_id', 'category_id', 'to_account_id'],
        ],
      },
      {
        range: 'Balance History!A1:D2',
        values: [
          ['account', 'date', 'balance', 'account_id'],
          ['Checking', '2024-01-15', '500', '1'],
        ],
      },
      ...(overrides.extraRanges || []),
    ],
    ...overrides,
  });

  beforeEach(() => {
    getPreference.mockResolvedValue('sheet-id-123');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeBatchGetResponse(),
    });
  });

  it('throws no_spreadsheet_configured when no spreadsheet ID saved', async () => {
    getPreference.mockResolvedValue(null);
    await expect(importFromSheets('token')).rejects.toThrow('no_spreadsheet_configured');
  });

  it('throws spreadsheet_not_found on 404', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Spreadsheet not found.' } }),
    });
    await expect(importFromSheets('token')).rejects.toThrow('spreadsheet_not_found');
  });

  it('signs out and throws refresh_failed on 401', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Unauthorized' } }),
    });
    await expect(importFromSheets('token')).rejects.toThrow('refresh_failed');
    expect(GoogleSignin.signOut).toHaveBeenCalled();
  });

  it('returns a valid backup object on success', async () => {
    const backup = await importFromSheets('token');
    expect(backup.version).toBe(1);
    expect(backup.data.accounts).toHaveLength(2);
    expect(backup.data.categories).toHaveLength(1);
    expect(backup.data.operations).toHaveLength(2);
    expect(backup.data.balance_history).toHaveLength(1);
    expect(backup.data.app_metadata).toEqual([]);
  });

  it('resolves account FK by account_id column (ID-first)', async () => {
    const backup = await importFromSheets('token');
    // Operation row has account_id='1', which maps to account id '1'
    expect(backup.data.operations[0].account_id).toBe('1');
  });

  it('resolves account FK by name when account_id column is absent', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        valueRanges: [
          {
            range: 'Accounts!A1:D2',
            values: [
              ['id', 'name', 'balance', 'currency'],
              ['1', 'Checking', '500', 'USD'],
            ],
          },
          {
            range: 'Operations!A1:I2',
            values: [
              ['id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description'],
              ['10', '2024-01-15', 'expense', '50', 'USD', '', 'Checking', '', ''],
            ],
          },
          { range: 'Categories!A1:A1', values: [['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow']] },
          { range: 'Budgets!A1:A1', values: [['id']] },
          { range: 'Planned Operations!A1:A1', values: [['id']] },
          { range: 'Balance History!A1:A1', values: [['account', 'date', 'balance']] },
        ],
      }),
    });
    const backup = await importFromSheets('token');
    expect(backup.data.operations[0].account_id).toBe('1');
  });

  it('sets FK to null when neither ID nor name resolves', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        valueRanges: [
          { range: 'Accounts!A1:D1', values: [['id', 'name', 'balance', 'currency']] },
          {
            range: 'Operations!A1:I2',
            values: [
              ['id', 'date', 'type', 'amount', 'currency', 'category', 'account', 'to_account', 'description'],
              ['10', '2024-01-15', 'expense', '50', 'USD', '', 'UnknownAccount', '', ''],
            ],
          },
          { range: 'Categories!A1:A1', values: [['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow']] },
          { range: 'Budgets!A1:A1', values: [['id']] },
          { range: 'Planned Operations!A1:A1', values: [['id']] },
          { range: 'Balance History!A1:A1', values: [['account', 'date', 'balance']] },
        ],
      }),
    });
    const backup = await importFromSheets('token');
    expect(backup.data.operations[0].account_id).toBeNull();
  });

  it('treats missing sheet tab as empty array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        valueRanges: [
          { range: 'Accounts!A1:D2', values: [['id', 'name', 'balance', 'currency'], ['1', 'Checking', '500', 'USD']] },
          // Operations tab entirely missing from response
          { range: 'Categories!A1:A1', values: [['id', 'name', 'type', 'category_type', 'icon', 'parent_id', 'color', 'is_shadow']] },
          { range: 'Budgets!A1:A1', values: [['id']] },
          { range: 'Planned Operations!A1:A1', values: [['id']] },
          { range: 'Balance History!A1:A1', values: [['account', 'date', 'balance', 'account_id']] },
        ],
      }),
    });
    const backup = await importFromSheets('token');
    expect(backup.data.operations).toEqual([]);
  });

  it('calls onProgress with connect and parse steps', async () => {
    const onProgress = jest.fn();
    await importFromSheets('token', onProgress);
    expect(onProgress).toHaveBeenCalledWith({ step: 'connect', status: 'in_progress' });
    expect(onProgress).toHaveBeenCalledWith({ step: 'connect', status: 'completed' });
    expect(onProgress).toHaveBeenCalledWith({ step: 'parse', status: 'in_progress' });
    expect(onProgress).toHaveBeenCalledWith({ step: 'parse', status: 'completed' });
  });

  it('maps category fields correctly', async () => {
    const backup = await importFromSheets('token');
    const cat = backup.data.categories[0];
    expect(cat.id).toBe('cat-1');
    expect(cat.color).toBe('#ff0000');
    expect(cat.is_shadow).toBe(0);
  });

  it('maps balance_history account_id by ID column', async () => {
    const backup = await importFromSheets('token');
    expect(backup.data.balance_history[0].account_id).toBe('1');
  });
});
```

- [ ] **Step 2.2 — Run tests to verify they fail**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: FAIL — `importFromSheets` not exported.

- [ ] **Step 2.3 — Add `parseSheet` helper and `importFromSheets` to `app/services/GoogleSheetsService.js`**

Add after the `buildSheetsData` export and before `createSpreadsheet`:

```javascript
/**
 * Parse a Sheets API valueRange into an array of row objects.
 * Row 0 is the header; subsequent rows become key/value objects.
 * @param {Object|undefined} valueRange
 * @returns {Array<Object>}
 */
const parseSheet = (valueRange) => {
  const rows = valueRange?.values || [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
};

/**
 * Import all app data from the saved Google Sheets spreadsheet.
 * Fetches all 6 sheets in one batchGet call, resolves foreign keys
 * (ID-first, name fallback), and returns a backup object compatible
 * with restoreBackup(). Does NOT call restoreBackup itself.
 *
 * @param {string} accessToken - Valid Google OAuth access token
 * @param {Function} [onProgress] - Optional callback({ step, status })
 *   Steps: 'connect' | 'parse'. Statuses: 'in_progress' | 'completed'.
 * @returns {Promise<Object>} Backup object matching createBackup() format
 */
export const importFromSheets = async (accessToken, onProgress) => {
  const report = (step, status) => onProgress?.({ step, status });

  // ── Step 1: connect ────────────────────────────────────────────────
  report('connect', 'in_progress');

  const spreadsheetId = await getPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID);
  if (!spreadsheetId) {
    throw new Error('no_spreadsheet_configured');
  }

  const sheetNames = ['Accounts', 'Operations', 'Categories', 'Budgets', 'Planned Operations', 'Balance History'];
  const rangesParam = sheetNames.map(n => `ranges=${encodeURIComponent(n)}`).join('&');
  const response = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values:batchGet?${rangesParam}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) {
      await signOut();
      throw new Error('refresh_failed');
    }
    if (response.status === 404) throw new Error('spreadsheet_not_found');
    throw new Error(data.error?.message || 'fetch_sheets_failed');
  }

  const { valueRanges = [] } = await response.json();
  report('connect', 'completed');

  // ── Step 2: parse ──────────────────────────────────────────────────
  report('parse', 'in_progress');

  // Find a sheet's valueRange by matching the tab name prefix
  const findSheet = (name) => {
    const vr = valueRanges.find(r => r.range?.startsWith(`${name}!`));
    return parseSheet(vr);
  };

  const accountRows = findSheet('Accounts');
  const categoryRows = findSheet('Categories');
  const operationRows = findSheet('Operations');
  const budgetRows = findSheet('Budgets');
  const plannedRows = findSheet('Planned Operations');
  const historyRows = findSheet('Balance History');

  // Build lookup maps: id->id (direct) and name->id (fallback)
  const accountIdMap = new Map();
  accountRows.forEach(a => {
    if (a.id !== '' && a.id != null) accountIdMap.set(String(a.id), String(a.id));
    if (a.name) accountIdMap.set(a.name, String(a.id));
  });

  const categoryIdMap = new Map();
  categoryRows.forEach(c => {
    if (c.id !== '' && c.id != null) categoryIdMap.set(String(c.id), String(c.id));
    if (c.name) categoryIdMap.set(c.name, String(c.id));
  });

  // Resolve a foreign key: prefer the ID column value, fall back to name column
  const resolveAccountId = (row, idCol, nameCol) => {
    if (row[idCol] !== '' && row[idCol] != null) {
      const byId = accountIdMap.get(String(row[idCol]));
      if (byId != null) return byId;
    }
    return row[nameCol] ? (accountIdMap.get(row[nameCol]) ?? null) : null;
  };

  const resolveCategoryId = (row, idCol, nameCol) => {
    if (row[idCol] !== '' && row[idCol] != null) {
      const byId = categoryIdMap.get(String(row[idCol]));
      if (byId != null) return byId;
    }
    return row[nameCol] ? (categoryIdMap.get(row[nameCol]) ?? null) : null;
  };

  const now = new Date().toISOString();

  const accounts = accountRows.map(a => ({
    id: a.id !== '' ? a.id : undefined,
    name: a.name,
    balance: a.balance || '0',
    currency: a.currency || 'USD',
    display_order: a.display_order !== '' ? Number(a.display_order) : null,
    hidden: a.hidden !== '' ? Number(a.hidden) : 0,
    monthly_target: a.monthly_target || null,
    created_at: now,
    updated_at: now,
  }));

  const categories = categoryRows.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    category_type: c.category_type,
    parent_id: c.parent_id || null,
    icon: c.icon || null,
    color: c.color || null,
    is_shadow: c.is_shadow !== '' ? Number(c.is_shadow) : 0,
    created_at: now,
    updated_at: now,
  }));

  const operations = operationRows.map(o => ({
    type: o.type,
    amount: o.amount,
    account_id: resolveAccountId(o, 'account_id', 'account'),
    category_id: resolveCategoryId(o, 'category_id', 'category'),
    to_account_id: (o.to_account || o.to_account_id)
      ? resolveAccountId(o, 'to_account_id', 'to_account')
      : null,
    date: o.date,
    created_at: now,
    description: o.description || null,
    exchange_rate: o.exchange_rate || null,
    destination_amount: o.destination_amount || null,
    source_currency: o.currency || null, // 'currency' column = source_currency in DB
    destination_currency: o.destination_currency || null,
  }));

  const budgets = budgetRows.map(b => ({
    id: b.id,
    category_id: resolveCategoryId(b, 'category_id', 'category'),
    amount: b.amount,
    currency: b.currency,
    period_type: b.period_type,
    start_date: b.start_date,
    end_date: b.end_date || null,
    is_recurring: b.is_recurring !== '' ? Number(b.is_recurring) : 1,
    rollover_enabled: b.rollover_enabled !== '' ? Number(b.rollover_enabled) : 0,
    created_at: now,
    updated_at: now,
  }));

  const planned_operations = plannedRows.map(p => ({
    id: p.id,
    name: p.name,
    type: p.type,
    amount: p.amount,
    account_id: resolveAccountId(p, 'account_id', 'account'),
    category_id: resolveCategoryId(p, 'category_id', 'category'),
    to_account_id: (p.to_account || p.to_account_id)
      ? resolveAccountId(p, 'to_account_id', 'to_account')
      : null,
    description: p.description || null,
    is_recurring: p.is_recurring !== '' ? Number(p.is_recurring) : 1,
    last_executed_month: null,
    display_order: null,
    created_at: now,
    updated_at: now,
  }));

  const balance_history = historyRows.map(h => ({
    account_id: resolveAccountId(h, 'account_id', 'account'),
    date: h.date,
    balance: h.balance,
    created_at: now,
  }));

  report('parse', 'completed');

  return {
    version: 1,
    timestamp: now,
    platform: 'native',
    data: {
      accounts,
      categories,
      operations,
      budgets,
      app_metadata: [],
      balance_history,
      planned_operations,
    },
  };
};
```

- [ ] **Step 2.4 — Run tests to verify they pass**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsService"
```

Expected: all tests pass.

- [ ] **Step 2.5 — Commit**

```bash
git add app/services/GoogleSheetsService.js __tests__/services/GoogleSheetsService.test.js
git commit -m "feat(sheets): add importFromSheets service function"
```

---

## Task 3: Wire import into `SettingsModal.js`

**Files:**
- Modify: `app/modals/SettingsModal.js`
- Test: `__tests__/integration/GoogleSheetsExport.test.js`

- [ ] **Step 3.1 — Write failing UI tests**

Add to `__tests__/integration/GoogleSheetsExport.test.js`, after the existing imports and mock setup, add `importFromSheets` to the GoogleSheetsService mock:

```javascript
jest.mock('../../app/services/GoogleSheetsService', () => ({
  getValidAccessToken: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  exportToSheets: jest.fn(),
  importFromSheets: jest.fn(),   // ADD THIS
}));
```

Then add a new describe block for import tests:

```javascript
describe('From Google Sheets import', () => {
  const { getValidAccessToken, importFromSheets } = require('../../app/services/GoogleSheetsService');
  const { restoreBackup } = require('../../app/services/BackupRestore');
  const { getPreference } = require('../../app/services/PreferencesDB');

  const openImportSubPanel = async (getByText, fireEvent) => {
    fireEvent.press(getByText('import'));
  };

  it('renders From Google Sheets row in import subpanel', async () => {
    const { getByText, getByTestId } = render(
      <SettingsModal visible={true} onClose={jest.fn()} />,
    );
    fireEvent.press(getByText('import'));
    await waitFor(() => {
      expect(getByTestId('settings-import-google-sheets')).toBeTruthy();
    });
  });

  it('shows no-spreadsheet message when no spreadsheet ID is saved', async () => {
    getPreference.mockResolvedValue(null);
    const { getByText, getByTestId } = render(
      <SettingsModal visible={true} onClose={jest.fn()} />,
    );
    fireEvent.press(getByText('import'));
    await waitFor(() => getByTestId('settings-import-google-sheets'));
    fireEvent.press(getByTestId('settings-import-google-sheets'));
    await waitFor(() => {
      expect(getByTestId('settings-import-no-spreadsheet')).toBeTruthy();
    });
  });

  it('calls importFromSheets when tapped and spreadsheet is configured', async () => {
    getPreference.mockResolvedValue('sheet-id-123');
    getValidAccessToken.mockResolvedValue('token');
    importFromSheets.mockResolvedValue({
      version: 1,
      timestamp: new Date().toISOString(),
      platform: 'native',
      data: { accounts: [], categories: [], operations: [], budgets: [], app_metadata: [], balance_history: [], planned_operations: [] },
    });
    restoreBackup.mockResolvedValue();

    const { getByText, getByTestId } = render(
      <SettingsModal visible={true} onClose={jest.fn()} />,
    );
    fireEvent.press(getByText('import'));
    await waitFor(() => getByTestId('settings-import-google-sheets'));
    fireEvent.press(getByTestId('settings-import-google-sheets'));

    await waitFor(() => {
      expect(importFromSheets).toHaveBeenCalledWith('token', expect.any(Function));
    });
  });
});
```

- [ ] **Step 3.2 — Run tests to verify they fail**

```bash
npm test -- --silent --testPathPattern="GoogleSheetsExport"
```

Expected: FAIL — `settings-import-google-sheets` testID not found.

- [ ] **Step 3.3 — Add `SHEETS_IMPORT_STEPS` constant in `app/modals/SettingsModal.js`**

After the existing `SHEETS_STEPS` constant (around line 32), add:

```javascript
const SHEETS_IMPORT_STEPS = [
  { id: 'connect', label: 'Connecting to spreadsheet' },
  { id: 'parse', label: 'Reading sheet data' },
];
```

- [ ] **Step 3.4 — Update imports in `app/modals/SettingsModal.js`**

On line 19, add `getPreference`:
```javascript
import { getPreference, setPreference, PREF_KEYS } from '../services/PreferencesDB';
```

On line 23, add `importFromSheets`:
```javascript
import { getValidAccessToken, signIn as googleSignIn, exportToSheets, importFromSheets } from '../services/GoogleSheetsService';
```

- [ ] **Step 3.5 — Add new state variables in `app/modals/SettingsModal.js`**

After the `sheetsError` state (around line 76), add:

```javascript
const [sheetsImportSteps, setSheetsImportSteps] = useState(SHEETS_IMPORT_STEPS.map(s => ({ ...s, status: 'pending' })));
const [sheetsImportError, setSheetsImportError] = useState(null);
```

Update the `importStep` comment to document the new step:
```javascript
const [importStep, setImportStep] = useState('source'); // 'source' | 'local-list' | 'confirm-file' | 'confirm-local' | 'sheets-progress'
```

- [ ] **Step 3.6 — Reset new state in the `useEffect` visible reset (around line 518)**

Add two lines after `setImportSelectedBackup(null)`:
```javascript
setSheetsImportSteps(SHEETS_IMPORT_STEPS.map(s => ({ ...s, status: 'pending' })));
setSheetsImportError(null);
```

- [ ] **Step 3.7 — Add `handleGoogleSheetsImport` handler**

Add after `handleImportSourceSelect` (around line 382):

```javascript
const handleGoogleSheetsImport = useCallback(async () => {
  setSheetsImportError(null);

  // Pre-check: show inline message without entering progress view if not configured
  const spreadsheetId = await getPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID);
  if (!spreadsheetId) {
    setSheetsImportError(t('google_sheets_not_configured') || 'Export to Google Sheets first to set up your spreadsheet.');
    return;
  }

  setSheetsImportSteps(SHEETS_IMPORT_STEPS.map(s => ({ ...s, status: 'pending' })));
  setImportStep('sheets-progress');

  let backup;
  try {
    let accessToken;
    try {
      accessToken = await getValidAccessToken();
    } catch {
      accessToken = await googleSignIn();
    }
    backup = await importFromSheets(accessToken, ({ step, status }) => {
      setSheetsImportSteps(prev => prev.map(s => s.id === step ? { ...s, status } : s));
    });
  } catch (error) {
    if (error.message === 'sign_in_cancelled') {
      setImportStep('source');
      return;
    }
    let msg;
    if (error.message === 'refresh_failed') msg = t('google_sheets_access_revoked') || 'Google access was revoked. Please sign in again.';
    else if (error.message === 'spreadsheet_not_found') msg = t('google_sheets_not_found') || 'Spreadsheet not found. Try exporting first.';
    else msg = t('google_sheets_import_failed') || 'Import failed. Please try again.';
    setSheetsImportSteps(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'error' } : s));
    setSheetsImportError(msg);
    return;
  }

  // Connect + parse done — hand off to ImportProgressModal for the restore
  closeSubPanel();
  onClose();
  startImport();
  try {
    await restoreBackup(backup);
    completeImport();
  } catch (restoreError) {
    cancelImport();
    console.error('[SheetsImport] restore error:', restoreError);
  }
}, [t, getValidAccessToken, googleSignIn, importFromSheets, closeSubPanel, onClose, startImport, restoreBackup, completeImport, cancelImport]);
```

- [ ] **Step 3.8 — Update `handleImportBack` to handle `'sheets-progress'`**

Find the existing `handleImportBack` callback (around line 389). Add a new branch:

```javascript
const handleImportBack = useCallback(() => {
  if (importStep === 'source') {
    closeSubPanel();
  } else if (importStep === 'local-list') {
    setImportStep('source');
  } else if (importStep === 'confirm-file') {
    setImportStep('source');
  } else if (importStep === 'confirm-local') {
    setImportStep('local-list');
    setImportSelectedBackup(null);
  } else if (importStep === 'sheets-progress') {
    setImportStep('source');
    setSheetsImportError(null);
  }
}, [importStep, closeSubPanel]);
```

- [ ] **Step 3.9 — Disable back button during active sheets import**

Find the back button `disabled` prop (around line 780). Extend it:

```javascript
disabled={
  (activeSubPanel === 'export' && exportStep === 'sheets-progress' && sheetsSteps.some(s => s.status === 'in_progress')) ||
  (activeSubPanel === 'import' && importStep === 'sheets-progress' && sheetsImportSteps.some(s => s.status === 'in_progress'))
}
```

- [ ] **Step 3.10 — Update subpanel title for `'sheets-progress'` import step**

Find the title block that starts with `{activeSubPanel === 'import' && (` (around line 791). Extend the ternary:

```javascript
{activeSubPanel === 'import' && (
  importStep === 'source'
    ? (t('import') || 'Import')
    : importStep === 'sheets-progress'
    ? (t('google_sheets_import') || 'Import from Sheets')
    : importStep === 'local-list'
    ? ...  // keep existing branches unchanged
```

- [ ] **Step 3.11 — Add "From Google Sheets" row and inline error to the `importStep === 'source'` JSX**

Find the `{activeSubPanel === 'import' && importStep === 'source' && (` block (around line 1006). After the existing "From local backup" row closing `</TouchableRipple>`, add:

```jsx
<TouchableRipple
  onPress={handleGoogleSheetsImport}
  style={styles.languageItem}
  testID="settings-import-google-sheets"
>
  <View style={styles.languageItemContent}>
    <View style={styles.languageItemLeft}>
      <Text style={[styles.googleIcon, { color: colors.text }]}>G</Text>
    </View>
    <View style={styles.languageItemText}>
      <Text style={[styles.languageItemLabel, { color: colors.text }]}>
        {t('import_from_google_sheets') || 'From Google Sheets'}
      </Text>
      <Text style={[styles.languageItemSubtitle, { color: colors.mutedText }]}>
        {t('import_from_google_sheets_description') || 'Import from your Penny spreadsheet'}
      </Text>
    </View>
    <Ionicons name="chevron-forward" size={20} color={colors.mutedText} />
  </View>
</TouchableRipple>
{sheetsImportError && importStep === 'source' && (
  <Text
    testID="settings-import-no-spreadsheet"
    style={[styles.sheetsErrorText, { marginHorizontal: 16, marginBottom: 8 }]}
  >
    {sheetsImportError}
  </Text>
)}
```

- [ ] **Step 3.12 — Add `importStep === 'sheets-progress'` JSX**

After the `{activeSubPanel === 'import' && importStep === 'confirm-local' && ...}` block, add:

```jsx
{activeSubPanel === 'import' && importStep === 'sheets-progress' && (
  <View style={styles.sheetsProgressContent}>
    {sheetsImportSteps.map(step => (
      <View key={step.id} style={styles.sheetsProgressStep}>
        <View style={styles.sheetsProgressStepIcon}>
          {step.status === 'pending' && (
            <Ionicons name="ellipse-outline" size={22} color={colors.mutedText} />
          )}
          {step.status === 'in_progress' && (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
          {step.status === 'completed' && (
            <Ionicons name="checkmark-circle" size={22} color="#4caf50" />
          )}
          {step.status === 'error' && (
            <Ionicons name="close-circle" size={22} color="#c44" />
          )}
        </View>
        <Text style={[
          styles.sheetsProgressStepLabel,
          step.status === 'error' ? styles.sheetsProgressStepLabelError :
            { color: step.status === 'pending' ? colors.mutedText : colors.text },
        ]}>
          {step.label}
        </Text>
      </View>
    ))}
    {sheetsImportError && (
      <Text style={styles.sheetsErrorText}>{sheetsImportError}</Text>
    )}
  </View>
)}
```

- [ ] **Step 3.13 — Run all tests**

```bash
npm test -- --silent
```

Expected: 0 failures.

- [ ] **Step 3.14 — Commit**

```bash
git add app/modals/SettingsModal.js __tests__/integration/GoogleSheetsExport.test.js
git commit -m "feat(sheets): add From Google Sheets import to Import subpanel"
```

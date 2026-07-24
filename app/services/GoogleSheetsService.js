import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { getPreference, setPreference, PREF_KEYS } from './PreferencesDB';
import { queryAll } from './db';

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
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signIn();
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken;
  } catch (error) {
    console.error('[GoogleSignIn] signIn error:', JSON.stringify(error), 'code:', error?.code, 'message:', error?.message);
    if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
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
 * Build the 8-sheet data structure from a backup object.
 * @param {Object} backup - Backup object from createBackup()
 * @returns {Array<{range: string, values: Array<Array>}>}
 */
export const buildSheetsData = (backup) => {
  const {
    accounts, categories, operations, budgets, planned_operations, balance_history,
    budget_plans, budget_plan_lines,
  } = backup.data;

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
    {
      range: 'Budget Plans!A1',
      values: [
        ['id', 'month', 'currency', 'expected_income'],
        ...(budget_plans || []).map(p => [
          p.id, p.month, p.currency, p.expected_income ?? '0',
        ]),
      ],
    },
    {
      range: 'Budget Plan Lines!A1',
      values: [
        ['id', 'plan_id', 'label', 'amount', 'comment', 'category', 'account', 'category_id', 'to_account_id', 'sort_order'],
        ...(budget_plan_lines || []).map(l => [
          l.id, l.plan_id, l.label || '', l.amount, l.comment || '',
          categoryNames.get(l.category_id) || '',
          l.to_account_id ? (accountNames.get(l.to_account_id) || '') : '',
          l.category_id || '',
          l.to_account_id || '',
          l.sort_order ?? 0,
        ]),
      ],
    },
  ];
};

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

  const sheetNames = ['Accounts', 'Operations', 'Categories', 'Budgets', 'Planned Operations', 'Balance History', 'Budget Plans', 'Budget Plan Lines'];
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
  const budgetPlanRows = findSheet('Budget Plans');
  const budgetPlanLineRows = findSheet('Budget Plan Lines');

  // Build lookup maps: id->id (direct) and name->id (fallback)
  const accountIdMap = new Map();
  accountRows.forEach(a => {
    if (a.name) accountIdMap.set(a.name, String(a.id));
    if (a.id !== '' && a.id != null) accountIdMap.set(String(a.id), String(a.id));
  });

  const categoryIdMap = new Map();
  categoryRows.forEach(c => {
    if (c.name) categoryIdMap.set(c.name, String(c.id));
    if (c.id !== '' && c.id != null) categoryIdMap.set(String(c.id), String(c.id));
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
    source_currency: o.currency || null,
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

  const budget_plans = budgetPlanRows.map(p => ({
    id: p.id,
    month: p.month,
    currency: p.currency,
    expected_income: p.expected_income || '0',
    created_at: now,
    updated_at: now,
  }));

  const budget_plan_lines = budgetPlanLineRows.map(l => ({
    id: l.id,
    plan_id: l.plan_id,
    label: l.label || null,
    amount: l.amount,
    comment: l.comment || null,
    // Exactly one target: resolve category or account, whichever the row carries.
    category_id: (l.category || l.category_id) ? resolveCategoryId(l, 'category_id', 'category') : null,
    to_account_id: (l.account || l.to_account_id) ? resolveAccountId(l, 'to_account_id', 'account') : null,
    sort_order: (l.sort_order !== '' && l.sort_order != null) ? Number(l.sort_order) : 0,
    created_at: now,
    updated_at: now,
  }));

  // Preserve current app preferences (language, theme, etc.) so they survive the restore.
  // Do NOT catch DB errors here — a locked or corrupted DB must abort the import loudly
  // rather than silently overwriting all user preferences with an empty set (#747).
  const app_metadata = await queryAll('SELECT * FROM app_metadata WHERE key != ?', ['db_version']);

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
      app_metadata,
      balance_history,
      planned_operations,
      budget_plans,
      budget_plan_lines,
    },
  };
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
        { properties: { title: 'Budget Plans' } },
        { properties: { title: 'Budget Plan Lines' } },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'create_spreadsheet_failed');
  }
  return data.spreadsheetId;
};

const getSheetIds = async (accessToken, spreadsheetId, sheetNames) => {
  const response = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error?.message || 'get_sheet_ids_failed');
  }
  const data = await response.json();
  const nameToId = new Map(data.sheets.map(s => [s.properties.title, s.properties.sheetId]));
  return sheetNames.map(name => nameToId.get(name)).filter(id => id !== undefined);
};

const applyFilters = async (accessToken, spreadsheetId, sheetIds) => {
  const requests = sheetIds.map(sheetId => ({
    setBasicFilter: {
      filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0 } },
    },
  }));
  const response = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
  if (!response.ok) {
    const data = await response.json();
    if (response.status === 401) {
      await signOut();
      throw new Error('refresh_failed');
    }
    throw new Error(data.error?.message || 'apply_filters_failed');
  }
  await response.json().catch(() => {});
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
 * @param {Function} [onProgress] - Optional callback({ step, status }) for progress reporting.
 *   Steps: 'connect' | 'clear' | 'write'. Statuses: 'in_progress' | 'completed'.
 * @returns {Promise<string>} URL of the spreadsheet
 */
export const exportToSheets = async (accessToken, backup, onProgress) => {
  const report = (step, status) => onProgress?.({ step, status });

  report('connect', 'in_progress');
  let spreadsheetId = await getPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID);
  if (!spreadsheetId) {
    spreadsheetId = await createSpreadsheet(accessToken);
    await setPreference(PREF_KEYS.GOOGLE_SHEETS_SPREADSHEET_ID, spreadsheetId);
  }
  report('connect', 'completed');

  const sheets = buildSheetsData(backup);
  const sheetNames = sheets.map(s => s.range.split('!')[0]);

  report('clear', 'in_progress');
  await clearSheets(accessToken, spreadsheetId, sheetNames);
  report('clear', 'completed');

  report('write', 'in_progress');
  await writeSheets(accessToken, spreadsheetId, sheets);
  const sheetIds = await getSheetIds(accessToken, spreadsheetId, sheetNames);
  await applyFilters(accessToken, spreadsheetId, sheetIds);
  report('write', 'completed');

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
};

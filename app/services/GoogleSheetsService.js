import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
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
